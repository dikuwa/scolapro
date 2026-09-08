-- DNEA readiness hardening follow-up.
--
-- Two invariants are enforced here without creating a second candidate/readiness
-- truth store:
--   1. Historical fact selection never rewinds network authorization. A caller
--      must hold an active network membership now; p_as_of only selects the
--      historical school/network fact relationship.
--   2. examination_readiness_issues remains a regenerable snapshot derived from
--      canonical examination facts. Canonical mutations deterministically
--      recompile the affected cycle in the same transaction.

create or replace function app_private.can_view_dnea_school_via_current_network(
  p_school_id uuid,
  p_as_of date default current_date
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.school_network_assignments a
      join public.education_network_memberships m
        on m.user_id = auth.uid()
       -- Authorization is deliberately evaluated at the real current date.
       and m.active_from <= current_date
       and (m.active_to is null or m.active_to >= current_date)
      where a.school_id = p_school_id
        -- p_as_of applies only to the historical school/network fact.
        and a.effective_from <= p_as_of
        and (a.effective_to is null or a.effective_to >= p_as_of)
        and (
          (m.role_key = 'circuit_officer' and m.circuit_id = a.circuit_id)
          or
          (m.role_key = 'regional_officer' and m.region_id = a.region_id)
        )
    );
$$;

revoke all on function app_private.can_view_dnea_school_via_current_network(uuid, date)
  from public, anon, authenticated;

create or replace function public.list_dnea_readiness_scope(
  p_as_of date default current_date
)
returns table (
  school_id uuid,
  school_name text,
  examination_cycle_id uuid,
  cycle_key text,
  cycle_name text,
  academic_year integer,
  candidate_count bigint,
  ready_count bigint,
  blocking_count bigint,
  warning_count bigint,
  access_scope text
)
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select
    c.school_id,
    s.name as school_name,
    c.id as examination_cycle_id,
    c.cycle_key,
    c.display_name as cycle_name,
    c.academic_year,
    (select count(*) from public.examination_candidates ec
      where ec.examination_cycle_id = c.id and ec.registration_status <> 'withdrawn') as candidate_count,
    (select count(*) from public.examination_candidates ec
      where ec.examination_cycle_id = c.id
        and ec.registration_status <> 'withdrawn'
        and not exists (
          select 1 from public.examination_readiness_issues ri
          where ri.examination_cycle_id = c.id
            and ri.candidate_id = ec.id
            and ri.resolved = false
            and ri.severity = 'blocking'
        )) as ready_count,
    (select count(*) from public.examination_readiness_issues ri
      where ri.examination_cycle_id = c.id and ri.resolved = false and ri.severity = 'blocking') as blocking_count,
    (select count(*) from public.examination_readiness_issues ri
      where ri.examination_cycle_id = c.id and ri.resolved = false and ri.severity = 'warning') as warning_count,
    case when app_private.can_manage_examinations(c.school_id) then 'school' else 'network' end as access_scope
  from public.examination_cycles c
  join public.schools s on s.id = c.school_id
  where auth.uid() is not null
    and (
      app_private.can_manage_examinations(c.school_id)
      or app_private.can_view_dnea_school_via_current_network(c.school_id, p_as_of)
    )
  order by c.academic_year desc, s.name, c.display_name;
$$;

revoke all on function public.list_dnea_readiness_scope(date) from public, anon;
grant execute on function public.list_dnea_readiness_scope(date) to authenticated;

comment on function public.list_dnea_readiness_scope(date) is
'DNEA readiness aggregate. School examination managers retain their existing authority. Network callers must be actively authorized now; p_as_of selects historical school/network facts only and cannot revive expired membership. Candidate identity and support/access-arrangement detail are excluded.';

