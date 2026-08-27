create or replace function public.create_tenant_school(
  p_tenant_name text,
  p_tenant_slug text,
  p_school_name text,
  p_emis_number text default null,
  p_region text default null,
  p_town text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_tenant_id uuid;
  v_school_id uuid;
  v_slug text;
begin
  if not app_private.has_platform_role(array['platform_admin']) then
    raise exception 'Not authorized to create tenants.' using errcode = '42501';
  end if;

  if nullif(btrim(p_tenant_name), '') is null then
    raise exception 'Tenant name is required.' using errcode = '22023';
  end if;

  if nullif(btrim(p_school_name), '') is null then
    raise exception 'School name is required.' using errcode = '22023';
  end if;

  v_slug := lower(btrim(p_tenant_slug));
  if v_slug is null or v_slug = '' or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Tenant slug must use lowercase letters, numbers and single hyphens.' using errcode = '22023';
  end if;

  insert into public.tenants (name, slug)
  values (btrim(p_tenant_name), v_slug)
  returning id into v_tenant_id;

  insert into public.schools (
    tenant_id,
    name,
    emis_number,
    region,
    town
  ) values (
    v_tenant_id,
    btrim(p_school_name),
    nullif(btrim(p_emis_number), ''),
    nullif(btrim(p_region), ''),
    nullif(btrim(p_town), '')
  ) returning id into v_school_id;

  insert into public.audit_events (
    tenant_id,
    school_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  ) values (
    v_tenant_id,
    v_school_id,
    auth.uid(),
    'tenant.created',
    'tenant',
    v_tenant_id,
    jsonb_build_object(
      'school_id', v_school_id,
      'tenant_slug', v_slug
    )
  );

  return jsonb_build_object(
    'tenant_id', v_tenant_id,
    'school_id', v_school_id
  );
end;
$$;

revoke all on function public.create_tenant_school(text, text, text, text, text, text) from public;
revoke execute on function public.create_tenant_school(text, text, text, text, text, text) from anon;
grant execute on function public.create_tenant_school(text, text, text, text, text, text) to authenticated;

comment on function public.create_tenant_school is
  'Atomically creates a tenant and its first school after platform-admin authorization.';