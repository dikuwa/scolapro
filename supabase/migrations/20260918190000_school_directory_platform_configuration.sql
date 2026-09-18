-- Issue #476: governed platform edits for tenant/school configuration and
-- effective-dated school network assignment. Principal identity remains derived
-- from staff/membership/placement data in search_school_directory. Circuit
-- inspector contact remains managed by authorized schools after assignment.

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
end;
$$;

revoke all on function public.update_platform_tenant_configuration(uuid,text,text)
from public, anon;
grant execute on function public.update_platform_tenant_configuration(uuid,text,text)
to authenticated;

create or replace function public.update_platform_school_configuration(
  p_tenant_id uuid,
  p_school_id uuid,
  p_name text,
  p_emis_number text,
  p_region text,
  p_town text,
  p_status text,
  p_physical_address text,
  p_postal_address text,
  p_telephone text,
  p_fax text,
  p_email text,
  p_cellphone text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_old public.schools%rowtype;
  v_profile jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_platform_role(array['platform_admin']) then
    raise exception 'Platform administrator authority required';
  end if;

  select * into v_old
  from public.schools
  where id = p_school_id and tenant_id = p_tenant_id
  for update;
  if not found then raise exception 'School not found in tenant'; end if;

  if nullif(btrim(p_name), '') is null then raise exception 'School name is required'; end if;
  if p_status not in ('active','inactive','archived') then raise exception 'Invalid school status'; end if;
  if nullif(btrim(coalesce(p_email,'')), '') is not null
     and p_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'School email must be a valid email address';
  end if;

  update public.schools
  set name = btrim(p_name),
      emis_number = nullif(btrim(coalesce(p_emis_number,'')), ''),
      region = nullif(btrim(coalesce(p_region,'')), ''),
      town = nullif(btrim(coalesce(p_town,'')), ''),
      status = p_status,
      updated_at = now()
  where id = v_old.id;

  select coalesce(setting_value, '{}'::jsonb)
  into v_profile
  from public.school_settings
  where school_id = v_old.id
    and setting_key = 'document_profile'
  for update;

  v_profile := coalesce(v_profile, '{}'::jsonb)
    || jsonb_build_object(
      'physical_address', nullif(btrim(coalesce(p_physical_address,'')), ''),
      'postal_address', nullif(btrim(coalesce(p_postal_address,'')), ''),
      'telephone', nullif(btrim(coalesce(p_telephone,'')), ''),
      'fax', nullif(btrim(coalesce(p_fax,'')), ''),
      'email', nullif(btrim(coalesce(p_email,'')), ''),
      'cellphone', nullif(btrim(coalesce(p_cellphone,'')), '')
    );

  insert into public.school_settings(
    tenant_id, school_id, setting_key, setting_value, updated_by_user_id
  ) values (
    v_old.tenant_id, v_old.id, 'document_profile', v_profile, auth.uid()
  )
  on conflict (school_id, setting_key) do update
    set setting_value = excluded.setting_value,
        updated_by_user_id = auth.uid();

  insert into public.audit_events(
    tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
  ) values (
    v_old.tenant_id, v_old.id, auth.uid(), 'school.configuration.updated', 'school', v_old.id,
    jsonb_build_object(
      'old_name', v_old.name,
      'new_name', btrim(p_name),
      'old_status', v_old.status,
      'new_status', p_status,
      'old_emis_number', v_old.emis_number,
      'new_emis_number', nullif(btrim(coalesce(p_emis_number,'')), '')
    )
  );
end;
$$;

revoke all on function public.update_platform_school_configuration(
  uuid,uuid,text,text,text,text,text,text,text,text,text,text,text
) from public, anon;
grant execute on function public.update_platform_school_configuration(
  uuid,uuid,text,text,text,text,text,text,text,text,text,text,text
) to authenticated;

create or replace function public.configure_school_network_assignment(
  p_tenant_id uuid,
  p_school_id uuid,
  p_region_id uuid,
  p_circuit_id uuid,
  p_effective_from date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_school public.schools%rowtype;
  v_authority_id uuid;
  v_current public.school_network_assignments%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_platform_role(array['platform_admin']) then
    raise exception 'Platform administrator authority required';
  end if;
  if p_effective_from is null then raise exception 'Effective-from date is required'; end if;

  select * into v_school
  from public.schools
  where id = p_school_id and tenant_id = p_tenant_id
  for update;
  if not found then raise exception 'School not found in tenant'; end if;

  select h.authority_id into v_authority_id
  from public.education_region_authority_history h
  where h.region_id = p_region_id
    and h.effective_from <= p_effective_from
    and (h.effective_to is null or h.effective_to >= p_effective_from)
  order by h.effective_from desc
  limit 1;
  if v_authority_id is null then
    raise exception 'Region has no effective education authority on that date';
  end if;

  if not exists (
    select 1
    from public.education_circuit_region_history h
    where h.circuit_id = p_circuit_id
      and h.region_id = p_region_id
      and h.effective_from <= p_effective_from
      and (h.effective_to is null or h.effective_to >= p_effective_from)
  ) then
    raise exception 'Circuit is not assigned to the selected region on that date';
  end if;

  select * into v_current
  from public.school_network_assignments a
  where a.school_id = p_school_id
    and a.effective_from <= p_effective_from
    and (a.effective_to is null or a.effective_to >= p_effective_from)
  order by a.effective_from desc
  limit 1
  for update;

  if found
     and v_current.region_id = p_region_id
     and v_current.circuit_id = p_circuit_id then
    return v_current.id;
  end if;

  if found then
    if p_effective_from <= v_current.effective_from then
      raise exception 'New assignment must begin after the current assignment start date';
    end if;

    update public.school_network_assignments
    set effective_to = p_effective_from - 1,
        updated_at = now()
    where id = v_current.id;
  end if;

  if exists (
    select 1
    from public.school_network_assignments a
    where a.school_id = p_school_id
      and a.effective_from >= p_effective_from
  ) then
    raise exception 'A later school network assignment already exists';
  end if;

  insert into public.school_network_assignments(
    school_id, authority_id, region_id, circuit_id, cluster_id,
    effective_from, effective_to
  ) values (
    p_school_id, v_authority_id, p_region_id, p_circuit_id, null,
    p_effective_from, null
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.configure_school_network_assignment(uuid,uuid,uuid,uuid,date)
from public, anon;
grant execute on function public.configure_school_network_assignment(uuid,uuid,uuid,uuid,date)
to authenticated;

comment on function public.update_platform_tenant_configuration(uuid,text,text) is
'Platform-admin-only audited tenant name/status update. Tenant id and slug are not mutable through this workflow.';
comment on function public.update_platform_school_configuration(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text) is
'Platform-admin-only audited school metadata/public-contact update. Tenant/school identity is fixed and document_profile is merged rather than replaced.';
comment on function public.configure_school_network_assignment(uuid,uuid,uuid,uuid,date) is
'Platform-admin-only effective-dated school region/circuit transition. The prior covering assignment is closed rather than deleted and hierarchy identity is validated from canonical network history.';
