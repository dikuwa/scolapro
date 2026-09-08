-- N07: extend statutory snapshots with additional authoritative operational aggregates.
--
-- No new statutory fact store is introduced. The existing statutory_snapshots.values JSON
-- remains the frozen/certified evidence surface. This migration adds only non-identity
-- aggregates and shared reference facts that already exist in canonical operational domains.
-- Inclusion/support aggregates are intentionally not embedded here because N05 currently
-- permits network-role reads of statutory_snapshots while N16 deliberately withholds
-- per-school inclusion aggregates from network roles. Embedding them would create a
-- permission bypass around the stricter N16 surface.

create or replace function app_private.build_n07_statutory_operational_extensions(
  p_school_id uuid,
  p_academic_year integer,
  p_reference_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_staffing jsonb;
  v_hostel_feeding jsonb;
  v_network jsonb;
  v_school_identifiers jsonb;
begin
  if p_school_id is null or p_reference_date is null then
    raise exception 'School and reference date are required';
  end if;
  if p_academic_year is null or p_academic_year < 2000 or p_academic_year > 2200 then
    raise exception 'Academic year is invalid';
  end if;
  if not exists (select 1 from public.schools s where s.id = p_school_id) then
    raise exception 'School not found';
  end if;
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not app_private.can_manage_statutory(p_school_id) then
    raise exception 'Permission denied';
  end if;

  with active_posts as (
    select p.id
    from public.staffing_establishment_posts p
    where p.school_id = p_school_id
      and p.effective_from <= p_reference_date
      and (p.effective_to is null or p.effective_to >= p_reference_date)
  ),
  active_occupancies as (
    select distinct o.post_id, o.staff_school_assignment_id
    from public.staffing_post_occupancies o
    join active_posts p on p.id = o.post_id
    where o.school_id = p_school_id
      and o.effective_from <= p_reference_date
      and (o.effective_to is null or o.effective_to >= p_reference_date)
  ),
  active_placements as (
    select a.id
    from public.staff_school_assignments a
    where a.school_id = p_school_id
      and a.effective_from <= p_reference_date
      and (a.effective_to is null or a.effective_to >= p_reference_date)
  ),
  counts as (
    select
      (select count(*)::integer from active_posts) as establishment_posts,
      (select count(distinct post_id)::integer from active_occupancies) as occupied_posts,
      (select count(*)::integer from active_placements) as active_staff_placements,
      (select count(distinct ao.staff_school_assignment_id)::integer
       from active_occupancies ao
       join active_placements ap on ap.id = ao.staff_school_assignment_id) as linked_staff_placements
  )
  select jsonb_build_object(
    'as_of_date', p_reference_date,
    'establishment_posts', c.establishment_posts,
    'occupied_posts', c.occupied_posts,
    'vacant_posts', greatest(c.establishment_posts - c.occupied_posts, 0),
    'active_staff_placements', c.active_staff_placements,
    'linked_staff_placements', c.linked_staff_placements,
    'unlinked_staff_placements', greatest(c.active_staff_placements - c.linked_staff_placements, 0)
  )
  into v_staffing
  from counts c;

  with active_hostels as (
    select h.id, h.capacity, h.staff_count
    from public.school_hostels h
    where h.school_id = p_school_id
      and h.active_from <= p_reference_date
      and (h.active_to is null or h.active_to >= p_reference_date)
  ),
  active_residencies as (
    select r.id, r.hostel_id
    from public.hostel_residencies r
    join active_hostels h on h.id = r.hostel_id
    where r.school_id = p_school_id
      and r.resident_from <= p_reference_date
      and (r.resident_to is null or r.resident_to >= p_reference_date)
  ),
  active_feeding_programmes as (
    select p.id, p.target_beneficiaries
    from public.school_feeding_programmes p
    where p.school_id = p_school_id
      and p.active_from <= p_reference_date
      and (p.active_to is null or p.active_to >= p_reference_date)
  ),
  feeding_to_reference as (
    select d.id, d.beneficiary_count, d.meal_count
    from public.feeding_service_days d
    join active_feeding_programmes p on p.id = d.programme_id
    where d.school_id = p_school_id
      and d.service_date between make_date(p_academic_year, 1, 1) and p_reference_date
  )
  select jsonb_build_object(
    'as_of_date', p_reference_date,
    'active_hostels', (select count(*)::integer from active_hostels),
    'hostel_capacity', coalesce((select sum(capacity)::integer from active_hostels), 0),
    'hostel_staff_count', coalesce((select sum(staff_count)::integer from active_hostels), 0),
    'current_residents', (select count(*)::integer from active_residencies),
    'active_feeding_programmes', (select count(*)::integer from active_feeding_programmes),
    'target_beneficiaries', coalesce((select sum(target_beneficiaries)::integer from active_feeding_programmes), 0),
    'service_days_to_reference_date', (select count(*)::integer from feeding_to_reference),
    'beneficiary_events_to_reference_date', coalesce((select sum(beneficiary_count)::bigint from feeding_to_reference), 0),
    'meals_served_to_reference_date', coalesce((select sum(meal_count)::bigint from feeding_to_reference), 0)
  )
  into v_hostel_feeding;

  select coalesce(
    jsonb_build_object(
      'as_of_date', p_reference_date,
      'authority', jsonb_build_object('id', a.authority_id, 'name', ea.name, 'external_code', ea.external_code),
      'region', jsonb_build_object('id', a.region_id, 'name', er.name, 'external_code', er.external_code),
      'circuit', jsonb_build_object('id', a.circuit_id, 'name', ec.name, 'external_code', ec.external_code),
      'cluster', case when a.cluster_id is null then null else jsonb_build_object('id', a.cluster_id, 'name', ecl.name, 'external_code', ecl.external_code) end
    ),
    jsonb_build_object('as_of_date', p_reference_date)
  )
  into v_network
  from public.school_network_assignments a
  join public.education_authorities ea on ea.id = a.authority_id
  join public.education_regions er on er.id = a.region_id
  join public.education_circuits ec on ec.id = a.circuit_id
  left join public.education_clusters ecl on ecl.id = a.cluster_id
  where a.school_id = p_school_id
    and a.effective_from <= p_reference_date
    and (a.effective_to is null or a.effective_to >= p_reference_date)
  limit 1;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'scheme', i.identifier_scheme,
        'value', i.identifier_value,
        'registry_url', i.registry_url,
        'effective_from', i.effective_from,
        'effective_to', i.effective_to
      ) order by i.identifier_scheme
    ),
    '[]'::jsonb
  )
  into v_school_identifiers
  from public.school_external_identifiers i
  where i.school_id = p_school_id
    and i.effective_from <= p_reference_date
    and (i.effective_to is null or i.effective_to >= p_reference_date);

  return jsonb_build_object(
    'staffing_establishment', coalesce(v_staffing, '{}'::jsonb),
    'hostel_feeding', coalesce(v_hostel_feeding, '{}'::jsonb),
    'education_network', coalesce(v_network, jsonb_build_object('as_of_date', p_reference_date)),
    'school_external_identifiers', v_school_identifiers
  );
