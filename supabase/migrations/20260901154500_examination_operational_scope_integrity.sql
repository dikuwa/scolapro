create or replace function app_private.enforce_examination_candidate_history_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cycle public.examination_cycles%rowtype;
  v_candidate public.examination_candidates%rowtype;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.examination_cycle_id is distinct from old.examination_cycle_id
    or new.candidate_id is distinct from old.candidate_id
  ) then
    raise exception 'Candidate number history tenant, school, cycle, and candidate are immutable';
  end if;

  select * into v_cycle from public.examination_cycles where id = new.examination_cycle_id;
  if not found or (v_cycle.tenant_id,v_cycle.school_id) is distinct from (new.tenant_id,new.school_id) then
    raise exception 'Candidate number history scope mismatch: examination cycle does not match history scope';
  end if;

  select * into v_candidate from public.examination_candidates where id = new.candidate_id;
  if not found
    or (v_candidate.tenant_id,v_candidate.school_id,v_candidate.examination_cycle_id)
       is distinct from (new.tenant_id,new.school_id,new.examination_cycle_id) then
    raise exception 'Candidate number history scope mismatch: candidate does not match examination cycle';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_examination_candidate_history_scope_integrity() from public, anon, authenticated;

drop trigger if exists examination_candidate_history_scope_integrity_trg on public.examination_candidate_number_history;
create trigger examination_candidate_history_scope_integrity_trg
before insert or update of tenant_id, school_id, examination_cycle_id, candidate_id
on public.examination_candidate_number_history
for each row execute function app_private.enforce_examination_candidate_history_scope_integrity();

create or replace function app_private.enforce_examination_readiness_issue_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cycle public.examination_cycles%rowtype;
  v_candidate public.examination_candidates%rowtype;
  v_registration public.examination_subject_registrations%rowtype;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.examination_cycle_id is distinct from old.examination_cycle_id
    or new.candidate_id is distinct from old.candidate_id
    or new.subject_registration_id is distinct from old.subject_registration_id
  ) then
    raise exception 'Examination readiness issue scope and subject provenance are immutable';
  end if;

  select * into v_cycle from public.examination_cycles where id = new.examination_cycle_id;
  if not found or (v_cycle.tenant_id,v_cycle.school_id) is distinct from (new.tenant_id,new.school_id) then
    raise exception 'Examination readiness issue scope mismatch: examination cycle does not match issue scope';
  end if;

  if new.candidate_id is not null then
    select * into v_candidate from public.examination_candidates where id = new.candidate_id;
    if not found
      or (v_candidate.tenant_id,v_candidate.school_id,v_candidate.examination_cycle_id)
         is distinct from (new.tenant_id,new.school_id,new.examination_cycle_id) then
      raise exception 'Examination readiness issue scope mismatch: candidate does not match examination cycle';
    end if;
  end if;

  if new.subject_registration_id is not null then
    if new.candidate_id is null then
      raise exception 'Examination readiness issue scope mismatch: subject registration requires candidate';
    end if;
    select * into v_registration from public.examination_subject_registrations where id = new.subject_registration_id;
    if not found
      or (v_registration.tenant_id,v_registration.school_id,v_registration.candidate_id)
         is distinct from (new.tenant_id,new.school_id,new.candidate_id) then
      raise exception 'Examination readiness issue scope mismatch: subject registration does not match candidate';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_examination_readiness_issue_scope_integrity() from public, anon, authenticated;

drop trigger if exists examination_readiness_issue_scope_integrity_trg on public.examination_readiness_issues;
create trigger examination_readiness_issue_scope_integrity_trg
before insert or update of tenant_id, school_id, examination_cycle_id, candidate_id, subject_registration_id
on public.examination_readiness_issues
for each row execute function app_private.enforce_examination_readiness_issue_scope_integrity();