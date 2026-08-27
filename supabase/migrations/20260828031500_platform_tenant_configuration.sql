create table if not exists public.tenant_features (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default true,
  configuration jsonb not null default '{}'::jsonb,
  effective_from date not null default current_date,
  effective_to date,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, feature_key, effective_from),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.school_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  setting_key text not null,
  setting_value jsonb not null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, setting_key)
);

create table if not exists public.tenant_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_type text not null check (event_type in ('created','activated','suspended','reactivated','archived','subscription_changed','feature_changed','support_note')),
  note text,
  metadata jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now()
);

create index if not exists tenant_features_effective_idx on public.tenant_features(tenant_id, feature_key, effective_from desc);
create index if not exists school_settings_school_idx on public.school_settings(school_id, setting_key);
create index if not exists tenant_lifecycle_events_tenant_idx on public.tenant_lifecycle_events(tenant_id, occurred_at desc);

alter table public.tenant_features enable row level security;
alter table public.school_settings enable row level security;
alter table public.tenant_lifecycle_events enable row level security;

create policy "tenant members can read effective features"
on public.tenant_features for select to authenticated
using (app_private.has_tenant_access(tenant_id) or app_private.has_platform_role(array['platform_admin','platform_support']));

create policy "platform admins can manage tenant features"
on public.tenant_features for all to authenticated
using (app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_platform_role(array['platform_admin']));

create policy "school members can read school settings"
on public.school_settings for select to authenticated
using (app_private.has_school_access(school_id) or app_private.has_platform_role(array['platform_admin','platform_support']));

create policy "school leaders can manage school settings"
on public.school_settings for all to authenticated
using (app_private.has_platform_role(array['platform_admin']) or app_private.has_school_role(school_id, array['school_admin','principal']))
with check (app_private.has_platform_role(array['platform_admin']) or app_private.has_school_role(school_id, array['school_admin','principal']));

create policy "platform admins can read tenant lifecycle"
on public.tenant_lifecycle_events for select to authenticated
using (app_private.has_platform_role(array['platform_admin','platform_support']));

create policy "platform admins can create tenant lifecycle"
on public.tenant_lifecycle_events for insert to authenticated
with check (app_private.has_platform_role(array['platform_admin']));

create or replace function public.set_tenant_feature(
  p_tenant_id uuid,
  p_feature_key text,
  p_enabled boolean,
  p_configuration jsonb default '{}'::jsonb,
  p_effective_from date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_platform_role(array['platform_admin']) then raise exception 'Permission denied'; end if;
  if btrim(coalesce(p_feature_key,'')) = '' then raise exception 'Feature key is required'; end if;
  if not exists (select 1 from public.tenants where id = p_tenant_id) then raise exception 'Tenant not found'; end if;

  insert into public.tenant_features (tenant_id, feature_key, enabled, configuration, effective_from, updated_by_user_id)
  values (p_tenant_id, lower(btrim(p_feature_key)), p_enabled, coalesce(p_configuration,'{}'::jsonb), p_effective_from, auth.uid())
  on conflict (tenant_id, feature_key, effective_from)
  do update set enabled = excluded.enabled, configuration = excluded.configuration, updated_by_user_id = auth.uid(), updated_at = now()
  returning id into v_id;

  insert into public.tenant_lifecycle_events (tenant_id, event_type, metadata, actor_user_id)
  values (p_tenant_id, 'feature_changed', jsonb_build_object('feature_key', lower(btrim(p_feature_key)), 'enabled', p_enabled, 'effective_from', p_effective_from), auth.uid());

  return v_id;
end;
$$;

create or replace function public.set_school_setting(
  p_school_id uuid,
  p_setting_key text,
  p_setting_value jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school public.schools%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_school from public.schools where id = p_school_id;
  if not found then raise exception 'School not found'; end if;
  if not (app_private.has_platform_role(array['platform_admin']) or app_private.has_school_role(v_school.id, array['school_admin','principal'])) then raise exception 'Permission denied'; end if;
  if btrim(coalesce(p_setting_key,'')) = '' then raise exception 'Setting key is required'; end if;

  insert into public.school_settings (tenant_id, school_id, setting_key, setting_value, updated_by_user_id)
  values (v_school.tenant_id, v_school.id, lower(btrim(p_setting_key)), coalesce(p_setting_value,'null'::jsonb), auth.uid())
  on conflict (school_id, setting_key)
  do update set setting_value = excluded.setting_value, updated_by_user_id = auth.uid(), updated_at = now()
  returning id into v_id;

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_school.tenant_id, v_school.id, auth.uid(), 'school.setting.updated', 'school_setting', v_id, jsonb_build_object('setting_key', lower(btrim(p_setting_key))));

  return v_id;
end;
$$;

revoke all on function public.set_tenant_feature(uuid,text,boolean,jsonb,date) from public, anon;
grant execute on function public.set_tenant_feature(uuid,text,boolean,jsonb,date) to authenticated;
revoke all on function public.set_school_setting(uuid,text,jsonb) from public, anon;
grant execute on function public.set_school_setting(uuid,text,jsonb) to authenticated;

comment on table public.tenant_features is 'Versionable tenant module/feature entitlements and configuration. UI navigation must derive from governed entitlements rather than hard-coded tenant modes.';
comment on table public.school_settings is 'School-scoped operational configuration kept separate from tenant entitlements and from domain records.';
comment on table public.tenant_lifecycle_events is 'Append-only platform lifecycle history for tenant activation, suspension, subscription and feature changes.';