-- Issue #853: reusable School Settings -> Statutory / EMIS Profile foundation.
--
-- Canonical reuse:
--   * schools.emis_number remains the EMIS identity source.
--   * schools.town remains the legacy town source.
--   * current region/circuit/cluster come from effective school_network_assignments.
--   * school address/contact fields remain in school_settings.document_profile.
--   * hostel facts remain in school_hostels.
--
-- Only school attributes with no canonical operational home are stored under the
-- school-local school_settings key "statutory_emis_profile". No AEC-cycle values,
-- official codes, form mappings, readiness state or certification live here.

create or replace function app_private.can_manage_current_school_statutory_profile(
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select auth.uid() is not null
    and app_private.user_has_current_school_role(
      auth.uid(),
      p_school_id,
      array['school_admin','principal','deputy_principal']
    );
$$;

revoke all on function app_private.can_manage_current_school_statutory_profile(uuid)
from public, anon, authenticated;

create or replace function public.get_school_statutory_emis_profile(
  p_school_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_school public.schools%rowtype;
  v_profile jsonb := '{}'::jsonb;
  v_document_profile jsonb := '{}'::jsonb;
  v_network jsonb := '{}'::jsonb;
  v_hostel jsonb := '{}'::jsonb;
begin
  if not app_private.can_manage_current_school_statutory_profile(p_school_id) then
    raise exception 'Current School Settings authority is required';
  end if;

  select *
  into v_school
  from public.schools s
  where s.id=p_school_id
    and s.status='active';

  if not found then
    raise exception 'School not found in current scope';
  end if;

  select coalesce(ss.setting_value,'{}'::jsonb)
  into v_profile
  from public.school_settings ss
  where ss.school_id=p_school_id
    and ss.setting_key='statutory_emis_profile';

  select coalesce(ss.setting_value,'{}'::jsonb)
  into v_document_profile
  from public.school_settings ss
  where ss.school_id=p_school_id
    and ss.setting_key='document_profile';

  select coalesce(jsonb_build_object(
    'region_id', er.id,
    'region_name', er.name,
    'circuit_id', ec.id,
    'circuit_name', ec.name,
    'cluster_id', ecl.id,
    'cluster_name', ecl.name
  ), '{}'::jsonb)
  into v_network
  from public.school_network_assignments sna
  join public.education_regions er on er.id=sna.region_id
  join public.education_circuits ec on ec.id=sna.circuit_id
  left join public.education_clusters ecl on ecl.id=sna.cluster_id
  where sna.school_id=p_school_id
    and sna.effective_from<=current_date
    and (sna.effective_to is null or sna.effective_to>=current_date)
  order by sna.effective_from desc, sna.id
  limit 1;

  select coalesce(jsonb_build_object(
    'configured', count(*) > 0,
    'active_count', count(*)::integer,
    'types', coalesce(
      jsonb_agg(distinct h.hostel_type) filter (where h.id is not null),
      '[]'::jsonb
    )
  ), jsonb_build_object('configured',false,'active_count',0,'types','[]'::jsonb))
  into v_hostel
  from public.school_hostels h
  where h.school_id=p_school_id
    and h.active_from<=current_date
    and (h.active_to is null or h.active_to>=current_date);

  return jsonb_build_object(
    'school', jsonb_build_object(
      'id', v_school.id,
      'name', v_school.name,
      'emis_number', v_school.emis_number,
      'town', v_school.town,
      'legacy_region', v_school.region
    ),
    'network', coalesce(v_network,'{}'::jsonb),
    'contact', jsonb_build_object(
      'physical_address', nullif(btrim(v_document_profile ->> 'physical_address'),''),
      'postal_address', nullif(btrim(v_document_profile ->> 'postal_address'),''),
      'telephone', nullif(btrim(v_document_profile ->> 'telephone'),''),
      'email', nullif(btrim(v_document_profile ->> 'email'),''),
      'cellphone', nullif(btrim(v_document_profile ->> 'cellphone'),'')
    ),
    'hostel', coalesce(v_hostel,'{}'::jsonb),
    'profile', coalesce(v_profile,'{}'::jsonb)
  );
end;
$$;

revoke all on function public.get_school_statutory_emis_profile(uuid)
from public, anon;
grant execute on function public.get_school_statutory_emis_profile(uuid)
to authenticated;

create or replace function public.save_school_statutory_emis_profile(
  p_school_id uuid,
  p_profile jsonb
)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_school public.schools%rowtype;
  v_existing jsonb := '{}'::jsonb;
  v_normalized jsonb;
begin
  if not app_private.can_manage_current_school_statutory_profile(p_school_id) then
    raise exception 'Current School Settings authority is required';
  end if;

  select *
  into v_school
  from public.schools s
  where s.id=p_school_id
    and s.status='active'
  for update;

  if not found then
    raise exception 'School not found in current scope';
  end if;

  if jsonb_typeof(coalesce(p_profile,'{}'::jsonb)) <> 'object' then
    raise exception 'Statutory / EMIS profile must be an object';
  end if;

  select coalesce(ss.setting_value,'{}'::jsonb)
  into v_existing
  from public.school_settings ss
  where ss.school_id=p_school_id
    and ss.setting_key='statutory_emis_profile'
  for update;

  v_normalized := jsonb_strip_nulls(jsonb_build_object(
    'pay_point', nullif(btrim(coalesce(p_profile ->> 'pay_point','')),''),
    'constituency', nullif(btrim(coalesce(p_profile ->> 'constituency','')),''),
    'school_classification', nullif(btrim(coalesce(p_profile ->> 'school_classification','')),''),
    'ownership', nullif(btrim(coalesce(p_profile ->> 'ownership','')),''),
    'urban_rural', nullif(btrim(coalesce(p_profile ->> 'urban_rural','')),''),
    'is_satellite_school', case
      when p_profile ? 'is_satellite_school'
        and jsonb_typeof(p_profile -> 'is_satellite_school')='boolean'
      then (p_profile ->> 'is_satellite_school')::boolean
      else null
    end,
    'satellite_school_information', nullif(btrim(coalesce(p_profile ->> 'satellite_school_information','')),''),
    'is_cluster_centre', case
      when p_profile ? 'is_cluster_centre'
        and jsonb_typeof(p_profile -> 'is_cluster_centre')='boolean'
      then (p_profile ->> 'is_cluster_centre')::boolean
      else null
    end
  ));

  -- Preserve future/non-owned keys while replacing this feature's allowlisted
  -- keys. Blank optional strings are removed instead of persisted as noise.
  v_existing := coalesce(v_existing,'{}'::jsonb)
    - 'pay_point'
    - 'constituency'
    - 'school_classification'
    - 'ownership'
    - 'urban_rural'
    - 'is_satellite_school'
    - 'satellite_school_information'
    - 'is_cluster_centre';

  insert into public.school_settings(
    tenant_id, school_id, setting_key, setting_value, updated_by_user_id
  ) values (
    v_school.tenant_id,
    p_school_id,
    'statutory_emis_profile',
    v_existing || v_normalized,
    auth.uid()
  )
  on conflict (school_id,setting_key) do update
    set setting_value=excluded.setting_value,
        updated_by_user_id=auth.uid();

  insert into public.audit_events(
    tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
  ) values (
    v_school.tenant_id,
    p_school_id,
    auth.uid(),
    'school.statutory_emis_profile.updated',
    'school',
    p_school_id,
    jsonb_build_object(
      'setting_key','statutory_emis_profile',
      'fields', (
        select coalesce(jsonb_agg(key order by key),'[]'::jsonb)
        from jsonb_object_keys(v_normalized) key
      )
    )
  );
end;
$$;

revoke all on function public.save_school_statutory_emis_profile(uuid,jsonb)
from public, anon;
grant execute on function public.save_school_statutory_emis_profile(uuid,jsonb)
to authenticated;

comment on function public.get_school_statutory_emis_profile(uuid) is
'Current-school management read model for reusable school statutory profile. Reuses canonical EMIS, network placement, document contact and hostel sources; returns no AEC-cycle data.';
comment on function public.save_school_statutory_emis_profile(uuid,jsonb) is
'Current-school management update for schema-gap reusable school profile attributes only. Does not write EMIS identity, contact/address, education-network placement, hostel operations or official code mappings.';
