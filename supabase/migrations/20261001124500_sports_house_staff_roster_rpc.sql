-- #943: collapse Sports / Houses staff placement, assignment and identity reads into one RLS-preserving request.
create or replace function public.get_sports_house_staff_roster(
  p_school_id uuid,
  p_academic_year integer
)
returns table (
  staff_member_id uuid,
  first_name text,
  last_name text,
  employee_number text,
  house_id uuid,
  role_key text,
  assignment_source text,
  is_locked boolean,
  assigned_at timestamptz
)
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  with assignment_rows as materialized (
    select
      a.staff_member_id,
      a.house_id,
      a.role_key,
      a.assignment_source,
      a.is_locked,
      a.assigned_at
    from public.sports_staff_house_assignments a
    where a.school_id = p_school_id
      and a.academic_year = p_academic_year
  ),
  placement_ids as (
    select distinct p.staff_member_id
    from public.staff_school_assignments p
    where p.school_id = p_school_id
      and p.effective_from <= make_date(p_academic_year, 12, 31)
      and (p.effective_to is null or p.effective_to >= make_date(p_academic_year, 1, 1))
  ),
  staff_ids as (
    select placement_ids.staff_member_id from placement_ids
    union
    select assignment_rows.staff_member_id from assignment_rows
  )
  select
    ids.staff_member_id,
    sm.first_name,
    sm.last_name,
    sm.employee_number,
    a.house_id,
    a.role_key,
    a.assignment_source,
    a.is_locked,
    a.assigned_at
  from staff_ids ids
  left join public.staff_members sm
    on sm.id = ids.staff_member_id
  left join assignment_rows a
    on a.staff_member_id = ids.staff_member_id
  order by sm.first_name nulls last, sm.last_name nulls last, ids.staff_member_id;
$$;

revoke all on function public.get_sports_house_staff_roster(uuid, integer) from public, anon;
grant execute on function public.get_sports_house_staff_roster(uuid, integer) to authenticated;

comment on function public.get_sports_house_staff_roster(uuid, integer) is
  'Returns the RLS-visible Sports/Houses staff roster for one school/year, preserving effective placements and existing house assignments in one request.';