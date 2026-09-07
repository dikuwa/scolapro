-- N09: examination-centre modeling separate from school identity.
--
-- Examination centres are shared examination-reference facts. They are not school
-- tenants and are not derived from EMIS numbers. Official/external identifiers are
-- optional, source-provenanced, and effective-dated. School/candidate relationships
-- remain tenant-scoped and historically reproducible.

create table public.examination_centres (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (btrim(display_name) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.examination_centre_identifier_history (
  id uuid primary key default gen_random_uuid(),
  examination_centre_id uuid not null references public.examination_centres(id) on delete restrict,
  identifier_scheme text not null check (identifier_scheme = lower(btrim(identifier_scheme)) and identifier_scheme <> ''),
  identifier_value text not null check (btrim(identifier_value) <> ''),
  source_name text not null check (btrim(source_name) <> ''),
  source_reference text null check (source_reference is null or btrim(source_reference) <> ''),
  registry_url text null check (registry_url is null or btrim(registry_url) <> ''),
  effective_from date not null,
  effective_to date null,
  recorded_at timestamptz not null default now(),
  recorded_by_user_id uuid null references auth.users(id) on delete set null,
  check (effective_to is null or effective_to >= effective_from),
  exclude using gist (
    examination_centre_id with =,
    identifier_scheme with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  ),
  exclude using gist (
    identifier_scheme with =,
    identifier_value with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  )
);

create table public.examination_centre_status_history (
  id uuid primary key default gen_random_uuid(),
  examination_centre_id uuid not null references public.examination_centres(id) on delete restrict,
  status_value text not null check (btrim(status_value) <> ''),
  source_name text not null check (btrim(source_name) <> ''),
  source_reference text null check (source_reference is null or btrim(source_reference) <> ''),
  effective_from date not null,
  effective_to date null,
  recorded_at timestamptz not null default now(),
  recorded_by_user_id uuid null references auth.users(id) on delete set null,
  check (effective_to is null or effective_to >= effective_from),
  exclude using gist (
    examination_centre_id with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  )
);

create table public.school_examination_centre_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  examination_centre_id uuid not null references public.examination_centres(id) on delete restrict,
  effective_from date not null,
  effective_to date null,
  source_name text not null check (btrim(source_name) <> ''),
  source_reference text null check (source_reference is null or btrim(source_reference) <> ''),
  created_at timestamptz not null default now(),
  created_by_user_id uuid null references auth.users(id) on delete set null,
  check (effective_to is null or effective_to >= effective_from),
  exclude using gist (
    school_id with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  )
);

create table public.examination_candidate_centre_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  examination_cycle_id uuid not null references public.examination_cycles(id) on delete restrict,
  candidate_id uuid not null references public.examination_candidates(id) on delete restrict,
  examination_centre_id uuid not null references public.examination_centres(id) on delete restrict,
  effective_from date not null,
  effective_to date null,
  source_name text not null check (btrim(source_name) <> ''),
  source_reference text null check (source_reference is null or btrim(source_reference) <> ''),
  created_at timestamptz not null default now(),
  created_by_user_id uuid null references auth.users(id) on delete set null,
  check (effective_to is null or effective_to >= effective_from),
  exclude using gist (
    candidate_id with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  )
);

create index school_examination_centre_assignment_centre_idx
  on public.school_examination_centre_assignments(examination_centre_id, effective_from, effective_to);
create index examination_candidate_centre_assignment_centre_idx
  on public.examination_candidate_centre_assignments(examination_centre_id, effective_from, effective_to);
create index examination_candidate_centre_assignment_cycle_idx
  on public.examination_candidate_centre_assignments(examination_cycle_id, candidate_id);
create index examination_centre_identifier_date_idx
  on public.examination_centre_identifier_history(examination_centre_id, identifier_scheme, effective_from, effective_to);
create index examination_centre_status_date_idx
  on public.examination_centre_status_history(examination_centre_id, effective_from, effective_to);