end;
$$;

revoke all on function app_private.build_n07_statutory_operational_extensions(uuid, integer, date)
  from public, anon, authenticated;

comment on function app_private.build_n07_statutory_operational_extensions(uuid, integer, date) is
'N07 private statutory extension builder. Derives non-identity staffing-establishment, hostel/feeding and education-network facts at the reporting reference date from canonical operational sources. It deliberately excludes per-school inclusion/support aggregates because N16 applies a stricter network-safe disclosure model than N05 statutory snapshot reads.';

create or replace function public.generate_statutory_snapshot(p_reporting_cycle_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_cycle public.statutory_reporting_cycles%rowtype;
  v_values jsonb;
  v_number integer;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_cycle
  from public.statutory_reporting_cycles
  where id = p_reporting_cycle_id
  for update;

  if not found then
    raise exception 'Reporting cycle not found';
  end if;
  if not app_private.can_manage_statutory(v_cycle.school_id) then
    raise exception 'Permission denied';
  end if;
  if v_cycle.status in ('certified','locked','submitted','archived') then
    raise exception 'Reporting cycle is no longer open for a new provisional snapshot';
  end if;

  v_values := public.build_school_operational_snapshot(
    v_cycle.school_id,
    v_cycle.academic_year,
    v_cycle.reference_date
  ) || app_private.build_n07_statutory_operational_extensions(
    v_cycle.school_id,
    v_cycle.academic_year,
    v_cycle.reference_date
  );

  select coalesce(max(snapshot_number), 0) + 1
  into v_number
  from public.statutory_snapshots
  where reporting_cycle_id = v_cycle.id;

  insert into public.statutory_snapshots(
    tenant_id,
    school_id,
    reporting_cycle_id,
    snapshot_number,
    values,
    source_summary,
    generated_by_user_id,
    status
  ) values (
    v_cycle.tenant_id,
    v_cycle.school_id,
    v_cycle.id,
    v_number,
    v_values,
    jsonb_build_object(
      'generator', 'school-operational-n07-v1',
      'generated_from', jsonb_build_array(
        'existing_school_operational_snapshot',
        'staffing_establishment_posts',
        'staffing_post_occupancies',
        'staff_school_assignments',
        'school_hostels',
        'hostel_residencies',
        'school_feeding_programmes',
        'feeding_service_days',
        'school_network_assignments',
        'school_external_identifiers'
      ),
      'reference_date', v_cycle.reference_date,
      'academic_year', v_cycle.academic_year,
      'excludes', jsonb_build_array('per_school_inclusion_support_aggregate')
    ),
    auth.uid(),
    'provisional'
  )
  returning id into v_id;

  update public.statutory_reporting_cycles
  set status = 'review', updated_at = now()
  where id = v_cycle.id and status = 'open';

  insert into public.audit_events(
    tenant_id,
    school_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  ) values (
    v_cycle.tenant_id,
    v_cycle.school_id,
    auth.uid(),
    'statutory.snapshot.generated',
    'statutory_snapshot',
    v_id,
    jsonb_build_object(
      'reporting_cycle_id', v_cycle.id,
      'snapshot_number', v_number,
      'reference_date', v_cycle.reference_date,
      'generator', 'school-operational-n07-v1'
    )
  );

  return v_id;
end;
$$;

revoke all on function public.generate_statutory_snapshot(uuid) from public, anon;
grant execute on function public.generate_statutory_snapshot(uuid) to authenticated;

comment on function public.generate_statutory_snapshot(uuid) is
'N07 statutory snapshot generator. Preserves the existing frozen snapshot model while adding authoritative non-identity staffing establishment, hostel/feeding, education-network and external-school-identifier facts evaluated at the cycle reference date.';
