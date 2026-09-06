-- Bind attendance provenance to the human authority that actually recorded it.
-- The public RPCs already derive recorded_by_user_id from auth.uid(); these physical
-- guards close trusted/service-role and direct-table spoofing gaps without changing
-- the append/replacement attendance model.

create or replace function app_private.user_can_record_daily_attendance(
  p_user_id uuid,
  p_school_id uuid
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
      from public.platform_memberships pm
      where pm.user_id = p_user_id
        and pm.role_key = 'platform_admin'
        and pm.active_from <= current_date
        and (pm.active_to is null or pm.active_to >= current_date)
    )
    or exists (
      select 1
      from public.school_memberships sm
      where sm.school_id = p_school_id
        and sm.user_id = p_user_id
        and sm.role_key in ('school_admin','principal','deputy_principal','hod','teacher','class_teacher')
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
    )
  );
$$;

revoke all on function app_private.user_can_record_daily_attendance(uuid,uuid)
from public, anon, authenticated;

comment on function app_private.user_can_record_daily_attendance(uuid,uuid) is
'Arbitrary-user mirror of the existing daily attendance recording boundary: active Platform Admin or active school attendance role.';

create or replace function app_private.user_can_record_subject_attendance(
  p_user_id uuid,
  p_timetable_slot_id uuid,
  p_on_date date
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select p_user_id is not null and exists (
    select 1
    from public.timetable_slots ts
    join public.teacher_allocations ta
      on ta.id = ts.teacher_allocation_id
    join public.staff_members assigned_staff
      on assigned_staff.id = ta.staff_member_id
    where ts.id = p_timetable_slot_id
      and ts.status = 'active'
      and ta.active_from <= p_on_date
      and (ta.active_to is null or ta.active_to >= p_on_date)
      and (
        (
          assigned_staff.user_id = p_user_id
          and assigned_staff.status = 'active'
          and app_private.staff_member_has_school_assignment(assigned_staff.id,ts.school_id,p_on_date)
        )
        or exists (
          select 1
          from public.school_memberships sm
          where sm.school_id = ts.school_id
            and sm.user_id = p_user_id
            and sm.role_key in ('school_admin','principal','deputy_principal','hod')
            and sm.active_from <= current_date
            and (sm.active_to is null or sm.active_to >= current_date)
        )
        or exists (
          select 1
          from public.platform_memberships pm
          where pm.user_id = p_user_id
            and pm.role_key = 'platform_admin'
            and pm.active_from <= current_date
            and (pm.active_to is null or pm.active_to >= current_date)
        )
      )
  );
$$;

revoke all on function app_private.user_can_record_subject_attendance(uuid,uuid,date)
from public, anon, authenticated;

comment on function app_private.user_can_record_subject_attendance(uuid,uuid,date) is
'Arbitrary-user mirror of subject-period attendance authority: the date-valid allocated teacher with active school placement, current school leadership/HOD, or Platform Admin.';

create or replace function app_private.enforce_daily_attendance_submission_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if tg_op = 'UPDATE' and new.recorded_by_user_id is distinct from old.recorded_by_user_id then
    raise exception 'Daily attendance recorder provenance is immutable';
  end if;

  if auth.uid() is not null and new.recorded_by_user_id is distinct from auth.uid() then
    raise exception 'Daily attendance recorder must match authenticated actor';
  end if;

  if not app_private.user_can_record_daily_attendance(new.recorded_by_user_id,new.school_id) then
    raise exception 'Daily attendance recorder is not authorized for school';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_daily_attendance_submission_actor_integrity()
from public, anon, authenticated;

drop trigger if exists daily_attendance_submission_actor_integrity_trg on public.attendance_register_submissions;
drop trigger if exists zz_daily_attendance_submission_actor_integrity_trg on public.attendance_register_submissions;
create trigger zz_daily_attendance_submission_actor_integrity_trg
before insert or update of recorded_by_user_id, school_id
on public.attendance_register_submissions
for each row execute function app_private.enforce_daily_attendance_submission_actor_integrity();

create or replace function app_private.enforce_subject_attendance_submission_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if tg_op = 'UPDATE' and new.recorded_by_user_id is distinct from old.recorded_by_user_id then
    raise exception 'Subject attendance recorder provenance is immutable';
  end if;

  if auth.uid() is not null and new.recorded_by_user_id is distinct from auth.uid() then
    raise exception 'Subject attendance recorder must match authenticated actor';
  end if;

  if not app_private.user_can_record_subject_attendance(
    new.recorded_by_user_id,
    new.timetable_slot_id,
    new.attendance_date
  ) then
    raise exception 'Subject attendance recorder is not authorized for timetable slot and date';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_subject_attendance_submission_actor_integrity()
from public, anon, authenticated;

drop trigger if exists subject_attendance_submission_actor_integrity_trg on public.subject_attendance_submissions;
drop trigger if exists zz_subject_attendance_submission_actor_integrity_trg on public.subject_attendance_submissions;
create trigger zz_subject_attendance_submission_actor_integrity_trg
before insert or update of recorded_by_user_id, school_id, timetable_slot_id, attendance_date
on public.subject_attendance_submissions
for each row execute function app_private.enforce_subject_attendance_submission_actor_integrity();

create or replace function app_private.enforce_attendance_event_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if tg_op = 'UPDATE' and new.recorded_by_user_id is distinct from old.recorded_by_user_id then
    raise exception 'Attendance event recorder provenance is immutable';
  end if;

  if auth.uid() is not null and new.recorded_by_user_id is distinct from auth.uid() then
    raise exception 'Attendance event recorder must match authenticated actor';
  end if;

  if new.observation_type = 'subject_period' then
    if new.timetable_slot_id is null
       or not app_private.user_can_record_subject_attendance(
         new.recorded_by_user_id,
         new.timetable_slot_id,
         new.attendance_date
       ) then
      raise exception 'Attendance event recorder is not authorized for subject timetable slot and date';
    end if;
  elsif not app_private.user_can_record_daily_attendance(new.recorded_by_user_id,new.school_id) then
    raise exception 'Attendance event recorder is not authorized for school';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_attendance_event_actor_integrity()
from public, anon, authenticated;

drop trigger if exists attendance_event_actor_integrity_trg on public.attendance_events;
drop trigger if exists zz_attendance_event_actor_integrity_trg on public.attendance_events;
create trigger zz_attendance_event_actor_integrity_trg
before insert or update of recorded_by_user_id, school_id, observation_type, timetable_slot_id, attendance_date
on public.attendance_events
for each row execute function app_private.enforce_attendance_event_actor_integrity();

comment on function app_private.enforce_daily_attendance_submission_actor_integrity() is
'Prevents direct/trusted writes from forging daily-register recorder provenance and binds authenticated writes to auth.uid().';
comment on function app_private.enforce_subject_attendance_submission_actor_integrity() is
'Prevents direct/trusted writes from forging subject-register recorder provenance and preserves allocated-teacher/leadership authority.';
comment on function app_private.enforce_attendance_event_actor_integrity() is
'Binds attendance event provenance to daily or subject-period authority; subject-period events cannot bypass timetable allocation authority through the generic event path.';