create or replace function app_private.enforce_school_examination_centre_assignment_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.examination_centre_id is distinct from old.examination_centre_id
  ) then
    raise exception 'School examination-centre tenant, school, and centre are immutable';
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'School examination-centre scope mismatch: school does not belong to tenant';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_school_examination_centre_assignment_integrity()
  from public, anon, authenticated;

create trigger school_examination_centre_assignment_integrity_trg
before insert or update of tenant_id, school_id, examination_centre_id
on public.school_examination_centre_assignments
for each row execute function app_private.enforce_school_examination_centre_assignment_integrity();

create or replace function app_private.enforce_examination_candidate_centre_assignment_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_candidate public.examination_candidates%rowtype;
  v_period daterange := daterange(new.effective_from, coalesce(new.effective_to, 'infinity'::date), '[]');
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.examination_cycle_id is distinct from old.examination_cycle_id
    or new.candidate_id is distinct from old.candidate_id
    or new.examination_centre_id is distinct from old.examination_centre_id
  ) then
    raise exception 'Candidate examination-centre scope fields are immutable';
  end if;

  select * into v_candidate
  from public.examination_candidates c
  where c.id = new.candidate_id;

  if not found
    or (v_candidate.tenant_id, v_candidate.school_id, v_candidate.examination_cycle_id)
       is distinct from (new.tenant_id, new.school_id, new.examination_cycle_id) then
    raise exception 'Candidate examination-centre scope mismatch: candidate does not match tenant, school, and cycle';
  end if;

  if not exists (
    select 1
    from public.school_examination_centre_assignments a
    where a.tenant_id = new.tenant_id
      and a.school_id = new.school_id
      and a.examination_centre_id = new.examination_centre_id
      and daterange(a.effective_from, coalesce(a.effective_to, 'infinity'::date), '[]') @> v_period
  ) then
    raise exception 'Candidate examination-centre assignment is not covered by the school centre assignment';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_examination_candidate_centre_assignment_integrity()
  from public, anon, authenticated;

create trigger examination_candidate_centre_assignment_integrity_trg
before insert or update of tenant_id, school_id, examination_cycle_id, candidate_id, examination_centre_id, effective_from, effective_to
on public.examination_candidate_centre_assignments
for each row execute function app_private.enforce_examination_candidate_centre_assignment_integrity();

