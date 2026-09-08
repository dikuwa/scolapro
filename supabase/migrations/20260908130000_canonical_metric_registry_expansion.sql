-- Stream B: canonical metric registry expansion over authoritative integrated domains.
-- Registry rows remain metadata-only. Every network-safe metric below has an explicit,
-- fixed SQL implementation branch; no executable definitions or duplicate fact store.

insert into public.canonical_metric_registry (
  metric_key, display_name, description, unit, value_type,
  aggregation_method, source_domain, network_safe, effective_from
) values
  (
    'staffing.establishment_posts',
    'Staffing establishment posts',
    'Approved staffing establishment posts effective at the requested as-of date across schools in the caller current network scope.',
    'posts','integer','count','staffing_establishment',true,'2020-01-01'
  ),
  (
    'staffing.occupied_posts',
    'Occupied staffing establishment posts',
    'Distinct approved staffing establishment posts with an effective occupancy at the requested as-of date across schools in the caller current network scope.',
    'posts','integer','count','staffing_establishment',true,'2020-01-01'
  ),
  (
    'staffing.vacant_posts',
    'Vacant staffing establishment posts',
    'Approved staffing establishment posts effective at the requested as-of date minus distinct posts with an effective occupancy, across schools in the caller current network scope.',
    'posts','integer','count','staffing_establishment',true,'2020-01-01'
  ),
  (
    'hostel.capacity',
    'Hostel capacity',
    'Sum of recorded capacity for school hostels effective at the requested as-of date across schools in the caller current network scope.',
    'places','integer','sum','hostel_feeding',true,'2020-01-01'
  ),
  (
    'hostel.occupancy',
    'Hostel occupancy',
    'Count of effective hostel residencies at the requested as-of date in hostels effective on that date across schools in the caller current network scope.',
    'residencies','integer','count','hostel_feeding',true,'2020-01-01'
  ),
  (
    'feeding.beneficiaries_served',
    'Feeding beneficiaries served',
    'Sum of recorded beneficiary counts on feeding service days dated exactly the requested as-of date across schools in the caller current network scope.',
    'beneficiaries','integer','sum','hostel_feeding',true,'2020-01-01'
  ),
  (
    'feeding.meals_served',
    'Feeding meals served',
    'Sum of recorded meal counts on feeding service days dated exactly the requested as-of date across schools in the caller current network scope.',
    'meals','integer','sum','hostel_feeding',true,'2020-01-01'
  ),
  (
    'examination.centre_count',
    'Examination centres serving network schools',
    'Distinct examination centres with an effective school-centre assignment at the requested as-of date for schools in the caller current network scope.',
    'centres','integer','count','examination_centre',true,'2020-01-01'
  );

