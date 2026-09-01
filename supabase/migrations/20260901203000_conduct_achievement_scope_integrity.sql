create or replace function app_private.enforce_learner_observation_provenance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.learner_id is distinct from old.learner_id
    or new.enrolment_id is distinct from old.enrolment_id
    or new.recorded_by_user_id is distinct from old.recorded_by_user_id
    or new.created_at is distinct from old.created_at
    or (to_jsonb(new)->'recorded_at') is distinct from (to_jsonb(old)->'recorded_at')
  ) then
    raise exception 'Learner observation scope and provenance are immutable';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_learner_observation_provenance() from public, anon, authenticated;

-- Keep these trigger names intentionally sorted after the established
-- *_learner_scope_guard triggers. The existing scope guard owns validation and
-- its SQLSTATE contract; this migration only adds update-time provenance finality.
drop trigger if exists zz_conduct_event_provenance_guard on public.conduct_events;
create trigger zz_conduct_event_provenance_guard
before update on public.conduct_events
for each row execute function app_private.enforce_learner_observation_provenance();

drop trigger if exists zz_achievement_event_provenance_guard on public.achievement_events;
create trigger zz_achievement_event_provenance_guard
before update on public.achievement_events
for each row execute function app_private.enforce_learner_observation_provenance();

comment on function app_private.enforce_learner_observation_provenance() is
'Prevents conduct and achievement history from being reassigned to another tenant, school, learner, enrolment, recorder, or creation provenance after capture. Existing learner-enrolment scope validation remains authoritative.';