-- Internal engine: exact rules from the original DNEA readiness foundation,
-- separated from caller authorization so database mutation triggers can reconcile
-- snapshots even when the mutation is performed by a governed SECURITY DEFINER
-- path. It does not introduce any new DNEA rule, code, category, or candidate fact.
create or replace function app_private.rebuild_examination_readiness(
  p_cycle_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cycle public.examination_cycles%rowtype;
  v_count integer;
begin
  select * into v_cycle
  from public.examination_cycles
  where id = p_cycle_id;

  -- Cascading deletes can invoke reconciliation after a cycle has disappeared.
  if not found then
    return 0;
  end if;

  delete from public.examination_readiness_issues
  where examination_cycle_id = v_cycle.id
    and resolved = false;

  insert into public.examination_readiness_issues (
    tenant_id, school_id, examination_cycle_id, candidate_id,
    issue_code, severity, message
  )
  select
    ec.tenant_id, ec.school_id, ec.examination_cycle_id, ec.id,
    'identity_incomplete', 'blocking', 'Candidate identity has not been verified.'
  from public.examination_candidates ec
  where ec.examination_cycle_id = v_cycle.id
    and ec.identity_verified = false;

  insert into public.examination_readiness_issues (
    tenant_id, school_id, examination_cycle_id, candidate_id,
    issue_code, severity, message
  )
  select
    ec.tenant_id, ec.school_id, ec.examination_cycle_id, ec.id,
    'no_subjects', 'blocking', 'Candidate has no examination subjects registered.'
  from public.examination_candidates ec
  where ec.examination_cycle_id = v_cycle.id
    and not exists (
      select 1
      from public.examination_subject_registrations esr
      where esr.candidate_id = ec.id
        and esr.registration_status <> 'withdrawn'
    );

  insert into public.examination_readiness_issues (
    tenant_id, school_id, examination_cycle_id, candidate_id,
    subject_registration_id, issue_code, severity, message
  )
  select
    esr.tenant_id, esr.school_id, ec.examination_cycle_id, ec.id, esr.id,
    'subject_code_missing_mapping', 'warning',
    'Examination subject is not linked to a configured school subject offering.'
  from public.examination_subject_registrations esr
  join public.examination_candidates ec on ec.id = esr.candidate_id
  where ec.examination_cycle_id = v_cycle.id
    and esr.subject_offering_id is null
    and esr.registration_status <> 'withdrawn';

  select count(*) into v_count
  from public.examination_readiness_issues
  where examination_cycle_id = v_cycle.id
    and resolved = false;

  return v_count;
end;
$$;

revoke all on function app_private.rebuild_examination_readiness(uuid)
  from public, anon, authenticated;

-- Preserve the public refresh contract and its existing school examination
-- management authorization boundary while delegating recomputation to one engine.
create or replace function public.refresh_examination_readiness(p_cycle_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_cycle public.examination_cycles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_cycle
  from public.examination_cycles
  where id = p_cycle_id;

  if not found then
    raise exception 'Examination cycle not found';
  end if;

  if not app_private.can_manage_examinations(v_cycle.school_id) then
    raise exception 'Permission denied';
  end if;

  return app_private.rebuild_examination_readiness(p_cycle_id);
end;
$$;

revoke all on function public.refresh_examination_readiness(uuid) from public, anon;
grant execute on function public.refresh_examination_readiness(uuid) to authenticated;

create or replace function app_private.reconcile_dnea_readiness_candidate_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op <> 'INSERT' then
    perform app_private.rebuild_examination_readiness(old.examination_cycle_id);
  end if;
  if tg_op <> 'DELETE'
     and (tg_op = 'INSERT' or new.examination_cycle_id is distinct from old.examination_cycle_id) then
    perform app_private.rebuild_examination_readiness(new.examination_cycle_id);
  elsif tg_op = 'UPDATE' then
    perform app_private.rebuild_examination_readiness(new.examination_cycle_id);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function app_private.reconcile_dnea_readiness_subject_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_old_cycle uuid;
  v_new_cycle uuid;
begin
  if tg_op <> 'INSERT' then
    select examination_cycle_id into v_old_cycle
    from public.examination_candidates
    where id = old.candidate_id;
  end if;

  if tg_op <> 'DELETE' then
    select examination_cycle_id into v_new_cycle
    from public.examination_candidates
    where id = new.candidate_id;
  end if;

  if v_old_cycle is not null then
    perform app_private.rebuild_examination_readiness(v_old_cycle);
  end if;
  if v_new_cycle is not null and v_new_cycle is distinct from v_old_cycle then
    perform app_private.rebuild_examination_readiness(v_new_cycle);
  elsif tg_op <> 'DELETE' and v_new_cycle is not null then
    perform app_private.rebuild_examination_readiness(v_new_cycle);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function app_private.reconcile_dnea_readiness_cycle_row_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op <> 'INSERT' then
    perform app_private.rebuild_examination_readiness(old.examination_cycle_id);
  end if;
  if tg_op <> 'DELETE'
     and (tg_op = 'INSERT' or new.examination_cycle_id is distinct from old.examination_cycle_id) then
    perform app_private.rebuild_examination_readiness(new.examination_cycle_id);
  elsif tg_op = 'UPDATE' then
    perform app_private.rebuild_examination_readiness(new.examination_cycle_id);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function app_private.reconcile_dnea_readiness_school_centre_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cycle_id uuid;
  v_old_school uuid;
  v_new_school uuid;
begin
  if tg_op <> 'INSERT' then v_old_school := old.school_id; end if;
  if tg_op <> 'DELETE' then v_new_school := new.school_id; end if;

  for v_cycle_id in
    select distinct c.id
    from public.examination_cycles c
    where c.school_id = v_old_school or c.school_id = v_new_school
  loop
    perform app_private.rebuild_examination_readiness(v_cycle_id);
  end loop;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function app_private.reconcile_dnea_readiness_centre_status_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cycle_id uuid;
  v_old_centre uuid;
  v_new_centre uuid;
begin
  if tg_op <> 'INSERT' then v_old_centre := old.examination_centre_id; end if;
  if tg_op <> 'DELETE' then v_new_centre := new.examination_centre_id; end if;

  for v_cycle_id in
    select distinct scoped.cycle_id
    from (
      select a.examination_cycle_id as cycle_id
      from public.examination_candidate_centre_assignments a
      where a.examination_centre_id = v_old_centre or a.examination_centre_id = v_new_centre
      union
      select c.id as cycle_id
      from public.school_examination_centre_assignments a
      join public.examination_cycles c on c.school_id = a.school_id
      where a.examination_centre_id = v_old_centre or a.examination_centre_id = v_new_centre
    ) scoped
  loop
    perform app_private.rebuild_examination_readiness(v_cycle_id);
  end loop;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function app_private.reconcile_dnea_readiness_access_status_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cycle_id uuid;
  v_old_arrangement uuid;
  v_new_arrangement uuid;
begin
  if tg_op <> 'INSERT' then v_old_arrangement := old.arrangement_id; end if;
  if tg_op <> 'DELETE' then v_new_arrangement := new.arrangement_id; end if;

  for v_cycle_id in
    select distinct a.examination_cycle_id
    from public.examination_access_arrangements a
    where a.id = v_old_arrangement or a.id = v_new_arrangement
  loop
    perform app_private.rebuild_examination_readiness(v_cycle_id);
  end loop;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function app_private.reconcile_dnea_readiness_candidate_mutation() from public, anon, authenticated;
revoke all on function app_private.reconcile_dnea_readiness_subject_mutation() from public, anon, authenticated;
revoke all on function app_private.reconcile_dnea_readiness_cycle_row_mutation() from public, anon, authenticated;
revoke all on function app_private.reconcile_dnea_readiness_school_centre_mutation() from public, anon, authenticated;
revoke all on function app_private.reconcile_dnea_readiness_centre_status_mutation() from public, anon, authenticated;
revoke all on function app_private.reconcile_dnea_readiness_access_status_mutation() from public, anon, authenticated;

create trigger dnea_readiness_candidate_reconcile_trg
after insert or update or delete on public.examination_candidates
for each row execute function app_private.reconcile_dnea_readiness_candidate_mutation();

create trigger dnea_readiness_subject_reconcile_trg
after insert or update or delete on public.examination_subject_registrations
for each row execute function app_private.reconcile_dnea_readiness_subject_mutation();

create trigger dnea_readiness_candidate_centre_reconcile_trg
after insert or update or delete on public.examination_candidate_centre_assignments
for each row execute function app_private.reconcile_dnea_readiness_cycle_row_mutation();

create trigger dnea_readiness_school_centre_reconcile_trg
after insert or update or delete on public.school_examination_centre_assignments
for each row execute function app_private.reconcile_dnea_readiness_school_centre_mutation();

create trigger dnea_readiness_centre_status_reconcile_trg
after insert or update or delete on public.examination_centre_status_history
for each row execute function app_private.reconcile_dnea_readiness_centre_status_mutation();

create trigger dnea_readiness_access_arrangement_reconcile_trg
after insert or update or delete on public.examination_access_arrangements
for each row execute function app_private.reconcile_dnea_readiness_cycle_row_mutation();

create trigger dnea_readiness_access_status_reconcile_trg
after insert or update or delete on public.examination_access_arrangement_status_history
for each row execute function app_private.reconcile_dnea_readiness_access_status_mutation();

comment on table public.examination_readiness_issues is
'Regenerable DNEA readiness snapshot derived from canonical examination facts. The snapshot is transactionally recompiled after canonical candidate, subject-registration, examination-centre assignment/status, and examination-access arrangement/status mutations; it is not an independent candidate truth store.';
