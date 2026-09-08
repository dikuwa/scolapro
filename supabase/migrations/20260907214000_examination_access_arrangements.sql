-- N10: sensitive examination access arrangements.
--
-- These are examination-domain facts attached to canonical examination_candidates.
-- They are not learner-support/counselling case records and are never inferred from
-- learner-support/SEN data. Arrangement/classification values remain source-provenanced
-- free text because no authoritative Ministry/DNEA controlled classification is loaded.

create table public.examination_access_arrangements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  examination_cycle_id uuid not null references public.examination_cycles(id) on delete restrict,
  candidate_id uuid not null references public.examination_candidates(id) on delete restrict,
  arrangement_value text not null check (btrim(arrangement_value) <> ''),
  external_code text null check (external_code is null or btrim(external_code) <> ''),
  source_name text not null check (btrim(source_name) <> ''),
  source_reference text null check (source_reference is null or btrim(source_reference) <> ''),
  effective_from date not null,
  effective_to date null,
  recorded_by_user_id uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  exclude using gist (
    candidate_id with =,
    (lower(btrim(arrangement_value))) with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  )
);

create table public.examination_access_arrangement_status_history (
  id uuid primary key default gen_random_uuid(),
  arrangement_id uuid not null references public.examination_access_arrangements(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  examination_cycle_id uuid not null references public.examination_cycles(id) on delete restrict,
  candidate_id uuid not null references public.examination_candidates(id) on delete restrict,
  status_value text not null check (btrim(status_value) <> ''),
  source_name text not null check (btrim(source_name) <> ''),
  source_reference text null check (source_reference is null or btrim(source_reference) <> ''),
  effective_from date not null,
  effective_to date null,
  recorded_by_user_id uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  exclude using gist (
    arrangement_id with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  )
);

create index examination_access_arrangements_cycle_candidate_idx
  on public.examination_access_arrangements(examination_cycle_id, candidate_id, effective_from, effective_to);
create index examination_access_arrangement_status_arrangement_idx
  on public.examination_access_arrangement_status_history(arrangement_id, effective_from, effective_to);

create or replace function app_private.enforce_examination_access_arrangement_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_candidate public.examination_candidates%rowtype;
begin
  select * into v_candidate
  from public.examination_candidates c
  where c.id = new.candidate_id;

  if not found
    or (v_candidate.tenant_id, v_candidate.school_id, v_candidate.examination_cycle_id)
       is distinct from (new.tenant_id, new.school_id, new.examination_cycle_id) then
    raise exception 'Examination access arrangement scope mismatch: candidate does not match tenant, school, and cycle';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_examination_access_arrangement_integrity()
  from public, anon, authenticated;

create trigger examination_access_arrangement_integrity_trg
before insert on public.examination_access_arrangements
for each row execute function app_private.enforce_examination_access_arrangement_integrity();

create or replace function app_private.enforce_examination_access_status_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_arrangement public.examination_access_arrangements%rowtype;
  v_status_period daterange := daterange(new.effective_from, coalesce(new.effective_to, 'infinity'::date), '[]');
  v_arrangement_period daterange;
begin
  select * into v_arrangement
  from public.examination_access_arrangements a
  where a.id = new.arrangement_id;

  if not found
    or (v_arrangement.tenant_id, v_arrangement.school_id, v_arrangement.examination_cycle_id, v_arrangement.candidate_id)
       is distinct from (new.tenant_id, new.school_id, new.examination_cycle_id, new.candidate_id) then
    raise exception 'Examination access status scope mismatch: arrangement does not match tenant, school, cycle, and candidate';
  end if;

  v_arrangement_period := daterange(
    v_arrangement.effective_from,
    coalesce(v_arrangement.effective_to, 'infinity'::date),
    '[]'
  );

  if not (v_arrangement_period @> v_status_period) then
    raise exception 'Examination access status period must be contained within the arrangement effective period';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_examination_access_status_integrity()
  from public, anon, authenticated;

create trigger examination_access_status_integrity_trg
before insert on public.examination_access_arrangement_status_history
for each row execute function app_private.enforce_examination_access_status_integrity();

alter table public.examination_access_arrangements enable row level security;
alter table public.examination_access_arrangement_status_history enable row level security;

create policy examination_access_arrangements_read
on public.examination_access_arrangements
for select to authenticated
using (app_private.can_manage_examinations(school_id));

create policy examination_access_arrangements_insert
on public.examination_access_arrangements
for insert to authenticated
with check (
  recorded_by_user_id = auth.uid()
  and app_private.can_manage_examinations(school_id)
);

create policy examination_access_status_read
on public.examination_access_arrangement_status_history
for select to authenticated
using (app_private.can_manage_examinations(school_id));

create policy examination_access_status_insert
on public.examination_access_arrangement_status_history
for insert to authenticated
with check (
  recorded_by_user_id = auth.uid()
  and app_private.can_manage_examinations(school_id)
);

revoke all on public.examination_access_arrangements from anon, authenticated;
revoke all on public.examination_access_arrangement_status_history from anon, authenticated;
grant select, insert on public.examination_access_arrangements to authenticated;
grant select, insert on public.examination_access_arrangement_status_history to authenticated;

create or replace function app_private.audit_examination_access_arrangement_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.audit_events(
    tenant_id,
    school_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  ) values (
    new.tenant_id,
    new.school_id,
    auth.uid(),
    'examination_access.arrangement.recorded',
    'examination_access_arrangement',
    new.id,
    jsonb_build_object(
      'examination_cycle_id', new.examination_cycle_id,
      'effective_from', new.effective_from,
      'effective_to', new.effective_to,
      'has_external_code', new.external_code is not null
    )
  );
  return new;
end;
$$;

create or replace function app_private.audit_examination_access_status_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.audit_events(
    tenant_id,
    school_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  ) values (
    new.tenant_id,
    new.school_id,
    auth.uid(),
    'examination_access.status.recorded',
    'examination_access_arrangement_status',
    new.id,
    jsonb_build_object(
      'arrangement_id', new.arrangement_id,
      'effective_from', new.effective_from,
      'effective_to', new.effective_to
    )
  );
  return new;
end;
$$;

revoke all on function app_private.audit_examination_access_arrangement_insert()
  from public, anon, authenticated;
revoke all on function app_private.audit_examination_access_status_insert()
  from public, anon, authenticated;

create trigger examination_access_arrangement_audit_trg
after insert on public.examination_access_arrangements
for each row execute function app_private.audit_examination_access_arrangement_insert();

create trigger examination_access_status_audit_trg
after insert on public.examination_access_arrangement_status_history
for each row execute function app_private.audit_examination_access_status_insert();

create or replace function public.get_candidate_examination_access_arrangements(
  p_candidate_id uuid,
  p_as_of date default current_date
)
returns table (
  arrangement_id uuid,
  arrangement_value text,
  external_code text,
  source_name text,
  source_reference text,
  effective_from date,
  effective_to date,
  status_value text,
  status_source_name text,
  status_source_reference text,
  status_effective_from date,
  status_effective_to date
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_candidate public.examination_candidates%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_candidate_id is null or p_as_of is null then raise exception 'Candidate and as-of date are required'; end if;

  select * into v_candidate
  from public.examination_candidates c
  where c.id = p_candidate_id;

  if not found then raise exception 'Examination candidate not found'; end if;
  if not app_private.can_manage_examinations(v_candidate.school_id) then raise exception 'Permission denied'; end if;

  return query
  select
    a.id,
    a.arrangement_value,
    a.external_code,
    a.source_name,
    a.source_reference,
    a.effective_from,
    a.effective_to,
    sh.status_value,
    sh.source_name,
    sh.source_reference,
    sh.effective_from,
    sh.effective_to
  from public.examination_access_arrangements a
  left join lateral (
    select h.status_value, h.source_name, h.source_reference, h.effective_from, h.effective_to
    from public.examination_access_arrangement_status_history h
    where h.arrangement_id = a.id
      and h.effective_from <= p_as_of
      and (h.effective_to is null or h.effective_to >= p_as_of)
    order by h.effective_from desc, h.id
    limit 1
  ) sh on true
  where a.candidate_id = p_candidate_id
    and a.effective_from <= p_as_of
    and (a.effective_to is null or a.effective_to >= p_as_of)
  order by a.effective_from, a.id;
end;
$$;

revoke all on function public.get_candidate_examination_access_arrangements(uuid, date)
  from public, anon;
grant execute on function public.get_candidate_examination_access_arrangements(uuid, date)
  to authenticated;

comment on table public.examination_access_arrangements is
'N10 sensitive examination access-arrangement facts attached to canonical examination candidates. Arrangement values are source-provenanced external facts and are never inferred from learner-support/SEN records.';
comment on table public.examination_access_arrangement_status_history is
'Append-only effective-dated status history for N10 examination access arrangements. Status values remain source-provenanced rather than using invented Ministry/DNEA enums.';
comment on function public.get_candidate_examination_access_arrangements(uuid, date) is
'N10 individual arrangement read model for existing school examination managers only. Network/circuit/regional membership alone never grants access.';
