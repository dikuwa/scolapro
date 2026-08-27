create table if not exists public.statutory_form_definitions (
  id uuid primary key default gen_random_uuid(),
  form_key text not null,
  display_name text not null,
  authority text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (form_key)
);

create table if not exists public.statutory_form_versions (
  id uuid primary key default gen_random_uuid(),
  form_definition_id uuid not null references public.statutory_form_definitions(id) on delete cascade,
  version_key text not null,
  effective_from date not null,
  effective_to date,
  source_reference text,
  field_schema jsonb not null default '{}'::jsonb,
  mapping_schema jsonb not null default '{}'::jsonb,
  validation_schema jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','approved','published','superseded','withdrawn')),
  created_at timestamptz not null default now(),
  unique (form_definition_id, version_key),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.statutory_reporting_cycles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  form_version_id uuid not null references public.statutory_form_versions(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  cycle_key text not null,
  reference_date date not null,
  opens_on date,
  due_on date,
  status text not null default 'open' check (status in ('open','review','certified','locked','submitted','archived')),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, form_version_id, cycle_key)
);

create table if not exists public.statutory_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  reporting_cycle_id uuid not null references public.statutory_reporting_cycles(id) on delete cascade,
  snapshot_number integer not null default 1,
  values jsonb not null default '{}'::jsonb,
  source_summary jsonb not null default '{}'::jsonb,
  generated_by_user_id uuid not null references auth.users(id) on delete restrict,
  generated_at timestamptz not null default now(),
  status text not null default 'provisional' check (status in ('provisional','reviewed','certified','locked')),
  unique (reporting_cycle_id, snapshot_number)
);

create table if not exists public.statutory_readiness_issues (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  reporting_cycle_id uuid not null references public.statutory_reporting_cycles(id) on delete cascade,
  issue_code text not null,
  domain_type text,
  domain_id uuid,
  severity text not null default 'blocking' check (severity in ('info','warning','blocking')),
  message text not null,
  resolved boolean not null default false,
  resolved_at timestamptz,
  resolved_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.statutory_certifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  reporting_cycle_id uuid not null references public.statutory_reporting_cycles(id) on delete restrict,
  snapshot_id uuid not null references public.statutory_snapshots(id) on delete restrict,
  certification_role text not null,
  certified_by_user_id uuid not null references auth.users(id) on delete restrict,
  certified_at timestamptz not null default now(),
  statement text,
  created_at timestamptz not null default now(),
  unique (reporting_cycle_id, certification_role)
);

create index if not exists statutory_cycles_school_status_idx on public.statutory_reporting_cycles(school_id, status, due_on);
create index if not exists statutory_snapshots_cycle_idx on public.statutory_snapshots(reporting_cycle_id, snapshot_number desc);
create index if not exists statutory_issues_cycle_idx on public.statutory_readiness_issues(reporting_cycle_id, resolved, severity);

alter table public.statutory_form_definitions enable row level security;
alter table public.statutory_form_versions enable row level security;
alter table public.statutory_reporting_cycles enable row level security;
alter table public.statutory_snapshots enable row level security;
alter table public.statutory_readiness_issues enable row level security;
alter table public.statutory_certifications enable row level security;

