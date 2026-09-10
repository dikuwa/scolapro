-- Canonical school-local staff borrower read model. This prevents UI discovery from
-- depending on whichever staff identity path a given role can join through directly.

create or replace function public.list_learning_resource_staff_borrowers(p_school_id uuid)
returns table(
  staff_member_id uuid,
  first_name text,
  last_name text,
  employee_number text
)
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  with authorized as (
    select app_private.can_manage_ltsm(p_school_id) as allowed,
           app_private.learning_resource_today() as today
  ), current_staff as (
    select ssa.staff_member_id
    from public.staff_school_assignments ssa, authorized a
    where a.allowed
      and ssa.school_id = p_school_id
      and ssa.effective_from <= a.today
      and (ssa.effective_to is null or ssa.effective_to >= a.today)
    union
    select sm.staff_member_id
    from public.school_memberships sm, authorized a
    where a.allowed
      and sm.school_id = p_school_id
      and sm.staff_member_id is not null
      and sm.active_from <= a.today
      and (sm.active_to is null or sm.active_to >= a.today)
  )
  select staff.id, staff.first_name, staff.last_name, staff.employee_number
  from current_staff current_link
  join public.staff_members staff on staff.id = current_link.staff_member_id
  join public.schools school on school.id = p_school_id and school.tenant_id = staff.tenant_id
  where staff.status = 'active'
  order by staff.last_name, staff.first_name, staff.id;
$$;

revoke all on function public.list_learning_resource_staff_borrowers(uuid) from public, anon;
grant execute on function public.list_learning_resource_staff_borrowers(uuid) to authenticated;

comment on function public.list_learning_resource_staff_borrowers(uuid) is
'Authorized LTSM/library borrower lookup over current effective school assignments or memberships. Inactive, expired and other-school staff are excluded.';
