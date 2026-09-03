create or replace function app_private.enforce_learner_event_enrolment_period()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event_date date;
  v_enrolment_id uuid;
  v_enrol public.enrolments%rowtype;
begin
  v_event_date := nullif(to_jsonb(new)->>tg_argv[0], '')::date;
  v_enrolment_id := nullif(to_jsonb(new)->>tg_argv[1], '')::uuid;

  if v_event_date is null then
    return new;
  end if;

  if v_enrolment_id is not null then
    select *
      into v_enrol
      from public.enrolments e
     where e.id = v_enrolment_id;

    if not found then
      return new;
    end if;

    if v_event_date < v_enrol.enrolled_from
       or (v_enrol.enrolled_to is not null and v_event_date > v_enrol.enrolled_to) then
      raise exception 'Learner event date must fall within referenced enrolment period';
    end if;
  elsif not exists (
    select 1
      from public.enrolments e
     where e.tenant_id = new.tenant_id
       and e.school_id = new.school_id
       and e.learner_id = new.learner_id
       and e.enrolled_from <= v_event_date
       and (e.enrolled_to is null or e.enrolled_to >= v_event_date)
  ) then
    raise exception 'Learner event date must fall within a school enrolment period';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_learner_event_enrolment_period() from public, anon, authenticated;

drop trigger if exists conduct_events_learner_temporal_scope_guard on public.conduct_events;
create trigger conduct_events_learner_temporal_scope_guard
before insert or update on public.conduct_events
for each row execute function app_private.enforce_learner_event_enrolment_period('occurred_on', 'enrolment_id');

drop trigger if exists achievement_events_learner_temporal_scope_guard on public.achievement_events;
create trigger achievement_events_learner_temporal_scope_guard
before insert or update on public.achievement_events
for each row execute function app_private.enforce_learner_event_enrolment_period('achieved_on', 'enrolment_id');

drop trigger if exists learner_support_cases_learner_temporal_scope_guard on public.learner_support_cases;
create trigger learner_support_cases_learner_temporal_scope_guard
before insert or update on public.learner_support_cases
for each row execute function app_private.enforce_learner_event_enrolment_period('opened_on', 'enrolment_id');

create or replace function app_private.enforce_support_intervention_case_period()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_opened_on date;
  v_closed_on date;
begin
  select c.opened_on, c.closed_on
    into v_opened_on, v_closed_on
    from public.learner_support_cases c
   where c.id = new.support_case_id;

  if v_opened_on is null then
    return new;
  end if;

  if new.intervention_date < v_opened_on then
    raise exception 'Support intervention date cannot precede case opening date';
  end if;

  if v_closed_on is not null and new.intervention_date > v_closed_on then
    raise exception 'Support intervention date cannot fall after case closing date';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_support_intervention_case_period() from public, anon, authenticated;

drop trigger if exists learner_support_interventions_case_temporal_guard on public.learner_support_interventions;
create trigger learner_support_interventions_case_temporal_guard
before insert or update on public.learner_support_interventions
for each row execute function app_private.enforce_support_intervention_case_period();

comment on function app_private.enforce_learner_event_enrolment_period() is
'Ensures dated conduct, achievement and learner-support history falls inside the learner school-enrolment period represented by the row.';

comment on function app_private.enforce_support_intervention_case_period() is
'Ensures learner-support intervention dates remain inside the temporal lifetime of their parent case.';
