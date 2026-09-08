-- Canonical metric registry + first network-safe aggregate slice.
--
-- The registry stores metric metadata only. It is deliberately not an executable
-- query registry and does not duplicate operational/statutory facts. Network
-- aggregation remains explicit, whitelisted SQL over canonical network facts.

create table public.canonical_metric_registry (
  metric_key text primary key,
  display_name text not null,
  description text not null,
  unit text not null,
  value_type text not null,
  aggregation_method text not null,
  source_domain text not null,
  network_safe boolean not null default false,
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now(),
  constraint canonical_metric_registry_metric_key_format
    check (metric_key ~ '^[a-z0-9]+([._][a-z0-9]+)*$'),
  constraint canonical_metric_registry_value_type
    check (value_type in ('integer','numeric','percentage')),
  constraint canonical_metric_registry_aggregation_method
    check (aggregation_method in ('count','sum','ratio')),
  constraint canonical_metric_registry_effective_period
    check (effective_to is null or effective_to >= effective_from)
);

comment on table public.canonical_metric_registry is
'Canonical metric metadata registry. Definitions are descriptive only: no executable SQL, expressions, source queries, learner identifiers or school-level fact values are stored here.';

alter table public.canonical_metric_registry enable row level security;

create policy canonical_metric_registry_authenticated_read
on public.canonical_metric_registry
for select
to authenticated
using (true);

revoke all on table public.canonical_metric_registry from public, anon;
grant select on table public.canonical_metric_registry to authenticated;

insert into public.canonical_metric_registry (
  metric_key,
  display_name,
  description,
  unit,
  value_type,
  aggregation_method,
  source_domain,
  network_safe,
  effective_from
) values (
  'network.school_count',
  'Schools in network scope',
  'Distinct schools with an effective education-network assignment inside the caller current authorized circuit or regional scope at the requested as-of date.',
  'schools',
  'integer',
  'count',
  'education_network',
  true,
  '2020-01-01'
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

  -- Historical metric dates never revive expired network authority. Authorization
  -- is based on a membership active today; p_as_of only controls historical school
  -- placement inside that current authority boundary.
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
      join current_memberships m
        on (
          (m.role_key = 'circuit_officer' and m.circuit_id = a.circuit_id)
          or
          (m.role_key = 'regional_officer' and m.region_id = a.region_id)
        )
      where a.effective_from <= p_as_of
        and (a.effective_to is null or a.effective_to >= p_as_of)
    ),
    aggregate_value as (
      select count(*)::bigint as school_count
      from scoped_schools
    )
    select
      p_metric_key,
      p_as_of,
      a.school_count,
      a.school_count::numeric
    from aggregate_value a;
    return;
  end if;

  -- Registry rows never become executable definitions. A network-safe registry
  -- entry must also have an explicit implementation branch above.
  raise exception 'Metric implementation is not available';
end;
$$;

revoke all on function public.network_canonical_metric_as_of(text, date)
  from public, anon;
grant execute on function public.network_canonical_metric_as_of(text, date)
  to authenticated;

comment on function public.network_canonical_metric_as_of(text, date) is
'Returns one coarse network-wide canonical metric row for the caller current circuit/regional authority. No per-school or learner detail is exposed; historical dates affect school placement only, not authorization.';
