create or replace function app_private.enforce_school_duty_assignment_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
  v_staff_tenant uuid;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.staff_member_id is distinct from old.staff_member_id
    or new.duty_key is distinct from old.duty_key
    or new.active_from is distinct from old.active_from
  ) then
    raise exception 'School duty tenant, school, staff, duty key, and start date are immutable';
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'School duty scope mismatch: school does not belong to tenant';
  end if;

  select sm.tenant_id into v_staff_tenant
  from public.staff_members sm
  where sm.id = new.staff_member_id;

  if v_staff_tenant is null or v_staff_tenant <> new.tenant_id then
    raise exception 'School duty scope mismatch: staff member does not belong to tenant';
  end if;

  if not exists (
    select 1
    from public.school_memberships m
    where m.school_id = new.school_id
      and m.staff_member_id = new.staff_member_id
      and m.active_from <= new.active_from
      and (m.active_to is null or m.active_to >= new.active_from)
  ) then
    raise exception 'School duty scope mismatch: staff member is not assigned to school on duty start date';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_school_duty_assignment_scope_integrity() from public, anon, authenticated;

drop trigger if exists school_duty_assignment_scope_integrity_trg on public.school_duty_assignments;
create trigger school_duty_assignment_scope_integrity_trg
before insert or update of tenant_id, school_id, staff_member_id, duty_key, active_from
on public.school_duty_assignments
for each row execute function app_private.enforce_school_duty_assignment_scope_integrity();