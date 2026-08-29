-- Deterministic staff import reconciliation and commit.
-- Employee number is the stable tenant identity signal for bulk staff onboarding.
-- Names are never used to merge different staff identities.

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

create or replace function public.commit_staff_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_batch public.import_batches%rowtype;
  v_row public.import_rows%rowtype;
  v_staff_id uuid;
  v_employee text;
  v_assignment_type text;
  v_position_title text;
  v_effective_from date;
  v_created integer:=0;
  v_linked integer:=0;
  v_skipped integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_batch from public.import_batches where id=p_batch_id for update;
  if not found then raise exception 'Import batch not found'; end if;
  if v_batch.import_type<>'staff' then raise exception 'This commit function only supports staff imports'; end if;
  if not app_private.has_school_role(v_batch.school_id,array['school_admin']) and not app_private.has_platform_role(array['platform_admin']) then
    raise exception 'Only a school administrator can commit staff imports';
  end if;
  if v_batch.status<>'ready' then raise exception 'Import batch must be ready before commit'; end if;
  if exists(select 1 from public.import_rows where batch_id=v_batch.id and resolution in ('review','error','update')) then
    raise exception 'Staff import contains unresolved or unsupported reconciliation rows';
  end if;

  update public.import_batches set status='committing',updated_at=now() where id=v_batch.id;

  for v_row in select * from public.import_rows where batch_id=v_batch.id order by row_number
  loop
    if v_row.resolution='skip' then
      insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message)
      values(v_batch.id,v_row.id,'staff_member',v_row.matched_entity_id,'skipped','Existing active school staff assignment retained')
      on conflict(import_row_id) do nothing;
      v_skipped:=v_skipped+1;
      continue;
    end if;

    v_employee:=nullif(upper(btrim(coalesce(v_row.normalized_data->>'employee_number',''))),'');
    v_assignment_type:=coalesce(nullif(lower(btrim(v_row.normalized_data->>'assignment_type')),''),'staff');
    if v_assignment_type not in ('staff','teacher','management','support','temporary','other') then
      raise exception 'Row % has invalid assignment type',v_row.row_number;
    end if;
    v_position_title:=nullif(btrim(coalesce(v_row.normalized_data->>'position_title','')),'');
    v_effective_from:=coalesce(nullif(v_row.normalized_data->>'effective_from','')::date,current_date);

    if v_row.resolution='create' then
      if v_employee is null or nullif(btrim(coalesce(v_row.normalized_data->>'first_name','')),'') is null or nullif(btrim(coalesce(v_row.normalized_data->>'last_name','')),'') is null then
        raise exception 'Row % is missing required staff identity fields',v_row.row_number;
      end if;
      insert into public.staff_members(tenant_id,employee_number,first_name,last_name,status)
      values(v_batch.tenant_id,v_employee,btrim(v_row.normalized_data->>'first_name'),btrim(v_row.normalized_data->>'last_name'),'active')
      returning id into v_staff_id;
      perform public.assign_staff_to_school(v_batch.school_id,v_staff_id,v_assignment_type,v_position_title,v_effective_from,null);
      insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message)
      values(v_batch.id,v_row.id,'staff_member',v_staff_id,'created','Created staff identity and school assignment');
      update public.import_rows set matched_entity_type='staff_member',matched_entity_id=v_staff_id,updated_at=now() where id=v_row.id;
      v_created:=v_created+1;
    elsif v_row.resolution='link' then
      if v_row.matched_entity_id is null then raise exception 'Row % has no matched staff identity',v_row.row_number; end if;
      select id into v_staff_id from public.staff_members where id=v_row.matched_entity_id and tenant_id=v_batch.tenant_id;
      if v_staff_id is null then raise exception 'Matched staff identity is outside the tenant'; end if;
      perform public.assign_staff_to_school(v_batch.school_id,v_staff_id,v_assignment_type,v_position_title,v_effective_from,null);
      insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message)
      values(v_batch.id,v_row.id,'staff_member',v_staff_id,'linked','Linked existing tenant staff identity to school');
      v_linked:=v_linked+1;
    else
      raise exception 'Row % is not ready for staff commit',v_row.row_number;
    end if;
  end loop;

  update public.import_batches set status='completed',committed_at=now(),updated_at=now() where id=v_batch.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_batch.tenant_id,v_batch.school_id,auth.uid(),'import.staff.committed','import_batch',v_batch.id,
    jsonb_build_object('created',v_created,'linked',v_linked,'skipped',v_skipped,'total_rows',v_batch.total_rows));
  return jsonb_build_object('batch_id',v_batch.id,'created',v_created,'linked',v_linked,'skipped',v_skipped);
end;
$$;

revoke all on function public.reconcile_staff_import_batch(uuid) from public,anon;
grant execute on function public.reconcile_staff_import_batch(uuid) to authenticated;
revoke all on function public.commit_staff_import_batch(uuid) from public,anon;
grant execute on function public.commit_staff_import_batch(uuid) to authenticated;

comment on function public.reconcile_staff_import_batch(uuid) is
'Reconciles staff imports only by exact tenant employee number. Name-only matching never merges staff identities.';