create or replace function app_private.can_view_examination_centre(
  p_examination_centre_id uuid,
  p_as_of date default current_date
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or exists (
      select 1
      from public.school_examination_centre_assignments a
      where a.examination_centre_id = p_examination_centre_id
        and a.effective_from <= p_as_of
        and (a.effective_to is null or a.effective_to >= p_as_of)
        and (
          app_private.can_manage_examinations(a.school_id)
          or app_private.can_view_school_via_network(a.school_id, p_as_of)
        )
    );
$$;

revoke all on function app_private.can_view_examination_centre(uuid, date)
  from public, anon, authenticated;

aLTER TABLE public.examination_centres ENABLE ROW LEVEL SECURITY;
aLTER TABLE public.examination_centre_identifier_history ENABLE ROW LEVEL SECURITY;
aLTER TABLE public.examination_centre_status_history ENABLE ROW LEVEL SECURITY;
aLTER TABLE public.school_examination_centre_assignments ENABLE ROW LEVEL SECURITY;
aLTER TABLE public.examination_candidate_centre_assignments ENABLE ROW LEVEL SECURITY;

create policy examination_centres_read on public.examination_centres
for select to authenticated
using (app_private.can_view_examination_centre(id, current_date));
create policy examination_centres_platform_manage on public.examination_centres
for all to authenticated
using (app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_platform_role(array['platform_admin']));

create policy examination_centre_identifier_read on public.examination_centre_identifier_history
for select to authenticated
using (app_private.can_view_examination_centre(examination_centre_id, current_date));
create policy examination_centre_identifier_platform_manage on public.examination_centre_identifier_history
for all to authenticated
using (app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_platform_role(array['platform_admin']));

create policy examination_centre_status_read on public.examination_centre_status_history
for select to authenticated
using (app_private.can_view_examination_centre(examination_centre_id, current_date));
create policy examination_centre_status_platform_manage on public.examination_centre_status_history
for all to authenticated
using (app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_platform_role(array['platform_admin']));

create policy school_examination_centre_assignment_read on public.school_examination_centre_assignments
for select to authenticated
using (
  app_private.has_platform_role(array['platform_admin'])
  or app_private.can_manage_examinations(school_id)
  or app_private.can_view_school_via_network(school_id, current_date)
);
create policy school_examination_centre_assignment_manage on public.school_examination_centre_assignments
for all to authenticated
using (app_private.can_manage_examinations(school_id))
with check (app_private.can_manage_examinations(school_id));

create policy examination_candidate_centre_assignment_read on public.examination_candidate_centre_assignments
for select to authenticated
using (app_private.can_manage_examinations(school_id));
create policy examination_candidate_centre_assignment_manage on public.examination_candidate_centre_assignments
for all to authenticated
using (app_private.can_manage_examinations(school_id))
with check (app_private.can_manage_examinations(school_id));

revoke all on public.examination_centres from anon, authenticated;
revoke all on public.examination_centre_identifier_history from anon, authenticated;
revoke all on public.examination_centre_status_history from anon, authenticated;
revoke all on public.school_examination_centre_assignments from anon, authenticated;
revoke all on public.examination_candidate_centre_assignments from anon, authenticated;

grant select, insert, update, delete on public.examination_centres to authenticated;
grant select, insert, update, delete on public.examination_centre_identifier_history to authenticated;
grant select, insert, update, delete on public.examination_centre_status_history to authenticated;
grant select, insert, update, delete on public.school_examination_centre_assignments to authenticated;
grant select, insert, update, delete on public.examination_candidate_centre_assignments to authenticated;

create table public.examination_centre_audit_events (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id uuid not null,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  actor_user_id uuid null,
  old_data jsonb null,
  new_data jsonb null,
  occurred_at timestamptz not null default now(),
  transaction_id bigint not null default txid_current()
);

alter table public.examination_centre_audit_events enable row level security;
revoke all on public.examination_centre_audit_events from anon, authenticated;
grant select on public.examination_centre_audit_events to authenticated;
create policy examination_centre_audit_platform_read on public.examination_centre_audit_events
for select to authenticated
using (app_private.has_platform_role(array['platform_admin']));

create or replace function app_private.audit_examination_centre_mutation()
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
  v_old := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  v_new := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;
  v_row_id := coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid);

  insert into public.examination_centre_audit_events(
    table_name, row_id, action, actor_user_id, old_data, new_data
  ) values (
    tg_table_name, v_row_id, tg_op, auth.uid(), v_old, v_new
  );

  return coalesce(new, old);
end;
$$;

create or replace function app_private.enforce_examination_centre_audit_immutability()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'Examination-centre audit events are immutable';
end;
$$;

revoke all on function app_private.audit_examination_centre_mutation() from public, anon, authenticated;
revoke all on function app_private.enforce_examination_centre_audit_immutability() from public, anon, authenticated;

create trigger examination_centres_audit_trg
after insert or update or delete on public.examination_centres
for each row execute function app_private.audit_examination_centre_mutation();
create trigger examination_centre_identifier_history_audit_trg
after insert or update or delete on public.examination_centre_identifier_history
for each row execute function app_private.audit_examination_centre_mutation();
create trigger examination_centre_status_history_audit_trg
after insert or update or delete on public.examination_centre_status_history
for each row execute function app_private.audit_examination_centre_mutation();
create trigger school_examination_centre_assignments_audit_trg
after insert or update or delete on public.school_examination_centre_assignments
for each row execute function app_private.audit_examination_centre_mutation();
create trigger examination_candidate_centre_assignments_audit_trg
after insert or update or delete on public.examination_candidate_centre_assignments
for each row execute function app_private.audit_examination_centre_mutation();
create trigger examination_centre_audit_immutable_trg
before update or delete on public.examination_centre_audit_events
for each row execute function app_private.enforce_examination_centre_audit_immutability();

