-- Compatibility and lifecycle hardening for advance detention planning.

-- A pending obligation may be scheduled into only one session at a time. Once its
-- attendance outcome is absent/excused the obligation remains open and may be
-- scheduled again on a later date; attended outcomes resolve the obligation.
create unique index if not exists detention_session_items_one_scheduled_obligation_idx
  on public.detention_session_items(obligation_id)
  where attendance_status='scheduled';

-- RLS and session RPCs call this predicate as the signed-in role.
grant execute on function app_private.can_supervise_detention_session(uuid) to authenticated;

create or replace function public.create_detention_session(
  p_school_id uuid,
  p_session_date date,
  p_starts_at time default null,
  p_ends_at time default null,
  p_supervisor_staff_member_id uuid default null,
  p_location text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_tenant_id uuid;
  v_session_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_session_date is null then raise exception 'Detention date is required'; end if;
  if p_session_date<current_date then raise exception 'Past detention sessions cannot be planned'; end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at<=p_starts_at then
    raise exception 'Detention end time must be after the start time';
  end if;

  if not (
    app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])
    or app_private.has_school_duty(p_school_id,'late_arrival_recorder',p_session_date)
  ) then raise exception 'Permission denied'; end if;

  select tenant_id into v_tenant_id
  from public.schools
  where id=p_school_id;
  if v_tenant_id is null then raise exception 'School not found'; end if;

  if p_supervisor_staff_member_id is not null
    and not app_private.staff_member_has_school_assignment(p_supervisor_staff_member_id,p_school_id,p_session_date) then
    raise exception 'Supervisor is not assigned to this school on the detention date';
  end if;

  insert into public.detention_sessions(
    tenant_id,school_id,session_date,starts_at,ends_at,supervisor_staff_member_id,
    location,notes,created_by_user_id
  ) values(
    v_tenant_id,p_school_id,p_session_date,p_starts_at,p_ends_at,p_supervisor_staff_member_id,
    nullif(btrim(p_location),''),nullif(btrim(p_notes),''),auth.uid()
  ) returning id into v_session_id;

  if p_supervisor_staff_member_id is not null then
    insert into public.detention_session_supervisors(
      tenant_id,school_id,detention_session_id,staff_member_id,assigned_by_user_id
    ) values(
      v_tenant_id,p_school_id,v_session_id,p_supervisor_staff_member_id,auth.uid()
    ) on conflict(detention_session_id,staff_member_id) do nothing;
  end if;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_tenant_id,p_school_id,auth.uid(),'detention.session.created','detention_session',v_session_id,
    jsonb_build_object('session_date',p_session_date,'planned_in_advance',p_session_date>current_date)
  );

  return v_session_id;
end;
$$;

revoke all on function public.create_detention_session(uuid,date,time,time,uuid,text,text) from public,anon;
grant execute on function public.create_detention_session(uuid,date,time,time,uuid,text,text) to authenticated;

create or replace function public.populate_detention_session(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_session public.detention_sessions%rowtype;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_session
  from public.detention_sessions
  where id=p_session_id
  for update;
  if not found then raise exception 'Detention session not found'; end if;
  if not (
    app_private.has_school_role(v_session.school_id,array['school_admin','principal','deputy_principal'])
    or app_private.has_school_duty(v_session.school_id,'late_arrival_recorder',v_session.session_date)
  ) then raise exception 'Permission denied'; end if;
  if v_session.status not in ('planned','open') then raise exception 'Session cannot be populated in its current state'; end if;

  insert into public.detention_session_items(
    tenant_id,school_id,detention_session_id,obligation_id,learner_id
  )
  select o.tenant_id,o.school_id,v_session.id,o.id,o.learner_id
  from public.late_detention_obligations o
  where o.school_id=v_session.school_id
    and o.status in ('pending','carried_forward')
    and o.due_on<=v_session.session_date
  on conflict do nothing;

  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

revoke all on function public.populate_detention_session(uuid) from public,anon;
grant execute on function public.populate_detention_session(uuid) to authenticated;

comment on index public.detention_session_items_one_scheduled_obligation_idx is
'Prevents a still-scheduled detention obligation from appearing in multiple active session rosters. Absent/excused outcomes can be rescheduled later while attended outcomes resolve the obligation.';