create or replace function public.network_canonical_metric_as_of(
  p_metric_key text,
  p_as_of date default current_date
)
returns table (
  metric_key text,
  as_of_date date,
  scoped_school_count bigint,
  metric_value numeric
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if p_metric_key is null or btrim(p_metric_key) = '' then
    raise exception 'Metric key is required';
  end if;
  if p_as_of is null then
    raise exception 'As-of date is required';
  end if;

  if not exists (
    select 1
    from public.canonical_metric_registry r
    where r.metric_key = p_metric_key
      and r.network_safe
      and r.effective_from <= p_as_of
      and (r.effective_to is null or r.effective_to >= p_as_of)
  ) then
    raise exception 'Metric is not available for network aggregation';
  end if;

  -- Authorization is always current. p_as_of scopes only effective-dated source facts
  -- and cannot revive an expired circuit/regional membership.
  if not exists (
    select 1
    from public.education_network_memberships m
    where m.user_id = auth.uid()
      and m.role_key in ('circuit_officer', 'regional_officer')
      and m.active_from <= current_date
      and (m.active_to is null or m.active_to >= current_date)
  ) then
    raise exception 'Permission denied';
  end if;

  if p_metric_key = 'network.school_count' then
    return query
    with current_memberships as (
      select m.role_key, m.region_id, m.circuit_id
      from public.education_network_memberships m
      where m.user_id = auth.uid()
        and m.role_key in ('circuit_officer', 'regional_officer')
        and m.active_from <= current_date
        and (m.active_to is null or m.active_to >= current_date)
    ),
    scoped_schools as (
      select distinct a.school_id
      from public.school_network_assignments a
      join current_memberships m on (
        (m.role_key = 'circuit_officer' and m.circuit_id = a.circuit_id)
        or (m.role_key = 'regional_officer' and m.region_id = a.region_id)
      )
      where a.effective_from <= p_as_of
        and (a.effective_to is null or a.effective_to >= p_as_of)
    )
    select p_metric_key, p_as_of, count(*)::bigint, count(*)::numeric
    from scoped_schools;
    return;
  elsif p_metric_key = 'staffing.establishment_posts' then
    return query
    with current_memberships as (
      select m.role_key, m.region_id, m.circuit_id
      from public.education_network_memberships m
      where m.user_id=auth.uid() and m.role_key in ('circuit_officer','regional_officer')
        and m.active_from<=current_date and (m.active_to is null or m.active_to>=current_date)
    ), scoped_schools as (
      select distinct a.school_id from public.school_network_assignments a
      join current_memberships m on ((m.role_key='circuit_officer' and m.circuit_id=a.circuit_id) or (m.role_key='regional_officer' and m.region_id=a.region_id))
      where a.effective_from<=p_as_of and (a.effective_to is null or a.effective_to>=p_as_of)
    ), metric as (
      select count(*)::numeric value from public.staffing_establishment_posts p
      join scoped_schools s on s.school_id=p.school_id
      where p.effective_from<=p_as_of and (p.effective_to is null or p.effective_to>=p_as_of)
    )
    select p_metric_key,p_as_of,(select count(*)::bigint from scoped_schools),metric.value from metric;
    return;
  elsif p_metric_key = 'staffing.occupied_posts' then
    return query
    with current_memberships as (
      select m.role_key,m.region_id,m.circuit_id from public.education_network_memberships m
      where m.user_id=auth.uid() and m.role_key in ('circuit_officer','regional_officer')
        and m.active_from<=current_date and (m.active_to is null or m.active_to>=current_date)
    ), scoped_schools as (
      select distinct a.school_id from public.school_network_assignments a
      join current_memberships m on ((m.role_key='circuit_officer' and m.circuit_id=a.circuit_id) or (m.role_key='regional_officer' and m.region_id=a.region_id))
      where a.effective_from<=p_as_of and (a.effective_to is null or a.effective_to>=p_as_of)
    ), active_posts as (
      select p.id,p.school_id from public.staffing_establishment_posts p join scoped_schools s on s.school_id=p.school_id
      where p.effective_from<=p_as_of and (p.effective_to is null or p.effective_to>=p_as_of)
    ), metric as (
      select count(distinct o.post_id)::numeric value from public.staffing_post_occupancies o
      join active_posts p on p.id=o.post_id and p.school_id=o.school_id
      where o.effective_from<=p_as_of and (o.effective_to is null or o.effective_to>=p_as_of)
    )
    select p_metric_key,p_as_of,(select count(*)::bigint from scoped_schools),metric.value from metric;
    return;
  elsif p_metric_key = 'staffing.vacant_posts' then
    return query
    with current_memberships as (
      select m.role_key,m.region_id,m.circuit_id from public.education_network_memberships m
      where m.user_id=auth.uid() and m.role_key in ('circuit_officer','regional_officer')
        and m.active_from<=current_date and (m.active_to is null or m.active_to>=current_date)
    ), scoped_schools as (
      select distinct a.school_id from public.school_network_assignments a
      join current_memberships m on ((m.role_key='circuit_officer' and m.circuit_id=a.circuit_id) or (m.role_key='regional_officer' and m.region_id=a.region_id))
      where a.effective_from<=p_as_of and (a.effective_to is null or a.effective_to>=p_as_of)
    ), active_posts as (
      select p.id,p.school_id from public.staffing_establishment_posts p join scoped_schools s on s.school_id=p.school_id
      where p.effective_from<=p_as_of and (p.effective_to is null or p.effective_to>=p_as_of)
    ), occupied as (
      select distinct o.post_id from public.staffing_post_occupancies o join active_posts p on p.id=o.post_id and p.school_id=o.school_id
      where o.effective_from<=p_as_of and (o.effective_to is null or o.effective_to>=p_as_of)
    ), metric as (
      select greatest((select count(*) from active_posts)-(select count(*) from occupied),0)::numeric value
    )
    select p_metric_key,p_as_of,(select count(*)::bigint from scoped_schools),metric.value from metric;
    return;
  elsif p_metric_key = 'hostel.capacity' then
    return query
    with current_memberships as (
      select m.role_key,m.region_id,m.circuit_id from public.education_network_memberships m
      where m.user_id=auth.uid() and m.role_key in ('circuit_officer','regional_officer')
        and m.active_from<=current_date and (m.active_to is null or m.active_to>=current_date)
    ), scoped_schools as (
      select distinct a.school_id from public.school_network_assignments a
      join current_memberships m on ((m.role_key='circuit_officer' and m.circuit_id=a.circuit_id) or (m.role_key='regional_officer' and m.region_id=a.region_id))
      where a.effective_from<=p_as_of and (a.effective_to is null or a.effective_to>=p_as_of)
    ), metric as (
      select coalesce(sum(h.capacity),0)::numeric value from public.school_hostels h join scoped_schools s on s.school_id=h.school_id
      where h.active_from<=p_as_of and (h.active_to is null or h.active_to>=p_as_of)
    )
    select p_metric_key,p_as_of,(select count(*)::bigint from scoped_schools),metric.value from metric;
    return;
  elsif p_metric_key = 'hostel.occupancy' then
    return query
    with current_memberships as (
      select m.role_key,m.region_id,m.circuit_id from public.education_network_memberships m
      where m.user_id=auth.uid() and m.role_key in ('circuit_officer','regional_officer')
        and m.active_from<=current_date and (m.active_to is null or m.active_to>=current_date)
    ), scoped_schools as (
      select distinct a.school_id from public.school_network_assignments a
      join current_memberships m on ((m.role_key='circuit_officer' and m.circuit_id=a.circuit_id) or (m.role_key='regional_officer' and m.region_id=a.region_id))
      where a.effective_from<=p_as_of and (a.effective_to is null or a.effective_to>=p_as_of)
    ), active_hostels as (
      select h.id,h.school_id from public.school_hostels h join scoped_schools s on s.school_id=h.school_id
      where h.active_from<=p_as_of and (h.active_to is null or h.active_to>=p_as_of)
    ), metric as (
      select count(*)::numeric value from public.hostel_residencies r join active_hostels h on h.id=r.hostel_id and h.school_id=r.school_id
      where r.resident_from<=p_as_of and (r.resident_to is null or r.resident_to>=p_as_of)
    )
    select p_metric_key,p_as_of,(select count(*)::bigint from scoped_schools),metric.value from metric;
    return;
  elsif p_metric_key = 'feeding.beneficiaries_served' then
    return query
    with current_memberships as (
      select m.role_key,m.region_id,m.circuit_id from public.education_network_memberships m
      where m.user_id=auth.uid() and m.role_key in ('circuit_officer','regional_officer')
        and m.active_from<=current_date and (m.active_to is null or m.active_to>=current_date)
    ), scoped_schools as (
      select distinct a.school_id from public.school_network_assignments a
      join current_memberships m on ((m.role_key='circuit_officer' and m.circuit_id=a.circuit_id) or (m.role_key='regional_officer' and m.region_id=a.region_id))
      where a.effective_from<=p_as_of and (a.effective_to is null or a.effective_to>=p_as_of)
    ), metric as (
      select coalesce(sum(d.beneficiary_count),0)::numeric value from public.feeding_service_days d join scoped_schools s on s.school_id=d.school_id
      where d.service_date=p_as_of
    )
    select p_metric_key,p_as_of,(select count(*)::bigint from scoped_schools),metric.value from metric;
    return;
  elsif p_metric_key = 'feeding.meals_served' then
    return query
    with current_memberships as (
      select m.role_key,m.region_id,m.circuit_id from public.education_network_memberships m
      where m.user_id=auth.uid() and m.role_key in ('circuit_officer','regional_officer')
        and m.active_from<=current_date and (m.active_to is null or m.active_to>=current_date)
    ), scoped_schools as (
      select distinct a.school_id from public.school_network_assignments a
      join current_memberships m on ((m.role_key='circuit_officer' and m.circuit_id=a.circuit_id) or (m.role_key='regional_officer' and m.region_id=a.region_id))
      where a.effective_from<=p_as_of and (a.effective_to is null or a.effective_to>=p_as_of)
    ), metric as (
      select coalesce(sum(d.meal_count),0)::numeric value from public.feeding_service_days d join scoped_schools s on s.school_id=d.school_id
      where d.service_date=p_as_of
    )
    select p_metric_key,p_as_of,(select count(*)::bigint from scoped_schools),metric.value from metric;
    return;
  elsif p_metric_key = 'examination.centre_count' then
    return query
    with current_memberships as (
      select m.role_key,m.region_id,m.circuit_id from public.education_network_memberships m
      where m.user_id=auth.uid() and m.role_key in ('circuit_officer','regional_officer')
        and m.active_from<=current_date and (m.active_to is null or m.active_to>=current_date)
    ), scoped_schools as (
      select distinct a.school_id from public.school_network_assignments a
      join current_memberships m on ((m.role_key='circuit_officer' and m.circuit_id=a.circuit_id) or (m.role_key='regional_officer' and m.region_id=a.region_id))
      where a.effective_from<=p_as_of and (a.effective_to is null or a.effective_to>=p_as_of)
    ), metric as (
      select count(distinct a.examination_centre_id)::numeric value
      from public.school_examination_centre_assignments a join scoped_schools s on s.school_id=a.school_id
      where a.effective_from<=p_as_of and (a.effective_to is null or a.effective_to>=p_as_of)
    )
    select p_metric_key,p_as_of,(select count(*)::bigint from scoped_schools),metric.value from metric;
    return;
  end if;

  raise exception 'Metric implementation is not available';
end;
$$;

revoke all on function public.network_canonical_metric_as_of(text,date) from public,anon;
grant execute on function public.network_canonical_metric_as_of(text,date) to authenticated;

comment on function public.network_canonical_metric_as_of(text,date) is
'Returns one coarse canonical aggregate for the caller current circuit/regional authority. Registry metadata never executes dynamically; each metric uses an explicit integrated-domain SQL branch. No per-school, learner, staff, or case identity is returned.';
