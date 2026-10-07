-- #1117: post-merge hardening for planned learner transfers.
-- Keep registered school discovery aligned with the authenticated cross-school
-- directory and prevent future-dated transfers from ending enrolment early.

create or replace function public.list_learner_transfer_destination_schools(p_source_school_id uuid)
returns table(
  school_id uuid,
  school_name text,
  emis_number text,
  town text,
  physical_address text
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_enrolment_workflow(p_source_school_id) then
    raise exception 'Permission denied';
  end if;

  return query
  select
    d.school_id,
    d.school_name,
    d.emis_number,
    d.town,
    d.physical_address
  from public.search_school_directory(null,null,null) d
  where d.school_id<>p_source_school_id
  order by d.school_name,d.school_id;
end;
$$;

revoke all on function public.list_learner_transfer_destination_schools(uuid) from public,anon;
grant execute on function public.list_learner_transfer_destination_schools(uuid) to authenticated;

create or replace function public.complete_learner_transfer(p_transfer_id uuid)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_transfer public.transfer_events%rowtype;
  v_enrolment public.enrolments%rowtype;
  v_effective date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_transfer
  from public.transfer_events
  where id=p_transfer_id
  for update;
  if not found then raise exception 'Transfer not found'; end if;
  if not app_private.can_manage_enrolment_workflow(v_transfer.source_school_id) then
    raise exception 'Permission denied';
  end if;
  if v_transfer.status<>'approved' then
    raise exception 'Only approved transfers can be completed';
  end if;
  if v_transfer.approved_by_user_id is null or v_transfer.approved_at is null then
    raise exception 'Transfer approval provenance is incomplete';
  end if;

  select * into v_enrolment
  from public.enrolments
  where id=v_transfer.source_enrolment_id
  for update;
  if not found
     or v_enrolment.learner_id<>v_transfer.learner_id
     or v_enrolment.school_id<>v_transfer.source_school_id then
    raise exception 'Source enrolment does not match transfer';
  end if;
  if v_enrolment.status<>'current' then
    raise exception 'Source enrolment is no longer current';
  end if;

  v_effective:=coalesce(v_transfer.effective_on,current_date);
  if v_effective<v_enrolment.enrolled_from then
    raise exception 'Transfer date cannot be before enrolment start';
  end if;
  if v_effective>current_date then
    raise exception 'Transfer cannot be completed before the effective departure date';
  end if;

  update public.enrolments
  set status='transferred',
      enrolled_to=v_effective,
      updated_at=now()
  where id=v_enrolment.id;

  update public.transfer_events
  set status='completed',
      effective_on=v_effective,
      completed_at=now(),
      updated_at=now()
  where id=v_transfer.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values (
    v_transfer.tenant_id,v_transfer.source_school_id,auth.uid(),
    'learner.transfer.completed','transfer_event',v_transfer.id,
    jsonb_build_object(
      'learner_id',v_transfer.learner_id,
      'source_enrolment_id',v_transfer.source_enrolment_id,
      'effective_on',v_effective,
      'destination_school_id',v_transfer.destination_school_id,
      'destination_name',v_transfer.destination_name
    )
  );

  return true;
end;
$$;

revoke all on function public.complete_learner_transfer(uuid) from public,anon;
grant execute on function public.complete_learner_transfer(uuid) to authenticated;


create or replace function public.validate_learner_transfer_destination(
  p_source_school_id uuid,
  p_destination_school_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_enrolment_workflow(p_source_school_id) then
    raise exception 'Permission denied';
  end if;

  return exists(
    select 1
    from public.search_school_directory(null,null,null) d
    where d.school_id=p_destination_school_id
      and d.school_id<>p_source_school_id
  );
end;
$$;

revoke all on function public.validate_learner_transfer_destination(uuid,uuid) from public,anon;
grant execute on function public.validate_learner_transfer_destination(uuid,uuid) to authenticated;
