-- Conduct/achievement learner-observation authority must use the same deterministic
-- current-school selection as application context. Historical records remain intact;
-- only present read/write authority is narrowed. Class-teacher authority also requires
-- a current governed staff placement, matching allocated-teacher semantics.

create or replace function app_private.user_current_school_matches(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_school_id = (
    select sm.school_id
    from public.school_memberships sm
    where sm.user_id = p_user_id
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
    order by sm.active_from desc, sm.id asc
    limit 1
  );
$$;

revoke all on function app_private.user_current_school_matches(uuid,uuid)
from public, anon, authenticated;

create or replace function app_private.can_access_learner_observations(
  p_school_id uuid,
  p_learner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or (
      app_private.user_current_school_matches((select auth.uid()), p_school_id)
      and (
        exists(
          select 1
          from public.school_memberships sm
          where sm.school_id = p_school_id
            and sm.user_id = (select auth.uid())
            and sm.role_key in ('school_admin','principal','deputy_principal','counsellor')
            and sm.active_from <= current_date
            and (sm.active_to is null or sm.active_to >= current_date)
        )
        or exists(
          select 1
          from public.enrolments e
          left join public.register_classes rc on rc.id = e.register_class_id
          left join public.staff_members register_staff on register_staff.id = rc.register_teacher_staff_id
          where e.school_id = p_school_id
            and e.learner_id = p_learner_id
            and e.status = 'current'
            and e.enrolled_from <= current_date
            and (e.enrolled_to is null or e.enrolled_to >= current_date)
            and (
              (
                register_staff.user_id = (select auth.uid())
                and register_staff.status = 'active'
                and app_private.staff_member_has_school_assignment(
                  register_staff.id,
                  p_school_id,
                  current_date
                )
                and exists(
                  select 1
                  from public.school_memberships sm
                  where sm.school_id = p_school_id
                    and sm.user_id = (select auth.uid())
                    and sm.role_key = 'class_teacher'
                    and sm.active_from <= current_date
                    and (sm.active_to is null or sm.active_to >= current_date)
                )
              )
              or exists(
                select 1
                from public.teacher_allocations ta
                join public.staff_members teacher_staff on teacher_staff.id = ta.staff_member_id
                where ta.school_id = p_school_id
                  and ta.register_class_id = e.register_class_id
                  and ta.academic_year = e.academic_year
                  and ta.active_from <= current_date
                  and (ta.active_to is null or ta.active_to >= current_date)
                  and teacher_staff.user_id = (select auth.uid())
                  and teacher_staff.status = 'active'
                  and app_private.staff_member_has_school_assignment(
                    teacher_staff.id,
                    p_school_id,
                    current_date
                  )
              )
            )
        )
      )
    );
$$;

revoke all on function app_private.can_access_learner_observations(uuid,uuid)
from public, anon;
grant execute on function app_private.can_access_learner_observations(uuid,uuid)
to authenticated;

create or replace function app_private.user_can_access_learner_observations(
  p_user_id uuid,
  p_school_id uuid,
  p_learner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select exists(
      select 1
      from public.platform_memberships pm
      where pm.user_id = p_user_id
        and pm.role_key = 'platform_admin'
        and pm.active_from <= current_date
        and (pm.active_to is null or pm.active_to >= current_date)
    )
    or (
      app_private.user_current_school_matches(p_user_id, p_school_id)
      and (
        exists(
          select 1
          from public.school_memberships sm
          where sm.school_id = p_school_id
            and sm.user_id = p_user_id
            and sm.role_key in ('school_admin','principal','deputy_principal','counsellor')
            and sm.active_from <= current_date
            and (sm.active_to is null or sm.active_to >= current_date)
        )
        or exists(
          select 1
          from public.enrolments e
          left join public.register_classes rc on rc.id = e.register_class_id
          left join public.staff_members register_staff on register_staff.id = rc.register_teacher_staff_id
          where e.school_id = p_school_id
            and e.learner_id = p_learner_id
            and e.status = 'current'
            and e.enrolled_from <= current_date
            and (e.enrolled_to is null or e.enrolled_to >= current_date)
            and (
              (
                register_staff.user_id = p_user_id
                and register_staff.status = 'active'
                and app_private.staff_member_has_school_assignment(
                  register_staff.id,
                  p_school_id,
                  current_date
                )
                and exists(
                  select 1
                  from public.school_memberships sm
                  where sm.school_id = p_school_id
                    and sm.user_id = p_user_id
                    and sm.role_key = 'class_teacher'
                    and sm.active_from <= current_date
                    and (sm.active_to is null or sm.active_to >= current_date)
                )
              )
              or exists(
                select 1
                from public.teacher_allocations ta
                join public.staff_members teacher_staff on teacher_staff.id = ta.staff_member_id
                where ta.school_id = p_school_id
                  and ta.register_class_id = e.register_class_id
                  and ta.academic_year = e.academic_year
                  and ta.active_from <= current_date
                  and (ta.active_to is null or ta.active_to >= current_date)
                  and teacher_staff.user_id = p_user_id
                  and teacher_staff.status = 'active'
                  and app_private.staff_member_has_school_assignment(
                    teacher_staff.id,
                    p_school_id,
                    current_date
                  )
              )
            )
        )
      )
    );
$$;

revoke all on function app_private.user_can_access_learner_observations(uuid,uuid,uuid)
from public, anon, authenticated;

-- Keep historical conduct visible to authorized operational staff in their current
-- school, while preventing a second active school membership from widening RLS.
drop policy if exists "authorized staff can read conduct events" on public.conduct_events;
create policy "authorized staff can read conduct events"
on public.conduct_events for select to authenticated
using (
  app_private.user_current_school_matches((select auth.uid()), school_id)
  and app_private.can_view_operational_learners(school_id)
);

drop policy if exists "teaching staff can create conduct events" on public.conduct_events;
create policy "teaching staff can create conduct events"
on public.conduct_events for insert to authenticated
with check (
  recorded_by_user_id = (select auth.uid())
  and app_private.user_current_school_matches((select auth.uid()), school_id)
  and app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod','teacher','class_teacher','counsellor'])
);

drop policy if exists "leaders can update conduct events" on public.conduct_events;
create policy "leaders can update conduct events"
on public.conduct_events for update to authenticated
using (
  app_private.user_current_school_matches((select auth.uid()), school_id)
  and app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod'])
)
with check (
  app_private.user_current_school_matches((select auth.uid()), school_id)
  and app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod'])
);

drop policy if exists "authorized staff can read achievements" on public.achievement_events;
create policy "authorized staff can read achievements"
on public.achievement_events for select to authenticated
using (
  app_private.user_current_school_matches((select auth.uid()), school_id)
  and app_private.can_view_operational_learners(school_id)
);

drop policy if exists "teaching staff can create achievements" on public.achievement_events;
create policy "teaching staff can create achievements"
on public.achievement_events for insert to authenticated
with check (
  recorded_by_user_id = (select auth.uid())
  and app_private.user_current_school_matches((select auth.uid()), school_id)
  and app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod','teacher','class_teacher'])
);

drop policy if exists "leaders can update achievements" on public.achievement_events;
create policy "leaders can update achievements"
on public.achievement_events for update to authenticated
using (
  app_private.user_current_school_matches((select auth.uid()), school_id)
  and app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod'])
)
with check (
  app_private.user_current_school_matches((select auth.uid()), school_id)
  and app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod'])
);

comment on function app_private.can_access_learner_observations(uuid,uuid) is
'Learner-observation access preserves Platform Admin authority; school-local authority is restricted to the deterministic current school, current learner enrolment and current teacher/class-teacher placement/allocation scope.';
