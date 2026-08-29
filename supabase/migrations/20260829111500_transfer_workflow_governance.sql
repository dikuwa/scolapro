-- Learner transfers preserve longitudinal history and must not skip approval.
-- Source managers may create requested transfers, but status/provenance changes are
-- governed RPC transitions rather than ordinary row updates.

revoke update, delete on table public.transfer_events from authenticated;

create or replace function public.approve_learner_transfer(
  p_transfer_id uuid,
  p_effective_on date default null,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
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
  if v_transfer.status<>'requested' then
    raise exception 'Only requested transfers can be approved';
  end if;
  if v_transfer.destination_school_id=v_transfer.source_school_id then
    raise exception 'Transfer destination must differ from the source school';
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
    raise exception 'Only a current source enrolment can be transferred';
  end if;

  v_effective:=coalesce(p_effective_on,v_transfer.effective_on,current_date);
  if v_effective<v_transfer.requested_on then
    raise exception 'Transfer effective date cannot precede request date';
  end if;
  if v_effective<v_enrolment.enrolled_from then
    raise exception 'Transfer effective date cannot precede enrolment start';
  end if;

  update public.transfer_events
  set status='approved',
      effective_on=v_effective,
      approved_by_user_id=auth.uid(),
      approved_at=now(),
      decision_note=coalesce(nullif(btrim(coalesce(p_note,'')),''),decision_note),
      updated_at=now()
  where id=v_transfer.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values (
    v_transfer.tenant_id,v_transfer.source_school_id,auth.uid(),
    'learner.transfer.approved','transfer_event',v_transfer.id,
    jsonb_build_object(
      'learner_id',v_transfer.learner_id,
      'source_enrolment_id',v_transfer.source_enrolment_id,
      'effective_on',v_effective,
      'destination_school_id',v_transfer.destination_school_id,
      'destination_name',v_transfer.destination_name,
      'note',nullif(btrim(coalesce(p_note,'')),'')
    )
  );

  return true;
end;
$$;

create or replace function public.cancel_learner_transfer(
  p_transfer_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_transfer public.transfer_events%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'Cancellation reason is required';
  end if;

  select * into v_transfer
  from public.transfer_events
  where id=p_transfer_id
  for update;
  if not found then raise exception 'Transfer not found'; end if;
  if not app_private.can_manage_enrolment_workflow(v_transfer.source_school_id) then
    raise exception 'Permission denied';
  end if;
  if v_transfer.status not in ('requested','approved') then
    raise exception 'Only open transfers can be cancelled';
  end if;

  update public.transfer_events
  set status='cancelled',
      decision_note=btrim(p_reason),
      updated_at=now()
  where id=v_transfer.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values (
    v_transfer.tenant_id,v_transfer.source_school_id,auth.uid(),
    'learner.transfer.cancelled','transfer_event',v_transfer.id,
    jsonb_build_object('learner_id',v_transfer.learner_id,'reason',btrim(p_reason))
  );

  return true;
end;
$$;

create or replace function public.complete_learner_transfer(p_transfer_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
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

revoke all on function public.approve_learner_transfer(uuid,date,text) from public,anon;
grant execute on function public.approve_learner_transfer(uuid,date,text) to authenticated;
revoke all on function public.cancel_learner_transfer(uuid,text) from public,anon;
grant execute on function public.cancel_learner_transfer(uuid,text) to authenticated;
revoke all on function public.complete_learner_transfer(uuid) from public,anon;
grant execute on function public.complete_learner_transfer(uuid) to authenticated;

comment on function public.approve_learner_transfer(uuid,date,text) is
'Governed requested-to-approved transfer transition. Approval never closes the source enrolment.';
comment on function public.complete_learner_transfer(uuid) is
'Completes only an already-approved transfer and closes the source enrolment on the approved effective date while preserving historical records.';