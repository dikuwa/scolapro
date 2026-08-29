-- A DNEA candidate may exist in draft form before the authority issues a Candidate
-- Number, but the registration is not submission-ready until that official identifier
-- has been captured through the governed assignment workflow.

create or replace function public.refresh_examination_readiness(p_cycle_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_cycle public.examination_cycles%rowtype;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_cycle from public.examination_cycles where id = p_cycle_id;
  if not found then raise exception 'Examination cycle not found'; end if;
  if not app_private.can_manage_examinations(v_cycle.school_id) then raise exception 'Permission denied'; end if;

  delete from public.examination_readiness_issues
  where examination_cycle_id = v_cycle.id and resolved = false;

  insert into public.examination_readiness_issues (
    tenant_id, school_id, examination_cycle_id, candidate_id,
    issue_code, severity, message
  )
  select ec.tenant_id, ec.school_id, ec.examination_cycle_id, ec.id,
         'candidate_number_missing', 'blocking',
         'Official Candidate Number has not been assigned.'
  from public.examination_candidates ec
  where ec.examination_cycle_id = v_cycle.id
    and nullif(btrim(ec.candidate_number),'') is null
    and ec.registration_status <> 'withdrawn';

  insert into public.examination_readiness_issues (
    tenant_id, school_id, examination_cycle_id, candidate_id,
    issue_code, severity, message
  )
  select ec.tenant_id, ec.school_id, ec.examination_cycle_id, ec.id,
         'identity_incomplete', 'blocking', 'Candidate identity has not been verified.'
  from public.examination_candidates ec
  where ec.examination_cycle_id = v_cycle.id
    and ec.identity_verified = false
    and ec.registration_status <> 'withdrawn';

  insert into public.examination_readiness_issues (
    tenant_id, school_id, examination_cycle_id, candidate_id,
    issue_code, severity, message
  )
  select ec.tenant_id, ec.school_id, ec.examination_cycle_id, ec.id,
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
  select esr.tenant_id, esr.school_id, ec.examination_cycle_id, ec.id, esr.id,
         'subject_code_missing_mapping', 'warning',
         'Examination subject is not linked to a configured school subject offering.'
  from public.examination_subject_registrations esr
  join public.examination_candidates ec on ec.id = esr.candidate_id
  where ec.examination_cycle_id = v_cycle.id
    and ec.registration_status <> 'withdrawn'
    and esr.subject_offering_id is null
    and esr.registration_status <> 'withdrawn';

  select count(*) into v_count
  from public.examination_readiness_issues
  where examination_cycle_id = v_cycle.id and resolved = false;

  return v_count;
end;
$$;

revoke all on function public.refresh_examination_readiness(uuid) from public, anon;
grant execute on function public.refresh_examination_readiness(uuid) to authenticated;

comment on function public.refresh_examination_readiness(uuid) is
'Rebuilds DNEA readiness exceptions, including missing authority-issued Candidate Numbers, without generating identifiers.';