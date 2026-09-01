create or replace function app_private.enforce_examination_candidate_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
  v_cycle public.examination_cycles%rowtype;
  v_learner_tenant uuid;
  v_enrolment public.enrolments%rowtype;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.examination_cycle_id is distinct from old.examination_cycle_id
    or new.learner_id is distinct from old.learner_id
    or new.enrolment_id is distinct from old.enrolment_id
  ) then
    raise exception 'Examination candidate tenant, school, cycle, learner, and enrolment are immutable';
  end if;

  select s.tenant_id into v_school_tenant from public.schools s where s.id = new.school_id;
  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Examination candidate scope mismatch: school does not belong to tenant';
  end if;

  select * into v_cycle from public.examination_cycles where id = new.examination_cycle_id;
  if not found
    or (v_cycle.tenant_id,v_cycle.school_id) is distinct from (new.tenant_id,new.school_id) then
    raise exception 'Examination candidate scope mismatch: examination cycle does not match candidate scope';
  end if;

  select l.tenant_id into v_learner_tenant from public.learners l where l.id = new.learner_id;
  if v_learner_tenant is null or v_learner_tenant <> new.tenant_id then
    raise exception 'Examination candidate scope mismatch: learner does not belong to tenant';
  end if;

  select * into v_enrolment from public.enrolments where id = new.enrolment_id;
  if not found
    or (v_enrolment.tenant_id,v_enrolment.school_id,v_enrolment.learner_id,v_enrolment.academic_year)
       is distinct from (new.tenant_id,new.school_id,new.learner_id,v_cycle.academic_year) then
    raise exception 'Examination candidate scope mismatch: enrolment does not match candidate and examination year';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_examination_candidate_scope_integrity() from public, anon, authenticated;

drop trigger if exists examination_candidate_scope_integrity_trg on public.examination_candidates;
create trigger examination_candidate_scope_integrity_trg
before insert or update of tenant_id, school_id, examination_cycle_id, learner_id, enrolment_id
on public.examination_candidates
for each row execute function app_private.enforce_examination_candidate_scope_integrity();