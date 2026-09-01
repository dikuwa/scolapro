create or replace function app_private.enforce_attendance_event_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
  v_learner_tenant uuid;
  v_enrolment public.enrolments%rowtype;
  v_class public.register_classes%rowtype;
  v_slot public.timetable_slots%rowtype;
  v_register_submission public.attendance_register_submissions%rowtype;
  v_subject_submission public.subject_attendance_submissions%rowtype;
  v_replaced public.attendance_events%rowtype;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.academic_year is distinct from old.academic_year
    or new.learner_id is distinct from old.learner_id
    or new.enrolment_id is distinct from old.enrolment_id
    or new.register_class_id is distinct from old.register_class_id
    or new.attendance_date is distinct from old.attendance_date
    or new.observation_type is distinct from old.observation_type
    or new.timetable_slot_id is distinct from old.timetable_slot_id
    or new.register_submission_id is distinct from old.register_submission_id
    or new.subject_submission_id is distinct from old.subject_submission_id
    or new.replaces_event_id is distinct from old.replaces_event_id
  ) then
    raise exception 'Attendance event scope and provenance are immutable';
  end if;

  select s.tenant_id into v_school_tenant from public.schools s where s.id = new.school_id;
  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Attendance event scope mismatch: school does not belong to tenant';
  end if;

  select l.tenant_id into v_learner_tenant from public.learners l where l.id = new.learner_id;
  if v_learner_tenant is null or v_learner_tenant <> new.tenant_id then
    raise exception 'Attendance event scope mismatch: learner does not belong to tenant';
  end if;

  select * into v_enrolment from public.enrolments where id = new.enrolment_id;
  if not found
    or (v_enrolment.tenant_id,v_enrolment.school_id,v_enrolment.academic_year,v_enrolment.learner_id,v_enrolment.register_class_id)
       is distinct from (new.tenant_id,new.school_id,new.academic_year,new.learner_id,new.register_class_id) then
    raise exception 'Attendance event scope mismatch: enrolment does not match event scope';
  end if;

  select * into v_class from public.register_classes where id = new.register_class_id;
  if not found
    or (v_class.tenant_id,v_class.school_id,v_class.academic_year)
       is distinct from (new.tenant_id,new.school_id,new.academic_year) then
    raise exception 'Attendance event scope mismatch: register class does not match event scope';
  end if;

  if new.observation_type = 'daily_register' then
    if new.subject_submission_id is not null then
      raise exception 'Attendance event scope mismatch: daily register event cannot reference subject submission';
    end if;
  elsif new.observation_type = 'subject_period' then
    if new.register_submission_id is not null then
      raise exception 'Attendance event scope mismatch: subject-period event cannot reference register submission';
    end if;
  end if;

  if new.timetable_slot_id is not null then
    select * into v_slot from public.timetable_slots where id = new.timetable_slot_id;
    if not found
      or (v_slot.tenant_id,v_slot.school_id,v_slot.academic_year,v_slot.register_class_id)
         is distinct from (new.tenant_id,new.school_id,new.academic_year,new.register_class_id) then
      raise exception 'Attendance event scope mismatch: timetable slot does not match event scope';
    end if;
  end if;

  if new.register_submission_id is not null then
    select * into v_register_submission from public.attendance_register_submissions where id = new.register_submission_id;
    if not found
      or (v_register_submission.tenant_id,v_register_submission.school_id,v_register_submission.academic_year,v_register_submission.register_class_id,v_register_submission.attendance_date)
         is distinct from (new.tenant_id,new.school_id,new.academic_year,new.register_class_id,new.attendance_date) then
      raise exception 'Attendance event scope mismatch: register submission does not match event scope';
    end if;
  end if;

  if new.subject_submission_id is not null then
    select * into v_subject_submission from public.subject_attendance_submissions where id = new.subject_submission_id;
    if not found
      or (v_subject_submission.tenant_id,v_subject_submission.school_id,v_subject_submission.academic_year,v_subject_submission.register_class_id,v_subject_submission.attendance_date,v_subject_submission.timetable_slot_id)
         is distinct from (new.tenant_id,new.school_id,new.academic_year,new.register_class_id,new.attendance_date,new.timetable_slot_id) then
      raise exception 'Attendance event scope mismatch: subject submission does not match event scope';
    end if;
  end if;

  if new.replaces_event_id is not null then
    if new.replaces_event_id = new.id then
      raise exception 'Attendance event cannot replace itself';
    end if;
    select * into v_replaced from public.attendance_events where id = new.replaces_event_id;
    if not found
      or (v_replaced.tenant_id,v_replaced.school_id,v_replaced.academic_year,v_replaced.learner_id,v_replaced.enrolment_id,v_replaced.register_class_id,v_replaced.attendance_date,v_replaced.observation_type,v_replaced.timetable_slot_id)
         is distinct from (new.tenant_id,new.school_id,new.academic_year,new.learner_id,new.enrolment_id,new.register_class_id,new.attendance_date,new.observation_type,new.timetable_slot_id) then
      raise exception 'Attendance event scope mismatch: replaced event does not match correction scope';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_attendance_event_scope_integrity() from public, anon, authenticated;

drop trigger if exists attendance_event_scope_integrity_trg on public.attendance_events;
create trigger attendance_event_scope_integrity_trg
before insert or update of tenant_id, school_id, academic_year, learner_id, enrolment_id, register_class_id, attendance_date, observation_type, timetable_slot_id, register_submission_id, subject_submission_id, replaces_event_id
on public.attendance_events
for each row execute function app_private.enforce_attendance_event_scope_integrity();