create or replace function public.list_examination_centres_scope(
  p_as_of date default current_date
)
returns table (
  examination_centre_id uuid,
  centre_name text,
  status_value text,
  assigned_school_count bigint,
  candidate_count bigint,
  access_scope text
)
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  with current_network_memberships as (
    select m.role_key, m.region_id, m.circuit_id
    from public.education_network_memberships m
    where m.user_id = auth.uid()
      and m.active_from <= current_date
      and (m.active_to is null or m.active_to >= current_date)
  ),
  scoped_assignments as (
    select distinct a.id, a.school_id, a.examination_centre_id
    from public.school_examination_centre_assignments a
    where auth.uid() is not null
      and a.effective_from <= p_as_of
      and (a.effective_to is null or a.effective_to >= p_as_of)
      and (
        app_private.can_manage_examinations(a.school_id)
        or exists (
          select 1
          from public.school_network_assignments sna
          join current_network_memberships m
            on (
              (m.role_key = 'circuit_officer' and m.circuit_id = sna.circuit_id)
              or
              (m.role_key = 'regional_officer' and m.region_id = sna.region_id)
            )
          where sna.school_id = a.school_id
            and sna.effective_from <= p_as_of
            and (sna.effective_to is null or sna.effective_to >= p_as_of)
        )
      )
  ),
  scoped_centres as (
    select distinct sa.examination_centre_id
    from scoped_assignments sa
  )
  select
    c.id,
    c.display_name,
    (
      select sh.status_value
      from public.examination_centre_status_history sh
      where sh.examination_centre_id = c.id
        and sh.effective_from <= p_as_of
        and (sh.effective_to is null or sh.effective_to >= p_as_of)
      order by sh.effective_from desc, sh.id
      limit 1
    ),
    (
      select count(distinct sa.school_id)::bigint
      from scoped_assignments sa
      where sa.examination_centre_id = c.id
    ),
    (
      select count(distinct cca.candidate_id)::bigint
      from public.examination_candidate_centre_assignments cca
      join public.examination_candidates ec on ec.id = cca.candidate_id
      join scoped_assignments sa
        on sa.school_id = cca.school_id
       and sa.examination_centre_id = cca.examination_centre_id
      where cca.examination_centre_id = c.id
        and cca.effective_from <= p_as_of
        and (cca.effective_to is null or cca.effective_to >= p_as_of)
        and ec.registration_status <> 'withdrawn'
    ),
    case when exists (
      select 1
      from scoped_assignments sa
      where sa.examination_centre_id = c.id
        and app_private.can_manage_examinations(sa.school_id)
    ) then 'school' else 'network' end
  from public.examination_centres c
  join scoped_centres sc on sc.examination_centre_id = c.id
  order by c.display_name, c.id;
$$;

revoke all on function public.list_examination_centres_scope(date) from public, anon;
grant execute on function public.list_examination_centres_scope(date) to authenticated;

comment on table public.examination_centres is
'N09 examination-centre identity. A centre is a distinct examination reference fact and is never inferred from a school, EMIS number, or tenant identity.';
comment on table public.examination_centre_identifier_history is
'Optional effective-dated external examination-centre identifiers with explicit source provenance. Absence of a row means no authoritative identifier has been recorded; ScolaPro never invents one.';
comment on table public.school_examination_centre_assignments is
'Effective-dated relationship between a canonical school and a distinct examination centre. One centre may serve multiple schools, including schools in different tenants.';
comment on table public.examination_candidate_centre_assignments is
'Effective-dated candidate-to-centre association reusing the canonical examination candidate; no learner or candidate identity is duplicated.';
comment on function public.list_examination_centres_scope(date) is
'N09 aggregate examination-centre projection for school examination managers and currently-active circuit/regional memberships. Network output contains centre and aggregate counts only and does not enumerate learner/candidate identity.';
comment on column public.examination_candidates.centre_number is
'Legacy official centre-number value captured with candidate registration. N09 does not derive it from EMIS or from examination-centre identity; authoritative identifier reconciliation remains source-driven.';
