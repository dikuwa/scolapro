create or replace function app_private.enforce_cumulative_record_provenance_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.tenant_id is distinct from old.tenant_id
     or new.school_id is distinct from old.school_id
     or new.learner_id is distinct from old.learner_id
     or new.enrolment_id is distinct from old.enrolment_id
     or new.recorded_by_user_id is distinct from old.recorded_by_user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Cumulative learner record scope and recorder provenance are immutable';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_cumulative_record_provenance_integrity() from public, anon, authenticated;

create or replace function app_private.enforce_development_observation_year_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_academic_year integer;
begin
  if tg_op = 'UPDATE' and new.academic_year is distinct from old.academic_year then
    raise exception 'Development observation academic year is immutable';
  end if;

  if new.enrolment_id is not null then
    select e.academic_year
      into v_academic_year
      from public.enrolments e
     where e.id = new.enrolment_id;

    if v_academic_year is null or v_academic_year <> new.academic_year then
      raise exception 'Development observation academic year does not match enrolment';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_development_observation_year_integrity() from public, anon, authenticated;

create or replace function app_private.enforce_psychometric_tester_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_staff_tenant uuid;
begin
  if new.tester_staff_member_id is null then
    return new;
  end if;

  select sm.tenant_id
    into v_staff_tenant
    from public.staff_members sm
   where sm.id = new.tester_staff_member_id;

  if v_staff_tenant is null or v_staff_tenant is distinct from new.tenant_id then
    raise exception 'Psychometric tester does not belong to learner tenant';
  end if;

  if not exists (
    select 1
      from public.staff_school_assignments a
     where a.staff_member_id = new.tester_staff_member_id
       and a.school_id = new.school_id
       and a.effective_from <= new.test_date
       and (a.effective_to is null or a.effective_to >= new.test_date)
  ) then
    raise exception 'Psychometric tester is not assigned to learner school on test date';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_psychometric_tester_scope_integrity() from public, anon, authenticated;

drop trigger if exists learner_prior_school_history_provenance_integrity_trg on public.learner_prior_school_history;
create trigger learner_prior_school_history_provenance_integrity_trg
before update of tenant_id, school_id, learner_id, enrolment_id, recorded_by_user_id, created_at
on public.learner_prior_school_history
for each row execute function app_private.enforce_cumulative_record_provenance_integrity();

drop trigger if exists learner_health_history_provenance_integrity_trg on public.learner_health_history;
create trigger learner_health_history_provenance_integrity_trg
before update of tenant_id, school_id, learner_id, enrolment_id, recorded_by_user_id, created_at
on public.learner_health_history
for each row execute function app_private.enforce_cumulative_record_provenance_integrity();

drop trigger if exists learner_psychometric_records_provenance_integrity_trg on public.learner_psychometric_records;
create trigger learner_psychometric_records_provenance_integrity_trg
before update of tenant_id, school_id, learner_id, enrolment_id, recorded_by_user_id, created_at
on public.learner_psychometric_records
for each row execute function app_private.enforce_cumulative_record_provenance_integrity();

drop trigger if exists learner_development_observations_provenance_integrity_trg on public.learner_development_observations;
create trigger learner_development_observations_provenance_integrity_trg
before update of tenant_id, school_id, learner_id, enrolment_id, recorded_by_user_id, created_at
on public.learner_development_observations
for each row execute function app_private.enforce_cumulative_record_provenance_integrity();

drop trigger if exists learner_cumulative_notes_provenance_integrity_trg on public.learner_cumulative_notes;
create trigger learner_cumulative_notes_provenance_integrity_trg
before update of tenant_id, school_id, learner_id, enrolment_id, recorded_by_user_id, created_at
on public.learner_cumulative_notes
for each row execute function app_private.enforce_cumulative_record_provenance_integrity();

drop trigger if exists learner_development_observations_year_integrity_trg on public.learner_development_observations;
create trigger learner_development_observations_year_integrity_trg
before insert or update of academic_year, enrolment_id
on public.learner_development_observations
for each row execute function app_private.enforce_development_observation_year_integrity();

drop trigger if exists learner_psychometric_records_tester_scope_integrity_trg on public.learner_psychometric_records;
create trigger learner_psychometric_records_tester_scope_integrity_trg
before insert or update of tenant_id, school_id, tester_staff_member_id, test_date
on public.learner_psychometric_records
for each row execute function app_private.enforce_psychometric_tester_scope_integrity();