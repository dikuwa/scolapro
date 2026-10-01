-- #945: authorize Sports / Houses assignment-year aggregation once per request.
create or replace function public.get_sports_house_assignment_years(
  p_school_id uuid
)
returns table (
  academic_year integer
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not (
    app_private.has_school_access(p_school_id)
    or app_private.has_platform_role(array['platform_admin']::text[])
  ) then
    raise exception 'Permission denied';
  end if;

  return query
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
end;
$$;

revoke all on function public.get_sports_house_assignment_years(uuid) from public, anon;
grant execute on function public.get_sports_house_assignment_years(uuid) to authenticated;

comment on function public.get_sports_house_assignment_years(uuid) is
  'Returns distinct sports-house assignment years after one explicit school/platform authorization check, avoiding per-row RLS authorization during aggregation.';