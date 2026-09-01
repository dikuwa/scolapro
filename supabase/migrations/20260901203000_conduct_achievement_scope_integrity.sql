create or replace function app_private.enforce_conduct_event_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_school_tenant uuid;
  v_learner_tenant uuid;
  v_enrolment record;
begin
  select tenant_id into v_school_tenant
  from public.schools
  where id = new.school_id;
  if v_school_tenant is null or new.tenant_id is distinct from v_school_tenant then
    raise exception 'Conduct event scope mismatch: school does not belong to tenant';
  end if;

  select tenant_id into v_learner_tenant
  from public.learners
  where id = new.learner_id;
  if v_learner_tenant is null or new.tenant_id is distinct from v_learner_tenant then
    raise exception 'Conduct event scope mismatch: learner does not belong to tenant';
  end if;

  if not exists (
    select 1
    from public.enrolments e
    where e.tenant_id = new.tenant_id
      and e.school_id = new.school_id
      and e.learner_id = new.learner_id
  ) then
    raise exception 'Conduct event scope mismatch: learner has no enrolment at school';
  end if;

  if new.enrolment_id is not null then
    select tenant_id, school_id, learner_id
      into v_enrolment
      from public.enrolments
     where id = new.enrolment_id;
    if not found then
      raise exception 'Conduct event enrolment does not exist';
    end if;
    if (new.tenant_id, new.school_id, new.learner_id)
       is distinct from (v_enrolment.tenant_id, v_enrolment.school_id, v_enrolment.learner_id) then
      raise exception 'Conduct event scope mismatch: enrolment does not belong to learner and school';
    end if;
  end if;

  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.learner_id is distinct from old.learner_id
    or new.enrolment_id is distinct from old.enrolment_id
    or new.recorded_by_user_id is distinct from old.recorded_by_user_id
    or new.recorded_at is distinct from old.recorded_at
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Conduct event scope and provenance are immutable';
  end if;

  return new;
end;
$$;

create or replace function app_private.enforce_achievement_event_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_school_tenant uuid;
  v_learner_tenant uuid;
  v_enrolment record;
begin
  select tenant_id into v_school_tenant
  from public.schools
  where id = new.school_id;
  if v_school_tenant is null or new.tenant_id is distinct from v_school_tenant then
    raise exception 'Achievement event scope mismatch: school does not belong to tenant';
  end if;

  select tenant_id into v_learner_tenant
  from public.learners
  where id = new.learner_id;
  if v_learner_tenant is null or new.tenant_id is distinct from v_learner_tenant then
    raise exception 'Achievement event scope mismatch: learner does not belong to tenant';
  end if;

  if not exists (
    select 1
    from public.enrolments e
    where e.tenant_id = new.tenant_id
      and e.school_id = new.school_id
      and e.learner_id = new.learner_id
  ) then
    raise exception 'Achievement event scope mismatch: learner has no enrolment at school';
  end if;

  if new.enrolment_id is not null then
    select tenant_id, school_id, learner_id
      into v_enrolment
      from public.enrolments
     where id = new.enrolment_id;
    if not found then
      raise exception 'Achievement event enrolment does not exist';
    end if;
    if (new.tenant_id, new.school_id, new.learner_id)
       is distinct from (v_enrolment.tenant_id, v_enrolment.school_id, v_enrolment.learner_id) then
      raise exception 'Achievement event scope mismatch: enrolment does not belong to learner and school';
    end if;
  end if;

  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.learner_id is distinct from old.learner_id
    or new.enrolment_id is distinct from old.enrolment_id
    or new.recorded_by_user_id is distinct from old.recorded_by_user_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Achievement event scope and provenance are immutable';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_conduct_event_scope_integrity() from public, anon, authenticated;
revoke all on function app_private.enforce_achievement_event_scope_integrity() from public, anon, authenticated;

drop trigger if exists conduct_event_scope_integrity_trg on public.conduct_events;
create trigger conduct_event_scope_integrity_trg
before insert or update on public.conduct_events
for each row execute function app_private.enforce_conduct_event_scope_integrity();

drop trigger if exists achievement_event_scope_integrity_trg on public.achievement_events;
create trigger achievement_event_scope_integrity_trg
before insert or update on public.achievement_events
for each row execute function app_private.enforce_achievement_event_scope_integrity();
