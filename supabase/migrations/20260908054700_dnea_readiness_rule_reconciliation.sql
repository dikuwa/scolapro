-- Keep the hardening recompiler aligned with the latest merged DNEA readiness
-- rules. This is additive and intentionally does not invent new examination
-- rules, candidate numbers, subject mappings, centre codes, or access categories.

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
    'candidate_number_missing', 'blocking',
    'Candidate number has not been assigned from an authoritative source.'
  from public.examination_candidates ec
  where ec.examination_cycle_id = v_cycle.id
    and ec.registration_status <> 'withdrawn'
    and nullif(btrim(ec.candidate_number), '') is null;

  insert into public.examination_readiness_issues (
    tenant_id, school_id, examination_cycle_id, candidate_id,
    issue_code, severity, message
  )
  select
    ec.tenant_id, ec.school_id, ec.examination_cycle_id, ec.id,
    'identity_incomplete', 'blocking', 'Candidate identity has not been verified.'
  from public.examination_candidates ec
  where ec.examination_cycle_id = v_cycle.id
    and ec.registration_status <> 'withdrawn'
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
    and ec.registration_status <> 'withdrawn'
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
    and ec.registration_status <> 'withdrawn'
    and esr.registration_status <> 'withdrawn'
    and esr.subject_offering_id is null;

  select count(*) into v_count
  from public.examination_readiness_issues
  where examination_cycle_id = v_cycle.id
    and resolved = false;

  return v_count;
end;
$$;

revoke all on function app_private.rebuild_examination_readiness(uuid)
  from public, anon, authenticated;