create or replace function app_private.can_manage_statutory(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.has_platform_role(array['platform_admin','platform_support'])
    or app_private.has_school_role(target_school_id, array['school_admin','principal','deputy_principal','emis_officer']);
$$;

grant execute on function app_private.can_manage_statutory(uuid) to authenticated;

create policy "authenticated users can read published statutory definitions"
on public.statutory_form_definitions for select to authenticated
using (active = true);

create policy "authenticated users can read statutory form versions"
on public.statutory_form_versions for select to authenticated
using (status in ('approved','published','superseded'));

create policy "platform admins can manage statutory definitions"
on public.statutory_form_definitions for all to authenticated
using (app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_platform_role(array['platform_admin']));

create policy "platform admins can manage statutory versions"
on public.statutory_form_versions for all to authenticated
using (app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_platform_role(array['platform_admin']));

create policy "statutory staff can read reporting cycles" on public.statutory_reporting_cycles for select to authenticated using (app_private.can_manage_statutory(school_id));
create policy "statutory staff can manage reporting cycles" on public.statutory_reporting_cycles for all to authenticated using (app_private.can_manage_statutory(school_id)) with check (app_private.can_manage_statutory(school_id));
create policy "statutory staff can read snapshots" on public.statutory_snapshots for select to authenticated using (app_private.can_manage_statutory(school_id));
create policy "statutory staff can manage provisional snapshots" on public.statutory_snapshots for all to authenticated using (app_private.can_manage_statutory(school_id)) with check (app_private.can_manage_statutory(school_id));
create policy "statutory staff can read readiness issues" on public.statutory_readiness_issues for select to authenticated using (app_private.can_manage_statutory(school_id));
create policy "statutory staff can manage readiness issues" on public.statutory_readiness_issues for all to authenticated using (app_private.can_manage_statutory(school_id)) with check (app_private.can_manage_statutory(school_id));
create policy "statutory staff can read certifications" on public.statutory_certifications for select to authenticated using (app_private.can_manage_statutory(school_id));
create policy "school leaders can create statutory certifications" on public.statutory_certifications for insert to authenticated with check (certified_by_user_id = auth.uid() and app_private.has_school_role(school_id, array['principal','school_admin']));

create or replace function public.certify_statutory_snapshot(
  p_snapshot_id uuid,
  p_certification_role text,
  p_statement text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot public.statutory_snapshots%rowtype;
  v_cycle public.statutory_reporting_cycles%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_snapshot from public.statutory_snapshots where id = p_snapshot_id for update;
  if not found then raise exception 'Statutory snapshot not found'; end if;
  select * into v_cycle from public.statutory_reporting_cycles where id = v_snapshot.reporting_cycle_id for update;
  if not found then raise exception 'Reporting cycle not found'; end if;
  if not app_private.has_school_role(v_snapshot.school_id, array['principal','school_admin']) then raise exception 'Permission denied'; end if;
  if exists (select 1 from public.statutory_readiness_issues sri where sri.reporting_cycle_id = v_cycle.id and sri.resolved = false and sri.severity = 'blocking') then raise exception 'Blocking statutory readiness issues must be resolved before certification'; end if;
  if v_snapshot.status not in ('provisional','reviewed') then raise exception 'Snapshot cannot be certified from its current state'; end if;

  insert into public.statutory_certifications (tenant_id, school_id, reporting_cycle_id, snapshot_id, certification_role, certified_by_user_id, statement)
  values (v_snapshot.tenant_id, v_snapshot.school_id, v_cycle.id, v_snapshot.id, lower(btrim(p_certification_role)), auth.uid(), nullif(btrim(coalesce(p_statement,'')), ''))
  returning id into v_id;

  update public.statutory_snapshots set status = 'certified' where id = v_snapshot.id;
  update public.statutory_reporting_cycles set status = 'certified', updated_at = now() where id = v_cycle.id;

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_snapshot.tenant_id, v_snapshot.school_id, auth.uid(), 'statutory.snapshot.certified', 'statutory_snapshot', v_snapshot.id,
    jsonb_build_object('reporting_cycle_id', v_cycle.id, 'certification_role', lower(btrim(p_certification_role))));

  return v_id;
end;
$$;

revoke all on function public.certify_statutory_snapshot(uuid,text,text) from public, anon;
grant execute on function public.certify_statutory_snapshot(uuid,text,text) to authenticated;

comment on table public.statutory_reporting_cycles is 'School statutory reporting window with a fixed reference date and versioned form definition.';
comment on table public.statutory_snapshots is 'Immutable-in-principle generated statutory value snapshot separated from live operational data.';
comment on table public.statutory_readiness_issues is 'Exception-driven readiness findings that should be fixed at source where possible before certification.';
comment on table public.statutory_certifications is 'Role-specific certification evidence bound to one snapshot and reporting cycle.';