create or replace function app_private.enforce_guardian_contact_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_guardian_tenant uuid;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.guardian_id is distinct from old.guardian_id
  ) then
    raise exception 'Guardian contact tenant and guardian are immutable';
  end if;

  select g.tenant_id into v_guardian_tenant
  from public.guardian_profiles g
  where g.id = new.guardian_id;

  if v_guardian_tenant is null or v_guardian_tenant <> new.tenant_id then
    raise exception 'Guardian contact scope mismatch: guardian does not belong to tenant';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_guardian_contact_scope_integrity() from public, anon, authenticated;

drop trigger if exists guardian_contact_scope_integrity_trg on public.guardian_contacts;
create trigger guardian_contact_scope_integrity_trg
before insert or update of tenant_id, guardian_id
on public.guardian_contacts
for each row execute function app_private.enforce_guardian_contact_scope_integrity();

create or replace function app_private.enforce_guardian_address_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_guardian_tenant uuid;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.guardian_id is distinct from old.guardian_id
  ) then
    raise exception 'Guardian address tenant and guardian are immutable';
  end if;

  select g.tenant_id into v_guardian_tenant
  from public.guardian_profiles g
  where g.id = new.guardian_id;

  if v_guardian_tenant is null or v_guardian_tenant <> new.tenant_id then
    raise exception 'Guardian address scope mismatch: guardian does not belong to tenant';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_guardian_address_scope_integrity() from public, anon, authenticated;

drop trigger if exists guardian_address_scope_integrity_trg on public.guardian_addresses;
create trigger guardian_address_scope_integrity_trg
before insert or update of tenant_id, guardian_id
on public.guardian_addresses
for each row execute function app_private.enforce_guardian_address_scope_integrity();