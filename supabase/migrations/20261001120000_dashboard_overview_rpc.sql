-- #937: collapse dashboard overview counts into one RLS-preserving request.
create or replace function public.get_school_dashboard_overview(
  p_school_id uuid,
  p_academic_year integer
)
returns table (
  current_learners bigint,
  grade_count bigint,
  register_class_count bigint
)
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select
    (
      select count(*)
      from public.enrolments e
      where e.school_id = p_school_id
        and e.academic_year = p_academic_year
        and e.status = 'current'
    )::bigint as current_learners,
    (
      select count(*)
      from public.grades g
      where g.school_id = p_school_id
        and g.academic_year = p_academic_year
    )::bigint as grade_count,
    (
      select count(*)
      from public.register_classes rc
      where rc.school_id = p_school_id
        and rc.academic_year = p_academic_year
    )::bigint as register_class_count;
$$;

revoke all on function public.get_school_dashboard_overview(uuid, integer) from public, anon;
grant execute on function public.get_school_dashboard_overview(uuid, integer) to authenticated;

comment on function public.get_school_dashboard_overview(uuid, integer) is
  'Returns RLS-visible current learner, grade and register-class counts for a school academic year in one request.';
