create or replace function app_private.enforce_tenant_feature_provenance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.tenant_id is distinct from old.tenant_id
    or new.feature_key is distinct from old.feature_key
    or new.effective_from is distinct from old.effective_from
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Tenant feature identity and creation provenance are immutable';
  end if;

  if v_actor is not null then
    new.updated_by_user_id := v_actor;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_tenant_feature_provenance() from public, anon, authenticated;

drop trigger if exists tenant_features_provenance_integrity_trg on public.tenant_features;
create trigger tenant_features_provenance_integrity_trg
before insert or update on public.tenant_features
for each row execute function app_private.enforce_tenant_feature_provenance();

create or replace function app_private.enforce_tenant_lifecycle_event_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if tg_op in ('UPDATE','DELETE') then
    raise exception 'Tenant lifecycle events are append-only historical records';
  end if;

  if v_actor is not null then
    if new.actor_user_id is not null and new.actor_user_id <> v_actor then
      raise exception 'Tenant lifecycle event actor must match authenticated user';
    end if;
    new.actor_user_id := v_actor;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_tenant_lifecycle_event_integrity() from public, anon, authenticated;

drop trigger if exists tenant_lifecycle_events_integrity_trg on public.tenant_lifecycle_events;
create trigger tenant_lifecycle_events_integrity_trg
before insert or update or delete on public.tenant_lifecycle_events
for each row execute function app_private.enforce_tenant_lifecycle_event_integrity();
