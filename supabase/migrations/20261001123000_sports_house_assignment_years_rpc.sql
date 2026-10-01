-- #939: collapse duplicate-heavy Sports / Houses assignment-year scans into one RLS-preserving request.
create or replace function public.get_sports_house_assignment_years(
  p_school_id uuid
)
returns table (
  academic_year integer
)
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select distinct years.academic_year
  from (
    select learner_assignments.academic_year
    from public.sports_learner_house_assignments learner_assignments
    where learner_assignments.school_id = p_school_id

    union

    select staff_assignments.academic_year
    from public.sports_staff_house_assignments staff_assignments
    where staff_assignments.school_id = p_school_id
  ) years
  where years.academic_year is not null
  order by years.academic_year desc;
$$;

revoke all on function public.get_sports_house_assignment_years(uuid) from public, anon;
grant execute on function public.get_sports_house_assignment_years(uuid) to authenticated;

comment on function public.get_sports_house_assignment_years(uuid) is
  'Returns distinct RLS-visible academic years represented by learner or staff sports-house assignments for one school.';