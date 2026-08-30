-- Reconcile staff school assignments against the imported effective period rather
-- than only against current_date. Staff imports create open-ended placements, so
-- a later assignment at the same school is an explicit review conflict instead
-- of being allowed through reconciliation and failing only during commit.

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
  v_effective_from date;
  v_staff public.staff_members%rowtype;
  v_has_assignment boolean;
  v_has_future_overlap boolean;
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

  -- Reset prior duplicate and assignment-period reconciliation issues before
  -- re-evaluating so corrected staged rows can be reconciled deterministically.
  update public.import_rows
  set issues=(select coalesce(jsonb_agg(issue),'[]'::jsonb)
              from jsonb_array_elements(issues) issue
              where issue->>'code' is distinct from 'duplicate_employee_number'
                and issue->>'code' is distinct from 'assignment_period_conflict'),
      resolution=case when resolution='error' and exists(
        select 1 from jsonb_array_elements(issues) issue where issue->>'code'='duplicate_employee_number'
      ) then 'review' else resolution end,
      updated_at=now()
  where batch_id=v_batch.id
    and exists(
      select 1 from jsonb_array_elements(issues) issue
      where issue->>'code' in ('duplicate_employee_number','assignment_period_conflict')
    );

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

    begin
      v_effective_from:=coalesce(nullif(v_row.normalized_data->>'effective_from','')::date,current_date);
    exception when invalid_datetime_format or datetime_field_overflow then
      update public.import_rows set resolution='error',matched_entity_type=null,matched_entity_id=null,
        issues=issues || jsonb_build_array(jsonb_build_object(
          'level','error','field','effective_from','code','invalid_effective_from',
          'message','Effective-from date is invalid.'
        )),updated_at=now() where id=v_row.id;
      v_error:=v_error+1;
      continue;
    end;

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

    -- If the staff member is already assigned on the requested start date, the
    -- imported placement is idempotent for school membership and is skipped.
    select exists(
      select 1 from public.staff_school_assignments ssa
      where ssa.school_id=v_batch.school_id and ssa.staff_member_id=v_staff.id
        and ssa.effective_from<=v_effective_from
        and (ssa.effective_to is null or ssa.effective_to>=v_effective_from)
    ) into v_has_assignment;

    if v_has_assignment then
      update public.import_rows set resolution='skip',matched_entity_type='staff_member',matched_entity_id=v_staff.id,
        issues=issues || jsonb_build_array(jsonb_build_object(
          'level','warning','field','effective_from',
          'message','Existing staff member is already assigned to this school on the imported effective date; row will be skipped.'
        )),updated_at=now() where id=v_row.id;
      v_skip:=v_skip+1;
      continue;
    end if;

    -- Staff import placements are currently open-ended. A later placement at
    -- this school would therefore overlap the imported interval and needs a
    -- human decision instead of a commit-time trigger failure.
    select exists(
      select 1 from public.staff_school_assignments ssa
      where ssa.school_id=v_batch.school_id and ssa.staff_member_id=v_staff.id
        and ssa.effective_from>v_effective_from
    ) into v_has_future_overlap;

    if v_has_future_overlap then
      update public.import_rows set resolution='review',matched_entity_type='staff_member',matched_entity_id=v_staff.id,
        issues=issues || jsonb_build_array(jsonb_build_object(
          'level','warning','field','effective_from','code','assignment_period_conflict',
          'message','The imported open-ended placement would overlap a later assignment at this school. Review the effective dates before commit.'
        )),updated_at=now() where id=v_row.id;
      v_review:=v_review+1;
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
'Reconciles staff imports by exact tenant employee number and the imported school-assignment effective period. Existing coverage is idempotent; future overlap requires review.';
