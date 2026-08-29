-- Duplicate employee numbers are a reconciliation concern, not a staging
-- uniqueness concern. Preserve every source row, mark ambiguous duplicates as
-- explicit errors, and never discard one row because another arrived first.

drop index if exists public.import_rows_batch_employee_number_unique_idx;

create or replace function public.reconcile_staff_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_batch public.import_batches%rowtype;
  v_row public.import_rows%rowtype;
  v_employee text;
  v_first text;
  v_last text;
  v_staff public.staff_members%rowtype;
  v_has_assignment boolean;
  v_create integer:=0;
  v_link integer:=0;
  v_skip integer:=0;
  v_review integer:=0;
  v_error integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_batch from public.import_batches where id=p_batch_id for update;
  if not found then raise exception 'Import batch not found'; end if;
  if v_batch.import_type<>'staff' then raise exception 'Only staff batches can be reconciled'; end if;
  if not app_private.can_manage_school_imports(v_batch.school_id) then raise exception 'Permission denied'; end if;
  if v_batch.status not in ('staging','validating','review') then raise exception 'Import batch is not editable'; end if;

  update public.import_batches set status='validating',updated_at=now() where id=v_batch.id;

  -- Reset prior duplicate errors before re-evaluating so reconciliation is
  -- deterministic if a staged row was corrected and run again.
  update public.import_rows
  set issues=(select coalesce(jsonb_agg(issue),'[]'::jsonb)
              from jsonb_array_elements(issues) issue
              where issue->>'code' is distinct from 'duplicate_employee_number'),
      resolution=case when resolution='error' and exists(
        select 1 from jsonb_array_elements(issues) issue where issue->>'code'='duplicate_employee_number'
      ) then 'review' else resolution end,
      updated_at=now()
  where batch_id=v_batch.id
    and exists(select 1 from jsonb_array_elements(issues) issue where issue->>'code'='duplicate_employee_number');

  with duplicated as (
    select upper(btrim(normalized_data->>'employee_number')) as employee_number
    from public.import_rows
    where batch_id=v_batch.id
      and nullif(btrim(normalized_data->>'employee_number'),'') is not null
    group by upper(btrim(normalized_data->>'employee_number'))
    having count(*)>1
  )
  update public.import_rows r
  set resolution='error',matched_entity_type=null,matched_entity_id=null,
      issues=r.issues || jsonb_build_array(jsonb_build_object(
        'level','error','field','employee_number','code','duplicate_employee_number',
        'message','Employee number appears more than once in this import batch. Resolve the duplicate source rows before commit.'
      )),updated_at=now()
  from duplicated d
  where r.batch_id=v_batch.id
    and upper(btrim(r.normalized_data->>'employee_number'))=d.employee_number;

  for v_row in select * from public.import_rows where batch_id=v_batch.id order by row_number
  loop
    if v_row.resolution='error' then v_error:=v_error+1; continue; end if;
    if v_row.resolution='skip' then v_skip:=v_skip+1; continue; end if;

    v_employee:=nullif(upper(btrim(coalesce(v_row.normalized_data->>'employee_number',''))),'');
    v_first:=nullif(btrim(coalesce(v_row.normalized_data->>'first_name','')),'');
    v_last:=nullif(btrim(coalesce(v_row.normalized_data->>'last_name','')),'');

    if v_employee is null then
      update public.import_rows set resolution='error',matched_entity_type=null,matched_entity_id=null,
        issues=issues || jsonb_build_array(jsonb_build_object('level','error','field','employee_number','message','Employee number is required for deterministic staff import identity.')),
        updated_at=now() where id=v_row.id;
      v_error:=v_error+1;
      continue;
    end if;
    if v_first is null or v_last is null then
      update public.import_rows set resolution='error',matched_entity_type=null,matched_entity_id=null,
        issues=issues || jsonb_build_array(jsonb_build_object('level','error','field','name','message','First name and last name are required.')),
        updated_at=now() where id=v_row.id;
      v_error:=v_error+1;
      continue;
    end if;

    select * into v_staff from public.staff_members
    where tenant_id=v_batch.tenant_id and upper(btrim(employee_number))=v_employee
    order by created_at limit 1;

    if not found then
      update public.import_rows set resolution='create',matched_entity_type=null,matched_entity_id=null,
        normalized_data=jsonb_set(v_row.normalized_data,'{employee_number}',to_jsonb(v_employee),true),updated_at=now()
      where id=v_row.id;
      v_create:=v_create+1;
      continue;
    end if;

    if lower(btrim(v_staff.first_name))<>lower(v_first) or lower(btrim(v_staff.last_name))<>lower(v_last) then
      update public.import_rows set resolution='review',matched_entity_type='staff_member',matched_entity_id=v_staff.id,
        issues=issues || jsonb_build_array(jsonb_build_object('level','warning','field','employee_number','message','Employee number matches an existing staff identity but the name differs. Review manually; names are never used to overwrite identity.')),
        updated_at=now() where id=v_row.id;
      v_review:=v_review+1;
      continue;
    end if;

    select exists(
      select 1 from public.staff_school_assignments ssa
      where ssa.school_id=v_batch.school_id and ssa.staff_member_id=v_staff.id
        and ssa.effective_from<=current_date and (ssa.effective_to is null or ssa.effective_to>=current_date)
    ) into v_has_assignment;

    if v_has_assignment then
      update public.import_rows set resolution='skip',matched_entity_type='staff_member',matched_entity_id=v_staff.id,
        issues=issues || jsonb_build_array(jsonb_build_object('level','warning','field','employee_number','message','Existing staff member is already actively assigned to this school; row will be skipped.')),
        updated_at=now() where id=v_row.id;
      v_skip:=v_skip+1;
    else
      update public.import_rows set resolution='link',matched_entity_type='staff_member',matched_entity_id=v_staff.id,
        issues=issues || jsonb_build_array(jsonb_build_object('level','warning','field','employee_number','message','Existing tenant staff identity matched exactly and will be linked to this school.')),
        updated_at=now() where id=v_row.id;
      v_link:=v_link+1;
    end if;
  end loop;

  update public.import_batches b set
    total_rows=(select count(*) from public.import_rows r where r.batch_id=b.id),
    valid_rows=(select count(*) from public.import_rows r where r.batch_id=b.id and r.resolution in ('create','update','link','skip')),
    warning_rows=(select count(*) from public.import_rows r where r.batch_id=b.id and jsonb_array_length(r.issues)>0 and r.resolution<>'error'),
    error_rows=(select count(*) from public.import_rows r where r.batch_id=b.id and r.resolution='error'),
    status='review',updated_at=now()
  where b.id=v_batch.id;

  return jsonb_build_object('create',v_create,'link',v_link,'skip',v_skip,'review',v_review,'error',v_error);
end;
$$;

revoke all on function public.reconcile_staff_import_batch(uuid) from public,anon;
grant execute on function public.reconcile_staff_import_batch(uuid) to authenticated;

comment on function public.reconcile_staff_import_batch(uuid) is
'Reconciles staff imports by exact tenant employee number, preserving all staged rows and explicitly blocking duplicate employee numbers in the same batch.';
