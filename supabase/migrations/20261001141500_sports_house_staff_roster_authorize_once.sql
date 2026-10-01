-- #949: preserve source-specific Sports / Houses staff-roster authority while avoiding repeated row-level school checks.
create or replace function app_private.get_sports_house_staff_roster_authorized(
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
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  placement_allowed boolean;
  assignment_allowed boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  placement_allowed := coalesce(
    app_private.has_platform_role(array['platform_admin']::text[])
    or app_private.can_access_current_school_staff_directory(p_school_id),
    false
  );

  assignment_allowed := coalesce(
    app_private.has_school_access(p_school_id)
    or app_private.has_platform_role(array['platform_admin']::text[]),
    false
  );

  return query
  with assignment_rows as materialized (
    select
      a.staff_member_id,
      a.house_id,
      a.role_key,
      a.assignment_source,
      a.is_locked,
      a.assigned_at
    from public.sports_staff_house_assignments a
    where assignment_allowed
      and a.school_id = p_school_id
      and a.academic_year = p_academic_year
  ),
  placement_ids as (
    select distinct p.staff_member_id
    from public.staff_school_assignments p
    where placement_allowed
      and p.school_id = p_school_id
      and p.effective_from <= pg_catalog.make_date(p_academic_year, 12, 31)
      and (p.effective_to is null or p.effective_to >= pg_catalog.make_date(p_academic_year, 1, 1))
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
   and app_private.can_read_staff_identity(sm.id)
  left join assignment_rows a
    on a.staff_member_id = ids.staff_member_id
  order by sm.first_name nulls last, sm.last_name nulls last, ids.staff_member_id;
end;
$$;

revoke all on function app_private.get_sports_house_staff_roster_authorized(uuid, integer) from public, anon;
grant execute on function app_private.get_sports_house_staff_roster_authorized(uuid, integer) to authenticated;

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
  select roster.staff_member_id,
         roster.first_name,
         roster.last_name,
         roster.employee_number,
         roster.house_id,
         roster.role_key,
         roster.assignment_source,
         roster.is_locked,
         roster.assigned_at
  from app_private.get_sports_house_staff_roster_authorized(p_school_id, p_academic_year) roster;
$$;

revoke all on function public.get_sports_house_staff_roster(uuid, integer) from public, anon;
grant execute on function public.get_sports_house_staff_roster(uuid, integer) to authenticated;

comment on function app_private.get_sports_house_staff_roster_authorized(uuid, integer) is
  'Private SECURITY DEFINER helper for Sports/Houses staff roster reads. Placement and assignment source authority are evaluated once, while per-staff identity visibility remains governed by can_read_staff_identity.';

comment on function public.get_sports_house_staff_roster(uuid, integer) is
  'Public SECURITY INVOKER wrapper for the source-authorized Sports/Houses staff roster.';