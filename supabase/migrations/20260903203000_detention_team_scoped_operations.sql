-- Team membership grants narrow session visibility. Ordinary supervisors may record
-- outcomes only for learners allocated to them; leadership/duty coordinators retain
-- whole-session operational oversight. Legacy single-supervisor sessions remain
-- compatible until a learner-specific planned allocation is made.

drop policy if exists "authorized staff read detention session duty teams" on public.detention_session_supervisors;
create policy "authorized staff read detention session duty teams"
on public.detention_session_supervisors
for select to authenticated
using (
  app_private.can_view_operational_learners(school_id)
  or exists (
    select 1
    from public.detention_sessions ds
    where ds.id=detention_session_id
      and app_private.has_school_duty(ds.school_id,'late_arrival_recorder',ds.session_date)
  )
  or exists (
    select 1 from public.staff_members sm
    where sm.id=staff_member_id and sm.user_id=(select auth.uid()) and sm.status='active'
  )
);

create or replace function public.record_detention_attendance(
  p_session_id uuid,
  p_obligation_id uuid,
  p_attendance_status text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_session public.detention_sessions%rowtype;
  v_item public.detention_session_items%rowtype;
  v_obligation public.late_detention_obligations%rowtype;
  v_caller_staff_id uuid;
  v_coordinator boolean;
  v_completed_obligation boolean := false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_attendance_status not in ('attended','absent','excused') then
    raise exception 'Invalid detention attendance status';
  end if;

  select * into v_session
  from public.detention_sessions
  where id=p_session_id
  for update;
  if not found then raise exception 'Detention session not found'; end if;

  v_coordinator := (
    app_private.has_school_role(v_session.school_id,array['school_admin','principal','deputy_principal'])
    or app_private.has_school_duty(v_session.school_id,'late_arrival_recorder',v_session.session_date)
  );

  if not v_coordinator and not app_private.can_supervise_detention_session(v_session.id) then
    raise exception 'Permission denied';
  end if;
  if v_session.status not in ('planned','open') then
    raise exception 'Session is not open for attendance';
  end if;

  select * into v_item
  from public.detention_session_items
  where detention_session_id=p_session_id
    and obligation_id=p_obligation_id
  for update;
  if not found then raise exception 'Detention session item not found'; end if;
  if v_item.attendance_status <> 'scheduled' then
    raise exception 'Detention attendance outcome is already recorded';
  end if;

  if not v_coordinator then
    select sm.id into v_caller_staff_id
    from public.staff_members sm
    where sm.user_id=auth.uid()
      and sm.status='active'
      and app_private.staff_member_has_school_assignment(sm.id,v_session.school_id,v_session.session_date)
    limit 1;

    -- Planned learner ownership is authoritative once present. For legacy sessions
    -- that predate learner-specific allocations, retain the established single
    -- session-supervisor behavior instead of invalidating historical workflows.
    if v_item.assigned_supervisor_staff_member_id is not null then
      if v_caller_staff_id is null
        or v_item.assigned_supervisor_staff_member_id is distinct from v_caller_staff_id then
        raise exception 'This learner is assigned to another detention supervisor';
      end if;
    elsif v_caller_staff_id is null
      or v_session.supervisor_staff_member_id is distinct from v_caller_staff_id then
      raise exception 'This learner is assigned to another detention supervisor';
    end if;
  end if;

  update public.detention_session_items
  set attendance_status=p_attendance_status,
      outcome_note=nullif(btrim(p_note),''),
      recorded_by_user_id=auth.uid(),
      recorded_at=now()
  where id=v_item.id;

  if p_attendance_status='attended' then
    select * into v_obligation
    from public.late_detention_obligations
    where id=p_obligation_id
    for update;

    update public.late_detention_obligations
    set status='completed',
        completed_at=now(),
        completed_by_user_id=auth.uid(),
        resolution_note=coalesce(nullif(btrim(p_note),''),resolution_note),
        updated_at=now()
    where id=p_obligation_id
      and status in ('pending','carried_forward');

    v_completed_obligation := found;

    if v_completed_obligation then
      insert into public.audit_events(
        tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
      ) values(
        v_obligation.tenant_id,
        v_obligation.school_id,
        auth.uid(),
        'late_detention.resolved',
        'learner',
        v_obligation.learner_id,
        jsonb_build_object(
          'obligation_id',v_obligation.id,
          'status','completed',
          'previous_status',v_obligation.status,
          'detention_session_id',v_session.id,
          'resolution_source','detention_session_attendance'
        )
      );
    end if;
  end if;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_session.tenant_id,
    v_session.school_id,
    auth.uid(),
    'detention.session.attendance_recorded',
    'detention_session_item',
    v_item.id,
    jsonb_build_object(
      'detention_session_id',v_session.id,
      'session_id',v_session.id,
      'obligation_id',v_item.obligation_id,
      'learner_id',v_item.learner_id,
      'attendance_status',p_attendance_status,
      'assigned_supervisor_staff_member_id',v_item.assigned_supervisor_staff_member_id,
      'completed_obligation',v_completed_obligation
    )
  );

  return true;
end;
$$;

revoke all on function public.record_detention_attendance(uuid,uuid,text,text) from public,anon;
grant execute on function public.record_detention_attendance(uuid,uuid,text,text) to authenticated;

comment on function public.record_detention_attendance(uuid,uuid,text,text) is
'Records one final detention outcome. Leadership and the date-valid late-arrival duty coordinator may operate the whole session; an ordinary duty-team supervisor may record only learners explicitly allocated to that staff identity, while legacy single-supervisor sessions retain compatibility until learner-specific planning is applied.';
