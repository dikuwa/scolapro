-- Bind late-arrival recording and detention resolution provenance to actors who
-- actually hold the authority exercised by the existing public RPCs.  These
-- guards are intentionally physical-table protections as well: trusted/service
-- writes must not be able to manufacture an unrelated human actor.

create or replace function app_private.user_can_record_school_late_arrival(
  p_user_id uuid,
  p_school_id uuid,
  p_arrival_date date
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_user_id is not null and (
    exists (
      select 1
      from public.school_memberships sm
      where sm.school_id = p_school_id
        and sm.user_id = p_user_id
        and sm.role_key in ('school_admin','principal','deputy_principal')
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
    )
    or exists (
      select 1
      from public.school_duty_assignments d
      join public.staff_members staff
        on staff.id = d.staff_member_id
       and staff.user_id = p_user_id
       and staff.status = 'active'
      where d.school_id = p_school_id
        and d.duty_key = 'late_arrival_recorder'
        and d.active_from <= p_arrival_date
        and (d.active_to is null or d.active_to >= p_arrival_date)
    )
  );
$$;

revoke all on function app_private.user_can_record_school_late_arrival(uuid,uuid,date)
from public, anon, authenticated;

comment on function app_private.user_can_record_school_late_arrival(uuid,uuid,date) is
'Arbitrary-user mirror of the existing late-arrival recording boundary: current school leadership or an active date-valid late-arrival duty assignee.';

create or replace function app_private.user_can_resolve_late_detention(
  p_user_id uuid,
  p_obligation_id uuid,
  p_target_status text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  with obligation as (
    select o.*
    from public.late_detention_obligations o
    where o.id = p_obligation_id
  ),
  coordinator as (
    select exists (
      select 1
      from obligation o
      where exists (
        select 1
        from public.school_memberships sm
        where sm.school_id = o.school_id
          and sm.user_id = p_user_id
          and sm.role_key in ('school_admin','principal','deputy_principal')
          and sm.active_from <= current_date
          and (sm.active_to is null or sm.active_to >= current_date)
      )
      or exists (
        select 1
        from public.school_duty_assignments d
        join public.staff_members staff
          on staff.id = d.staff_member_id
         and staff.user_id = p_user_id
         and staff.status = 'active'
        where d.school_id = o.school_id
          and d.duty_key = 'late_arrival_recorder'
          and d.active_from <= current_date
          and (d.active_to is null or d.active_to >= current_date)
      )
    ) as allowed
  ),
  assigned_obligation_supervisor as (
    select exists (
      select 1
      from obligation o
      join public.staff_members staff
        on staff.id = o.assigned_staff_member_id
       and staff.user_id = p_user_id
       and staff.status = 'active'
      where p_target_status = 'completed'
        and o.status in ('pending','carried_forward')
        and app_private.staff_member_has_school_assignment(staff.id,o.school_id,o.due_on)
    ) as allowed
  ),
  assigned_session_supervisor as (
    select exists (
      select 1
      from obligation o
      join public.detention_session_items item
        on item.obligation_id = o.id
       and item.attendance_status = 'scheduled'
      join public.detention_sessions session
        on session.id = item.detention_session_id
       and session.school_id = o.school_id
       and session.status in ('planned','open')
      join public.staff_members staff
        on staff.user_id = p_user_id
       and staff.status = 'active'
       and app_private.staff_member_has_school_assignment(staff.id,session.school_id,session.session_date)
      where p_target_status = 'completed'
        and o.status in ('pending','carried_forward')
        and (
          item.assigned_supervisor_staff_member_id = staff.id
          or (
            item.assigned_supervisor_staff_member_id is null
            and session.supervisor_staff_member_id = staff.id
          )
        )
        and (
          session.supervisor_staff_member_id = staff.id
          or exists (
            select 1
            from public.detention_session_supervisors team
            where team.detention_session_id = session.id
              and team.staff_member_id = staff.id
          )
        )
    ) as allowed
  )
  select p_user_id is not null
     and p_target_status in ('completed','waived')
     and (
       (select allowed from coordinator)
       or (p_target_status = 'completed' and (select allowed from assigned_obligation_supervisor))
       or (p_target_status = 'completed' and (select allowed from assigned_session_supervisor))
     );
$$;

revoke all on function app_private.user_can_resolve_late_detention(uuid,uuid,text)
from public, anon, authenticated;

comment on function app_private.user_can_resolve_late_detention(uuid,uuid,text) is
'Arbitrary-user mirror of detention resolution authority, including leadership/duty coordination, due-date-valid assigned obligation supervisors, and learner-scoped session supervisors for completion only.';

create or replace function app_private.enforce_late_arrival_event_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if auth.uid() is not null
     and new.recorded_by_user_id is distinct from auth.uid() then
    raise exception 'Late arrival recorder must match authenticated actor';
  end if;

  if not app_private.user_can_record_school_late_arrival(
    new.recorded_by_user_id,
    new.school_id,
    new.arrival_date
  ) then
    raise exception 'Late arrival recorder is not authorized for school and arrival date';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_late_arrival_event_actor_integrity()
from public, anon, authenticated;

comment on function app_private.enforce_late_arrival_event_actor_integrity() is
'Physically binds every late-arrival event recorder to the authenticated actor when present and to legitimate recording authority for the event school/date.';

-- The scope trigger is deliberately named ...scope... and this trigger ...submit...
-- so PostgreSQL BEFORE-trigger alphabetical ordering preserves scope diagnostics
-- before actor-provenance diagnostics for malformed rows.
drop trigger if exists late_arrival_event_actor_integrity_trg
on public.school_late_arrival_events;
drop trigger if exists late_arrival_event_submit_actor_integrity_trg
on public.school_late_arrival_events;
create trigger late_arrival_event_submit_actor_integrity_trg
before insert or update of recorded_by_user_id, school_id, arrival_date
on public.school_late_arrival_events
for each row execute function app_private.enforce_late_arrival_event_actor_integrity();

create or replace function app_private.enforce_late_detention_resolution_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_resolution_started boolean;
begin
  if tg_op = 'INSERT' then
    if new.status in ('completed','waived')
       or new.completed_by_user_id is not null
       or new.completed_at is not null then
      raise exception 'Late detention obligations cannot be created as resolved';
    end if;
    return new;
  end if;

  if old.status in ('completed','waived') then
    if new.status is distinct from old.status
       or new.completed_by_user_id is distinct from old.completed_by_user_id
       or new.completed_at is distinct from old.completed_at
       or new.resolution_note is distinct from old.resolution_note then
      raise exception 'Late detention resolution provenance is immutable';
    end if;
    return new;
  end if;

  v_resolution_started := new.status in ('completed','waived')
    and old.status not in ('completed','waived');

  if v_resolution_started then
    if new.completed_by_user_id is null then
      raise exception 'Late detention resolution requires actor provenance';
    end if;

    if new.status = 'completed' and new.completed_at is null then
      raise exception 'Completed late detention requires completion timestamp';
    end if;

    if new.status = 'waived' and new.completed_at is not null then
      raise exception 'Waived late detention must not carry completion timestamp';
    end if;

    if auth.uid() is not null
       and new.completed_by_user_id is distinct from auth.uid() then
      raise exception 'Late detention resolver must match authenticated actor';
    end if;

    if not app_private.user_can_resolve_late_detention(
      new.completed_by_user_id,
      old.id,
      new.status
    ) then
      raise exception 'Late detention resolver is not authorized for this resolution';
    end if;
  elsif new.completed_by_user_id is not null
     or new.completed_at is not null then
    raise exception 'Late detention resolution provenance requires completed or waived status';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_late_detention_resolution_actor_integrity()
from public, anon, authenticated;

comment on function app_private.enforce_late_detention_resolution_actor_integrity() is
'Prevents trusted writes from manufacturing resolved detention obligations or forged resolver actors, mirrors complete/waive authority, and freezes terminal resolution provenance.';

-- Preserve the existing late_detention_obligation_scope_integrity_trg first.
drop trigger if exists late_detention_resolution_actor_integrity_trg
on public.late_detention_obligations;
drop trigger if exists late_detention_obligation_submit_resolution_actor_integrity_trg
on public.late_detention_obligations;
create trigger late_detention_obligation_submit_resolution_actor_integrity_trg
before insert or update of status, completed_by_user_id, completed_at,
  resolution_note, school_id, due_on, assigned_staff_member_id
on public.late_detention_obligations
for each row execute function app_private.enforce_late_detention_resolution_actor_integrity();
