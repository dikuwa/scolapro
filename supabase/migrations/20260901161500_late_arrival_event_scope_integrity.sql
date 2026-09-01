create or replace function app_private.enforce_late_arrival_event_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
  v_learner_tenant uuid;
  v_enrolment public.enrolments%rowtype;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.learner_id is distinct from old.learner_id
    or new.enrolment_id is distinct from old.enrolment_id
    or new.arrival_date is distinct from old.arrival_date
  ) then
    raise exception 'Late arrival event tenant, school, learner, enrolment, and arrival date are immutable';
  end if;

  select s.tenant_id into v_school_tenant from public.schools s where s.id = new.school_id;
  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Late arrival event scope mismatch: school does not belong to tenant';
  end if;

  select l.tenant_id into v_learner_tenant from public.learners l where l.id = new.learner_id;
  if v_learner_tenant is null or v_learner_tenant <> new.tenant_id then
    raise exception 'Late arrival event scope mismatch: learner does not belong to tenant';
  end if;

  select * into v_enrolment from public.enrolments where id = new.enrolment_id;
  if not found
    or (v_enrolment.tenant_id,v_enrolment.school_id,v_enrolment.learner_id)
       is distinct from (new.tenant_id,new.school_id,new.learner_id) then
    raise exception 'Late arrival event scope mismatch: enrolment does not match event scope';
  end if;

  if new.arrival_date < v_enrolment.enrolled_from
    or (v_enrolment.enrolled_to is not null and new.arrival_date > v_enrolment.enrolled_to) then
    raise exception 'Late arrival event scope mismatch: arrival date is outside enrolment period';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_late_arrival_event_scope_integrity() from public, anon, authenticated;

drop trigger if exists late_arrival_event_scope_integrity_trg on public.school_late_arrival_events;
create trigger late_arrival_event_scope_integrity_trg
before insert or update of tenant_id, school_id, learner_id, enrolment_id, arrival_date
on public.school_late_arrival_events
for each row execute function app_private.enforce_late_arrival_event_scope_integrity();