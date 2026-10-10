-- Issue #1214: bind official register capture to the assigned register teacher,
-- retain governed administrator corrections, and make subject-period writes
-- fail closed against the exact slot/allocation/period/group scope.

create or replace function app_private.can_record_register_class(target_register_class_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_school_id uuid;
begin
  select rc.school_id into v_school_id
  from public.register_classes rc
  where rc.id = target_register_class_id;

  if v_school_id is null then return false; end if;
  if not app_private.can_record_attendance(v_school_id) then
    raise exception 'Permission denied';
  end if;

  return exists (
    select 1
    from public.register_classes rc
    where rc.id = target_register_class_id
      and (
        app_private.has_platform_role(array['platform_admin'])
        or app_private.has_school_role(rc.school_id,array['school_admin','principal','deputy_principal'])
        or exists (
          select 1
          from public.school_memberships sm
          where sm.school_id = rc.school_id
            and sm.user_id = (select auth.uid())
            and sm.staff_member_id = rc.register_teacher_staff_id
            and sm.role_key in ('hod','teacher','class_teacher')
            and sm.active_from <= current_date
            and (sm.active_to is null or sm.active_to >= current_date)
            and app_private.attendance_staff_has_current_placement(sm.staff_member_id,rc.school_id)
        )
      )
  );
end;
$$;

revoke all on function app_private.can_record_register_class(uuid) from public,anon;
grant execute on function app_private.can_record_register_class(uuid) to authenticated;

comment on function app_private.can_record_register_class(uuid) is
'Official class-register capture: current register teacher only for HOD/teacher/class_teacher, with governed school leadership and Platform Admin correction authority.';

-- Subject-period *authority* (the active allocated teacher with effective school
-- placement, school leadership, or Platform Admin) is intentionally NOT
-- overridden here: it remains owned by the established actor-integrity helpers in
-- 20260906050000_attendance_actor_integrity.sql and
-- 20260828133000_subject_period_attendance.sql. The stricter subject capture rules
-- required by #1214 (exact teaching period, effective-dated allocation, HOD review
-- does not imply capture authority, governed school day) are enforced in the
-- server action layer via src/features/attendance/server/capture-scope.ts and the
-- governed-day resolver. This migration only adds database-row defence in depth.

create or replace function app_private.subject_attendance_enrolment_in_scope(
  p_timetable_slot_id uuid,
  p_enrolment_id uuid,
  p_on_date date
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select exists (
    select 1
    from public.timetable_slots ts
    join public.teacher_allocations ta
      on ta.id=ts.teacher_allocation_id and ta.school_id=ts.school_id
     and ta.academic_year=ts.academic_year and ta.register_class_id=ts.register_class_id
    join public.enrolments e
      on e.id=p_enrolment_id and e.school_id=ts.school_id
     and e.academic_year=ts.academic_year and e.register_class_id=ts.register_class_id
     and e.enrolled_from<=p_on_date and (e.enrolled_to is null or e.enrolled_to>=p_on_date)
    where ts.id=p_timetable_slot_id and ts.status='active'
      and (
        not exists (
          select 1 from public.teaching_group_allocations active_group
          where active_group.teacher_allocation_id=ta.id
            and active_group.effective_from<=p_on_date
            and (active_group.effective_to is null or active_group.effective_to>=p_on_date)
        )
        or exists (
          select 1
          from public.teaching_group_allocations tga
          join public.teaching_groups tg
            on tg.id=tga.teaching_group_id and tg.school_id=ts.school_id
           and tg.academic_year=ts.academic_year and tg.subject_offering_id=ta.subject_offering_id
           and tg.status='active' and tg.effective_from<=p_on_date
           and (tg.effective_to is null or tg.effective_to>=p_on_date)
          join public.teaching_group_memberships tgm
            on tgm.teaching_group_id=tg.id and tgm.enrolment_id=e.id
           and tgm.effective_from<=p_on_date
           and (tgm.effective_to is null or tgm.effective_to>=p_on_date)
          where tga.teacher_allocation_id=ta.id
            and tga.effective_from<=p_on_date
            and (tga.effective_to is null or tga.effective_to>=p_on_date)
        )
      )
  );
$$;

revoke all on function app_private.subject_attendance_enrolment_in_scope(uuid,uuid,date)
from public,anon,authenticated;

create or replace function app_private.enforce_subject_attendance_group_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if new.observation_type='subject_period' and (
    new.timetable_slot_id is null
    or not app_private.subject_attendance_enrolment_in_scope(
      new.timetable_slot_id,new.enrolment_id,new.attendance_date
    )
  ) then
    raise exception 'Subject attendance enrolment is outside the assigned class or teaching group';
  end if;
  return new;
end;
$$;

revoke all on function app_private.enforce_subject_attendance_group_scope()
from public,anon,authenticated;

drop trigger if exists zz_subject_attendance_group_scope_trg on public.attendance_events;
create trigger zz_subject_attendance_group_scope_trg
before insert or update of school_id,academic_year,enrolment_id,register_class_id,
  attendance_date,observation_type,timetable_slot_id
on public.attendance_events
for each row execute function app_private.enforce_subject_attendance_group_scope();
