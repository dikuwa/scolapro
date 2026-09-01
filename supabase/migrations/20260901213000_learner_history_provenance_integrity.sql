create or replace function app_private.enforce_learner_history_provenance_integrity()
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
     or new.created_at is distinct from old.created_at then
    raise exception 'Learner history scope and creation provenance are immutable';
  end if;

  if tg_table_name = 'conduct_events' then
    if (to_jsonb(new)->>'recorded_by_user_id') is distinct from (to_jsonb(old)->>'recorded_by_user_id')
       or (to_jsonb(new)->>'recorded_at') is distinct from (to_jsonb(old)->>'recorded_at') then
      raise exception 'Conduct event recorder provenance is immutable';
    end if;
  elsif tg_table_name = 'achievement_events' then
    if (to_jsonb(new)->>'recorded_by_user_id') is distinct from (to_jsonb(old)->>'recorded_by_user_id') then
      raise exception 'Achievement recorder provenance is immutable';
    end if;
  elsif tg_table_name = 'learner_support_cases' then
    if (to_jsonb(new)->>'opened_by_user_id') is distinct from (to_jsonb(old)->>'opened_by_user_id') then
      raise exception 'Learner support case opener provenance is immutable';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_learner_history_provenance_integrity() from public, anon, authenticated;

drop trigger if exists conduct_event_provenance_integrity_trg on public.conduct_events;
create trigger conduct_event_provenance_integrity_trg
before update
on public.conduct_events
for each row execute function app_private.enforce_learner_history_provenance_integrity();

drop trigger if exists achievement_event_provenance_integrity_trg on public.achievement_events;
create trigger achievement_event_provenance_integrity_trg
before update
on public.achievement_events
for each row execute function app_private.enforce_learner_history_provenance_integrity();

drop trigger if exists learner_support_case_provenance_integrity_trg on public.learner_support_cases;
create trigger learner_support_case_provenance_integrity_trg
before update
on public.learner_support_cases
for each row execute function app_private.enforce_learner_history_provenance_integrity();

comment on function app_private.enforce_learner_history_provenance_integrity() is
'Prevents conduct, achievement, and learner-support history from being rebound to another learner/enrolment or having creator/recorder provenance rewritten after creation.';