-- #945: authorize Sports / Houses assignment-year aggregation once per request.
create or replace function app_private.get_sports_house_assignment_years_authorized(
  p_school_id uuid
)
returns table (
  academic_year integer
)
language plpgsql
stable
security definer
set search_path = ''
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

revoke all on function app_private.get_sports_house_assignment_years_authorized(uuid) from public, anon;
grant execute on function app_private.get_sports_house_assignment_years_authorized(uuid) to authenticated;

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
  select years.academic_year
  from app_private.get_sports_house_assignment_years_authorized(p_school_id) years;
$$;

revoke all on function public.get_sports_house_assignment_years(uuid) from public, anon;
grant execute on function public.get_sports_house_assignment_years(uuid) to authenticated;

comment on function app_private.get_sports_house_assignment_years_authorized(uuid) is
  'Private SECURITY DEFINER helper for Sports/Houses assignment-year aggregation. It authenticates and authorizes one school before bypassing row-level assignment scans.';

comment on function public.get_sports_house_assignment_years(uuid) is
  'Public SECURITY INVOKER wrapper returning distinct authorized Sports/Houses assignment years for one school.';