-- Issue #547: platform tenant/school onboarding lifecycle provenance hardening.
--
-- Preserve the existing provisioning/configuration architecture. Tenant creation and
-- tenant status transitions must also populate the canonical append-only lifecycle
-- ledger that already enforces active Platform Admin actor provenance.

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

  insert into public.tenant_lifecycle_events (
    tenant_id,
    event_type,
    metadata,
    actor_user_id
  ) values (
    v_tenant_id,
    'created',
    jsonb_build_object(
      'school_id', v_school_id,
      'tenant_slug', v_slug
    ),
    auth.uid()
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

create or replace function public.update_platform_tenant_configuration(
  p_tenant_id uuid,
  p_name text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_old public.tenants%rowtype;
  v_lifecycle_event text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_platform_role(array['platform_admin']) then
    raise exception 'Platform administrator authority required';
  end if;

  select * into v_old from public.tenants where id = p_tenant_id for update;
  if not found then raise exception 'Tenant not found'; end if;
  if nullif(btrim(p_name), '') is null then raise exception 'Tenant name is required'; end if;
  if p_status not in ('active','suspended','archived') then raise exception 'Invalid tenant status'; end if;

  update public.tenants
  set name = btrim(p_name),
      status = p_status,
      updated_at = now()
  where id = p_tenant_id;

  if v_old.name is distinct from btrim(p_name)
     or v_old.status is distinct from p_status then
    insert into public.audit_events(
      tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
    ) values (
      v_old.id, null, auth.uid(), 'tenant.configuration.updated', 'tenant', v_old.id,
      jsonb_build_object(
        'old_name', v_old.name,
        'new_name', btrim(p_name),
        'old_status', v_old.status,
        'new_status', p_status
      )
    );
  end if;

  if v_old.status is distinct from p_status then
    v_lifecycle_event := case
      when p_status = 'suspended' then 'suspended'
      when p_status = 'archived' then 'archived'
      when p_status = 'active' and v_old.status in ('suspended','archived') then 'reactivated'
      else 'activated'
    end;

    insert into public.tenant_lifecycle_events(
      tenant_id,
      event_type,
      metadata,
      actor_user_id
    ) values (
      v_old.id,
      v_lifecycle_event,
      jsonb_build_object(
        'old_status', v_old.status,
        'new_status', p_status
      ),
      auth.uid()
    );
  end if;
end;
$$;

revoke all on function public.update_platform_tenant_configuration(uuid,text,text)
from public, anon;
grant execute on function public.update_platform_tenant_configuration(uuid,text,text)
to authenticated;

comment on function public.create_tenant_school(text,text,text,text,text,text) is
'Atomically creates a tenant and first school after Platform Admin authorization, recording both general audit and canonical tenant lifecycle provenance.';

comment on function public.update_platform_tenant_configuration(uuid,text,text) is
'Platform-admin-only audited tenant name/status update. Tenant id and slug remain immutable; status transitions append canonical lifecycle history.';
