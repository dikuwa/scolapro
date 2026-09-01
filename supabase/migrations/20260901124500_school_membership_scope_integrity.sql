create or replace function app_private.enforce_school_membership_scope_integrity()
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
    or new.user_id is distinct from old.user_id
  ) then
    raise exception 'School membership tenant, school, and user identity are immutable';
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'School membership scope mismatch: school does not belong to tenant';
  end if;

  if new.staff_member_id is not null then
    select sm.tenant_id into v_staff_tenant
    from public.staff_members sm
    where sm.id = new.staff_member_id;

    if v_staff_tenant is null or v_staff_tenant <> new.tenant_id then
      raise exception 'School membership scope mismatch: staff member does not belong to tenant';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_school_membership_scope_integrity() from public, anon, authenticated;

drop trigger if exists school_membership_scope_integrity_trg on public.school_memberships;
create trigger school_membership_scope_integrity_trg
before insert or update of tenant_id, school_id, user_id, staff_member_id
on public.school_memberships
for each row execute function app_private.enforce_school_membership_scope_integrity();
