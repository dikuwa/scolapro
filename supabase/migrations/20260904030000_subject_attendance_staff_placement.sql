-- Subject-period attendance authority for the allocated teacher must not outlive the
-- teacher's actual placement at the school. Allocation/timetable history remains stored;
-- only current operational authority is withdrawn when the placement ends.

create or replace function app_private.can_record_subject_attendance(
  p_timetable_slot_id uuid,
  p_on_date date default current_date
)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select exists(
    select 1
    from public.timetable_slots ts
    join public.teacher_allocations ta on ta.id=ts.teacher_allocation_id
    join public.staff_members sm on sm.id=ta.staff_member_id
    where ts.id=p_timetable_slot_id
      and ts.status='active'
      and ta.active_from<=p_on_date
      and (ta.active_to is null or ta.active_to>=p_on_date)
      and (
        (
          sm.user_id=(select auth.uid())
          and sm.status='active'
          and app_private.staff_member_has_school_assignment(sm.id,ts.school_id,p_on_date)
        )
        or app_private.has_school_role(
          ts.school_id,
          array['school_admin','principal','deputy_principal','hod']
        )
        or app_private.has_platform_role(array['platform_admin'])
      )
  );
$$;

revoke all on function app_private.can_record_subject_attendance(uuid,date)
from public,anon,authenticated;

comment on function app_private.can_record_subject_attendance(uuid,date) is
'Authorizes subject-period attendance for the allocated teacher only while the teacher has an active staff identity and effective school placement on the attendance date; governed leadership/platform overrides remain role-scoped.';
