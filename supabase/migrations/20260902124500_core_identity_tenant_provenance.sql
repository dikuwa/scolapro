create or replace function app_private.enforce_core_identity_tenant_provenance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.id is distinct from old.id
     or new.tenant_id is distinct from old.tenant_id
     or new.created_at is distinct from old.created_at then
    raise exception '% identity, tenant ownership and creation provenance are immutable', tg_table_name;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_core_identity_tenant_provenance() from public, anon, authenticated;

drop trigger if exists schools_tenant_provenance_integrity_trg on public.schools;
create trigger schools_tenant_provenance_integrity_trg
before update of id, tenant_id, created_at on public.schools
for each row execute function app_private.enforce_core_identity_tenant_provenance();

drop trigger if exists learners_tenant_provenance_integrity_trg on public.learners;
create trigger learners_tenant_provenance_integrity_trg
before update of id, tenant_id, created_at on public.learners
for each row execute function app_private.enforce_core_identity_tenant_provenance();

drop trigger if exists guardian_profiles_tenant_provenance_integrity_trg on public.guardian_profiles;
create trigger guardian_profiles_tenant_provenance_integrity_trg
before update of id, tenant_id, created_at on public.guardian_profiles
for each row execute function app_private.enforce_core_identity_tenant_provenance();
