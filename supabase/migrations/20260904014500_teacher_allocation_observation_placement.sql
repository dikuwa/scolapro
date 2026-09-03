-- Learner-observation authority must follow both sides of the effective relationship:
-- the learner must be currently enrolled at the school, and teacher-allocation access
-- must be backed by a current governed staff placement. Historical scheduling rows
-- remain intact without continuing sensitive learner access.

create or replace function app_private.can_access_learner_observations(
  p_school_id uuid,
  p_learner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or exists(
      select 1
      from public.school_memberships sm
      where sm.school_id=p_school_id
        and sm.user_id=(select auth.uid())
        and sm.role_key in ('school_admin','principal','deputy_principal','counsellor')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    )
    or exists(
      select 1
      from public.enrolments e
      left join public.register_classes rc on rc.id=e.register_class_id
      left join public.staff_members register_staff on register_staff.id=rc.register_teacher_staff_id
      where e.school_id=p_school_id
        and e.learner_id=p_learner_id
        and e.status='current'
        and e.enrolled_from<=current_date
        and (e.enrolled_to is null or e.enrolled_to>=current_date)
        and (
          (
            register_staff.user_id=(select auth.uid())
            and register_staff.status='active'
            and exists(
              select 1 from public.school_memberships sm
              where sm.school_id=p_school_id
                and sm.user_id=(select auth.uid())
                and sm.role_key='class_teacher'
                and sm.active_from<=current_date
                and (sm.active_to is null or sm.active_to>=current_date)
            )
          )
          or exists(
            select 1
            from public.teacher_allocations ta
            join public.staff_members teacher_staff on teacher_staff.id=ta.staff_member_id
            where ta.school_id=p_school_id
              and ta.register_class_id=e.register_class_id
              and ta.academic_year=e.academic_year
              and ta.active_from<=current_date
              and (ta.active_to is null or ta.active_to>=current_date)
              and teacher_staff.user_id=(select auth.uid())
              and teacher_staff.status='active'
              and app_private.staff_member_has_school_assignment(
                teacher_staff.id,
                p_school_id,
                current_date
              )
          )
        )
    );
$$;

revoke all on function app_private.can_access_learner_observations(uuid,uuid)
from public,anon;
grant execute on function app_private.can_access_learner_observations(uuid,uuid)
to authenticated;

comment on function app_private.can_access_learner_observations(uuid,uuid) is
'Learner-observation access is limited to Platform Admin, current authorised school leadership/counselling, or current class/teacher scope for a learner whose school enrolment is effective today; teacher-allocation access also requires current governed staff placement.';
