drop trigger if exists learner_health_history_temporal_scope_guard on public.learner_health_history;
create trigger learner_health_history_temporal_scope_guard
before insert or update on public.learner_health_history
for each row execute function app_private.enforce_learner_event_enrolment_period('observed_on', 'enrolment_id');

drop trigger if exists learner_psychometric_records_temporal_scope_guard on public.learner_psychometric_records;
create trigger learner_psychometric_records_temporal_scope_guard
before insert or update on public.learner_psychometric_records
for each row execute function app_private.enforce_learner_event_enrolment_period('test_date', 'enrolment_id');

drop trigger if exists learner_development_observations_temporal_scope_guard on public.learner_development_observations;
create trigger learner_development_observations_temporal_scope_guard
before insert or update on public.learner_development_observations
for each row execute function app_private.enforce_learner_event_enrolment_period('observed_on', 'enrolment_id');

drop trigger if exists learner_cumulative_notes_temporal_scope_guard on public.learner_cumulative_notes;
create trigger learner_cumulative_notes_temporal_scope_guard
before insert or update on public.learner_cumulative_notes
for each row execute function app_private.enforce_learner_event_enrolment_period('note_date', 'enrolment_id');

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
  elsif new.observed_on is not null and not exists (
    select 1
      from public.enrolments e
     where e.tenant_id = new.tenant_id
       and e.school_id = new.school_id
       and e.learner_id = new.learner_id
       and e.academic_year = new.academic_year
       and e.enrolled_from <= new.observed_on
       and (e.enrolled_to is null or e.enrolled_to >= new.observed_on)
  ) then
    raise exception 'Development observation academic year does not match learner enrolment on observation date';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_development_observation_year_integrity() from public, anon, authenticated;

drop trigger if exists learner_development_observations_year_integrity_trg on public.learner_development_observations;
create trigger learner_development_observations_year_integrity_trg
before insert or update of academic_year, enrolment_id, observed_on
on public.learner_development_observations
for each row execute function app_private.enforce_development_observation_year_integrity();

comment on function app_private.enforce_learner_event_enrolment_period() is
'Ensures dated learner operational and longitudinal records, including attendance, conduct, achievement, support and cumulative-record events, fall inside the learner school-enrolment period represented by the row.';

comment on function app_private.enforce_development_observation_year_integrity() is
'Keeps development observations aligned to their academic year, including dated observations that omit a specific enrolment id.';
