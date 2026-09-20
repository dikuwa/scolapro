-- Avoid invoking learner-scoped conduct authorization for every enrolment when
-- the caller already has school-wide conduct authority. Preserve the existing
-- RPC signature and exact role/current-school semantics.

create or replace function public.list_conduct_learners(
  p_school_id uuid,
  p_on date
)
returns table(
  learner_id uuid,
  learner_name text,
  class_id uuid,
  class_name text,
  grade_id uuid,
  grade_name text
)
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  with actor_scope as materialized (
    select
      app_private.has_platform_role(array['platform_admin']) as platform_admin,
      app_private.user_current_school_matches((select auth.uid()),p_school_id) as current_school,
      exists(
        select 1
        from public.school_memberships sm
        where sm.school_id=p_school_id
          and sm.user_id=(select auth.uid())
          and sm.role_key in ('school_admin','principal','deputy_principal','counsellor')
          and sm.active_from<=current_date
          and (sm.active_to is null or sm.active_to>=current_date)
      ) as schoolwide
  )
  select distinct
    l.id,
    l.first_names||' '||l.surname,
    rc.id,
    rc.display_name,
    g.id,
    g.display_name
  from public.enrolments e
  join public.learners l on l.id=e.learner_id
  left join public.register_classes rc on rc.id=e.register_class_id
  left join public.grades g on g.id=rc.grade_id
  cross join actor_scope a
  where (select auth.uid()) is not null
    and e.school_id=p_school_id
    and e.enrolled_from<=p_on
    and (e.enrolled_to is null or e.enrolled_to>=p_on)
    and (
      a.platform_admin
      or (
        a.current_school
        and (
          a.schoolwide
          or app_private.can_access_learner_observations(p_school_id,e.learner_id)
        )
      )
    )
  order by 2,1;
$$;

revoke all on function public.list_conduct_learners(uuid,date) from public,anon;
grant execute on function public.list_conduct_learners(uuid,date) to authenticated;

comment on function public.list_conduct_learners(uuid,date)
is 'Conduct learner roster with school-wide authority resolved once and scoped teacher/class-teacher fallback preserved.';
