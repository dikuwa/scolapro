-- Close the remaining trusted-write provenance gap in platform tenant governance.
-- Feature changes and lifecycle history must always identify a real active
-- platform administrator, even when a privileged server connection bypasses RLS.

create or replace function app_private.user_is_active_platform_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.platform_memberships pm
    where pm.user_id = p_user_id
      and pm.role_key = 'platform_admin'
      and pm.active_from <= current_date
      and (pm.active_to is null or pm.active_to >= current_date)
  );
$$;

revoke all on function app_private.user_is_active_platform_admin(uuid)
  from public, anon, authenticated;

create or replace function app_private.enforce_tenant_feature_provenance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_actor uuid;
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

  if auth.uid() is not null then
    if new.updated_by_user_id is not null
       and new.updated_by_user_id is distinct from auth.uid() then
      raise exception 'Tenant feature updater must match authenticated actor';
    end if;
    new.updated_by_user_id := auth.uid();
  end if;

  v_actor := new.updated_by_user_id;
  if v_actor is null then
    raise exception 'Tenant feature updater is required';
  end if;
  if not app_private.user_is_active_platform_admin(v_actor) then
    raise exception 'Tenant feature updater is not an active platform administrator';
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_tenant_feature_provenance()
  from public, anon, authenticated;

create or replace function app_private.enforce_tenant_lifecycle_event_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_actor uuid;
begin
  if tg_op in ('UPDATE','DELETE') then
    raise exception 'Tenant lifecycle events are append-only historical records';
  end if;

  if auth.uid() is not null then
    if new.actor_user_id is not null
       and new.actor_user_id is distinct from auth.uid() then
      raise exception 'Tenant lifecycle event actor must match authenticated user';
    end if;
    new.actor_user_id := auth.uid();
  end if;

  v_actor := new.actor_user_id;
  if v_actor is null then
    raise exception 'Tenant lifecycle event actor is required';
  end if;
  if not app_private.user_is_active_platform_admin(v_actor) then
    raise exception 'Tenant lifecycle event actor is not an active platform administrator';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_tenant_lifecycle_event_integrity()
  from public, anon, authenticated;

comment on function app_private.user_is_active_platform_admin(uuid) is
'Arbitrary-user active platform-admin authority mirror used only by physical platform-governance provenance guards.';
comment on function app_private.enforce_tenant_feature_provenance() is
'Binds every tenant feature write to an active platform administrator and freezes feature identity/creation provenance.';
comment on function app_private.enforce_tenant_lifecycle_event_integrity() is
'Keeps tenant lifecycle history append-only and binds every event to an active platform administrator.';
