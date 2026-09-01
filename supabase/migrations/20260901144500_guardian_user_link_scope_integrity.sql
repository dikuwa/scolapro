create or replace function app_private.enforce_guardian_user_link_scope_integrity()
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
    or new.user_id is distinct from old.user_id
  ) then
    raise exception 'Guardian user link tenant, guardian, and user are immutable';
  end if;

  select g.tenant_id into v_guardian_tenant
  from public.guardian_profiles g
  where g.id = new.guardian_id;

  if v_guardian_tenant is null or v_guardian_tenant <> new.tenant_id then
    raise exception 'Guardian user link scope mismatch: guardian does not belong to tenant';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_guardian_user_link_scope_integrity() from public, anon, authenticated;

drop trigger if exists guardian_user_link_scope_integrity_trg on public.guardian_user_links;
create trigger guardian_user_link_scope_integrity_trg
before insert or update of tenant_id, guardian_id, user_id
on public.guardian_user_links
for each row execute function app_private.enforce_guardian_user_link_scope_integrity();