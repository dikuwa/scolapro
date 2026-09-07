-- N02/N03/N04: shared education-network reference hierarchy, versioned school
-- identifiers, effective school placement, and circuit/regional membership scope.
--
-- These records are Ministry/reference facts, not school tenants. Legacy
-- schools.region / schools.town / schools.emis remain untouched for compatibility.

create extension if not exists btree_gist;

create table public.education_authorities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  external_code text null check (external_code is null or btrim(external_code) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.education_regions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  external_code text null check (external_code is null or btrim(external_code) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.education_circuits (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  external_code text null check (external_code is null or btrim(external_code) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.education_clusters (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  external_code text null check (external_code is null or btrim(external_code) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Parent relationships are versioned separately from stable entity identity so
-- administrative boundary changes do not rewrite history.
create table public.education_region_authority_history (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.education_regions(id) on delete restrict,
  authority_id uuid not null references public.education_authorities(id) on delete restrict,
  effective_from date not null,
  effective_to date null,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  exclude using gist (
    region_id with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  )
);

create table public.education_circuit_region_history (
  id uuid primary key default gen_random_uuid(),
  circuit_id uuid not null references public.education_circuits(id) on delete restrict,
  region_id uuid not null references public.education_regions(id) on delete restrict,
  effective_from date not null,
  effective_to date null,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  exclude using gist (
    circuit_id with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  )
);

create table public.education_cluster_circuit_history (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.education_clusters(id) on delete restrict,
  circuit_id uuid not null references public.education_circuits(id) on delete restrict,
  effective_from date not null,
  effective_to date null,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  exclude using gist (
    cluster_id with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  )
);

create table public.school_network_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  authority_id uuid not null references public.education_authorities(id) on delete restrict,
  region_id uuid not null references public.education_regions(id) on delete restrict,
  circuit_id uuid not null references public.education_circuits(id) on delete restrict,
  cluster_id uuid null references public.education_clusters(id) on delete restrict,
  effective_from date not null,
  effective_to date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  exclude using gist (
    school_id with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  )
);

create table public.school_external_identifiers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  identifier_scheme text not null,
  identifier_value text not null,
  registry_url text null,
  effective_from date not null,
  effective_to date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (identifier_scheme = lower(btrim(identifier_scheme)) and identifier_scheme <> ''),
  check (btrim(identifier_value) <> ''),
  check (registry_url is null or btrim(registry_url) <> ''),
  check (effective_to is null or effective_to >= effective_from),
  exclude using gist (
    school_id with =,
    identifier_scheme with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  ),
  exclude using gist (
    identifier_scheme with =,
    identifier_value with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  )
);

create table public.education_network_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_key text not null check (role_key in ('regional_officer', 'circuit_officer')),
  region_id uuid null references public.education_regions(id) on delete restrict,
  circuit_id uuid null references public.education_circuits(id) on delete restrict,
  active_from date not null,
  active_to date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (active_to is null or active_to >= active_from),
  check (
    (role_key = 'regional_officer' and region_id is not null and circuit_id is null)
    or
    (role_key = 'circuit_officer' and circuit_id is not null and region_id is null)
  )
);

alter table public.education_network_memberships
  add constraint education_network_memberships_regional_no_overlap
  exclude using gist (
    user_id with =,
    region_id with =,
    daterange(active_from, coalesce(active_to, 'infinity'::date), '[]') with &&
  ) where (role_key = 'regional_officer');

alter table public.education_network_memberships
  add constraint education_network_memberships_circuit_no_overlap
  exclude using gist (
    user_id with =,
    circuit_id with =,
    daterange(active_from, coalesce(active_to, 'infinity'::date), '[]') with &&
  ) where (role_key = 'circuit_officer');

create index school_network_assignments_school_date_idx
  on public.school_network_assignments(school_id, effective_from, effective_to);
create index school_external_identifiers_school_scheme_idx
  on public.school_external_identifiers(school_id, identifier_scheme, effective_from);
create index education_network_memberships_user_date_idx
  on public.education_network_memberships(user_id, active_from, active_to);

create or replace function app_private.enforce_school_network_assignment_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_period daterange := daterange(new.effective_from, coalesce(new.effective_to, 'infinity'::date), '[]');
begin
  if not exists (
    select 1
    from public.education_region_authority_history h
    where h.region_id = new.region_id
      and h.authority_id = new.authority_id
      and daterange(h.effective_from, coalesce(h.effective_to, 'infinity'::date), '[]') @> v_period
  ) then
    raise exception 'School network hierarchy mismatch: region is not under authority for the full assignment period';
  end if;

  if not exists (
    select 1
    from public.education_circuit_region_history h
    where h.circuit_id = new.circuit_id
      and h.region_id = new.region_id
      and daterange(h.effective_from, coalesce(h.effective_to, 'infinity'::date), '[]') @> v_period
  ) then
    raise exception 'School network hierarchy mismatch: circuit is not under region for the full assignment period';
  end if;

  if new.cluster_id is not null and not exists (
    select 1
    from public.education_cluster_circuit_history h
    where h.cluster_id = new.cluster_id
      and h.circuit_id = new.circuit_id
      and daterange(h.effective_from, coalesce(h.effective_to, 'infinity'::date), '[]') @> v_period
  ) then
    raise exception 'School network hierarchy mismatch: cluster is not under circuit for the full assignment period';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_school_network_assignment_hierarchy() from public, anon, authenticated;

create trigger school_network_assignment_hierarchy_trg
before insert or update of authority_id, region_id, circuit_id, cluster_id, effective_from, effective_to
on public.school_network_assignments
for each row execute function app_private.enforce_school_network_assignment_hierarchy();

-- Network visibility is intentionally limited to school/reference scope. This
-- helper is not used by learner/staff-sensitive RLS policies.
create or replace function app_private.can_view_school_via_network(
  p_school_id uuid,
  p_as_of date default current_date
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.school_network_assignments a
    join public.education_network_memberships m
      on m.user_id = auth.uid()
     and m.active_from <= p_as_of
     and (m.active_to is null or m.active_to >= p_as_of)
    where a.school_id = p_school_id
      and a.effective_from <= p_as_of
      and (a.effective_to is null or a.effective_to >= p_as_of)
      and (
        (m.role_key = 'circuit_officer' and m.circuit_id = a.circuit_id)
        or
        (m.role_key = 'regional_officer' and m.region_id = a.region_id)
      )
  );
$$;

revoke all on function app_private.can_view_school_via_network(uuid, date) from public, anon;
grant execute on function app_private.can_view_school_via_network(uuid, date) to authenticated;

-- Append-only audit trail dedicated to shared network-governance mutations. It
-- has no tenant scope because the underlying hierarchy is shared reference data.
create table public.education_network_audit_events (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id uuid not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor_user_id uuid null,
  old_data jsonb null,
  new_data jsonb null,
  occurred_at timestamptz not null default now(),
  transaction_id bigint not null default txid_current()
);

create or replace function app_private.audit_education_network_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row_id uuid;
begin
  v_old := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_row_id := coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid);

  insert into public.education_network_audit_events(
    table_name, row_id, action, actor_user_id, old_data, new_data
  ) values (
    tg_table_name, v_row_id, tg_op, auth.uid(), v_old, v_new
  );

  return coalesce(new, old);
end;
$$;

create or replace function app_private.enforce_education_network_audit_immutability()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'Education network audit events are immutable';
end;
$$;

revoke all on function app_private.audit_education_network_mutation() from public, anon, authenticated;
revoke all on function app_private.enforce_education_network_audit_immutability() from public, anon, authenticated;

create trigger education_network_audit_immutable_trg
before update or delete on public.education_network_audit_events
for each row execute function app_private.enforce_education_network_audit_immutability();

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'education_authorities',
    'education_regions',
    'education_circuits',
    'education_clusters',
    'education_region_authority_history',
    'education_circuit_region_history',
    'education_cluster_circuit_history',
    'school_network_assignments',
    'school_external_identifiers',
    'education_network_memberships'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function app_private.audit_education_network_mutation()',
      v_table || '_audit_trg', v_table
    );
  end loop;
end;
$$;

-- Reference facts are shared and readable to authenticated users. Governed
-- mutations remain service/platform-admin only; network roles receive no writes.
alter table public.education_authorities enable row level security;
alter table public.education_regions enable row level security;
alter table public.education_circuits enable row level security;
alter table public.education_clusters enable row level security;
alter table public.education_region_authority_history enable row level security;
alter table public.education_circuit_region_history enable row level security;
alter table public.education_cluster_circuit_history enable row level security;
alter table public.school_network_assignments enable row level security;
alter table public.school_external_identifiers enable row level security;
alter table public.education_network_memberships enable row level security;
alter table public.education_network_audit_events enable row level security;

create policy education_authorities_read on public.education_authorities
for select to authenticated using (true);
create policy education_regions_read on public.education_regions
for select to authenticated using (true);
create policy education_circuits_read on public.education_circuits
for select to authenticated using (true);
create policy education_clusters_read on public.education_clusters
for select to authenticated using (true);
create policy education_region_authority_history_read on public.education_region_authority_history
for select to authenticated using (true);
create policy education_circuit_region_history_read on public.education_circuit_region_history
for select to authenticated using (true);
create policy education_cluster_circuit_history_read on public.education_cluster_circuit_history
for select to authenticated using (true);

create policy education_network_memberships_self_read on public.education_network_memberships
for select to authenticated using (
  user_id = auth.uid() or app_private.has_platform_role(array['platform_admin'])
);

create policy school_network_assignments_scoped_read on public.school_network_assignments
for select to authenticated using (
  app_private.has_platform_role(array['platform_admin'])
  or app_private.has_school_membership_scope(school_id)
  or app_private.can_view_school_via_network(school_id, current_date)
);

create policy school_external_identifiers_scoped_read on public.school_external_identifiers
for select to authenticated using (
  app_private.has_platform_role(array['platform_admin'])
  or app_private.has_school_membership_scope(school_id)
  or app_private.can_view_school_via_network(school_id, current_date)
);

-- Network roles gain school-directory visibility only. Existing school policies
-- continue to govern school-tenant users; this policy adds the network path.
create policy schools_network_scoped_read on public.schools
for select to authenticated using (
  app_private.can_view_school_via_network(id, current_date)
);

-- Only Platform Admin may mutate governed network facts through normal user
-- sessions. service_role continues to bypass RLS for controlled back-office jobs.
create policy education_authorities_platform_write on public.education_authorities
for all to authenticated using (app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_platform_role(array['platform_admin']));
create policy education_regions_platform_write on public.education_regions
for all to authenticated using (app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_platform_role(array['platform_admin']));
create policy education_circuits_platform_write on public.education_circuits
for all to authenticated using (app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_platform_role(array['platform_admin']));
create policy education_clusters_platform_write on public.education_clusters
for all to authenticated using (app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_platform_role(array['platform_admin']));
create policy education_region_authority_history_platform_write on public.education_region_authority_history
for all to authenticated using (app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_platform_role(array['platform_admin']));
create policy education_circuit_region_history_platform_write on public.education_circuit_region_history
for all to authenticated using (app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_platform_role(array['platform_admin']));
create policy education_cluster_circuit_history_platform_write on public.education_cluster_circuit_history
for all to authenticated using (app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_platform_role(array['platform_admin']));
create policy school_network_assignments_platform_write on public.school_network_assignments
for all to authenticated using (app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_platform_role(array['platform_admin']));
create policy school_external_identifiers_platform_write on public.school_external_identifiers
for all to authenticated using (app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_platform_role(array['platform_admin']));
create policy education_network_memberships_platform_write on public.education_network_memberships
for all to authenticated using (app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_platform_role(array['platform_admin']));

revoke all on public.education_network_audit_events from anon, authenticated;
grant select on public.education_authorities, public.education_regions,
  public.education_circuits, public.education_clusters,
  public.education_region_authority_history, public.education_circuit_region_history,
  public.education_cluster_circuit_history, public.school_network_assignments,
  public.school_external_identifiers, public.education_network_memberships
  to authenticated;
grant insert, update, delete on public.education_authorities, public.education_regions,
  public.education_circuits, public.education_clusters,
  public.education_region_authority_history, public.education_circuit_region_history,
  public.education_cluster_circuit_history, public.school_network_assignments,
  public.school_external_identifiers, public.education_network_memberships
  to authenticated;

comment on function app_private.can_view_school_via_network(uuid, date) is
'Network-scope school-directory access only. This helper must not be added to learner/staff-sensitive RLS policies or used to bypass stronger permissions.';
comment on table public.school_external_identifiers is
'Effective-dated governed external school identifiers. Legacy schools.emis remains compatible and is not rewritten by this table.';
comment on table public.education_network_audit_events is
'Append-only audit trail for governed shared education-network reference, placement, identifier and membership mutations.';
