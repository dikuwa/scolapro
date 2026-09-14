-- Library staff borrowers must follow the same authoritative placement precedence
-- used by current staff operations. Once staff_school_assignments history exists,
-- a stale school_memberships row must not keep a staff member visible or eligible.

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
  ), target_school as (
    select s.id, s.tenant_id
    from public.schools s, authorized a
    where a.allowed
      and s.id = p_school_id
  )
  select staff.id, staff.first_name, staff.last_name, staff.employee_number
  from public.staff_members staff
  join target_school school on school.tenant_id = staff.tenant_id
  cross join authorized a
  where staff.status = 'active'
    and app_private.staff_member_covers_school_period(
      staff.id,
      school.id,
      a.today,
      a.today
    )
  order by staff.last_name, staff.first_name, staff.id;
$$;

revoke all on function public.list_learning_resource_staff_borrowers(uuid) from public, anon;
grant execute on function public.list_learning_resource_staff_borrowers(uuid) to authenticated;

comment on function public.list_learning_resource_staff_borrowers(uuid) is
'Authorized current-school Library borrower lookup using authoritative effective staff placement precedence; legacy membership fallback applies only when no staff assignment history exists.';

create or replace function app_private.enforce_learning_resource_staff_borrower_placement()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  -- Trusted bootstrap/history writes without request identity retain existing behavior.
  if auth.uid() is null or new.staff_member_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.staff_members staff
    where staff.id = new.staff_member_id
      and staff.tenant_id = new.tenant_id
      and staff.status = 'active'
      and app_private.staff_member_covers_school_period(
        staff.id,
        new.school_id,
        new.issued_on,
        new.issued_on
      )
  ) then
    raise exception 'Staff member is not active at this school';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_learning_resource_staff_borrower_placement()
  from public, anon, authenticated;

-- Keep canonical issue_learning_resource() intact and enforce the borrower invariant
-- below it as well as beneath any future authenticated insert path.
drop trigger if exists learning_resource_staff_borrower_placement_trg
  on public.learning_resource_loans;
create trigger learning_resource_staff_borrower_placement_trg
before insert or update of staff_member_id, school_id, tenant_id, issued_on
on public.learning_resource_loans
for each row execute function app_private.enforce_learning_resource_staff_borrower_placement();

comment on function app_private.enforce_learning_resource_staff_borrower_placement() is
'Prevents authenticated Library loans from using staff whose authoritative effective placement does not cover the loan school/date; historical trusted writes remain unchanged.';
