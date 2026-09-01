create or replace function app_private.enforce_examination_subject_registration_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_candidate public.examination_candidates%rowtype;
  v_cycle public.examination_cycles%rowtype;
  v_offering public.subject_offerings%rowtype;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.candidate_id is distinct from old.candidate_id
  ) then
    raise exception 'Examination subject registration tenant, school, and candidate are immutable';
  end if;

  select * into v_candidate from public.examination_candidates where id = new.candidate_id;
  if not found
    or (v_candidate.tenant_id,v_candidate.school_id) is distinct from (new.tenant_id,new.school_id) then
    raise exception 'Examination subject registration scope mismatch: candidate does not match registration scope';
  end if;

  select * into v_cycle from public.examination_cycles where id = v_candidate.examination_cycle_id;
  if not found then
    raise exception 'Examination subject registration scope mismatch: candidate examination cycle is missing';
  end if;

  if new.subject_offering_id is not null then
    select * into v_offering from public.subject_offerings where id = new.subject_offering_id;
    if not found
      or (v_offering.tenant_id,v_offering.school_id,v_offering.academic_year)
         is distinct from (new.tenant_id,new.school_id,v_cycle.academic_year) then
      raise exception 'Examination subject registration scope mismatch: subject offering does not match candidate examination year';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_examination_subject_registration_scope_integrity() from public, anon, authenticated;

drop trigger if exists a_examination_subject_registration_scope_integrity_trg on public.examination_subject_registrations;
create trigger a_examination_subject_registration_scope_integrity_trg
before insert or update of tenant_id, school_id, candidate_id, subject_offering_id
on public.examination_subject_registrations
for each row execute function app_private.enforce_examination_subject_registration_scope_integrity();