create or replace function app_private.enforce_finance_charge_type_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.charge_code is distinct from old.charge_code
  ) then
    raise exception 'Finance charge type tenant, school, and charge code are immutable';
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Finance charge type scope mismatch: school does not belong to tenant';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_finance_charge_type_scope_integrity() from public, anon, authenticated;

drop trigger if exists finance_charge_type_scope_integrity_trg on public.finance_charge_types;
create trigger finance_charge_type_scope_integrity_trg
before insert or update of tenant_id, school_id, charge_code
on public.finance_charge_types
for each row execute function app_private.enforce_finance_charge_type_scope_integrity();