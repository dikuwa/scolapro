create or replace function app_private.enforce_daily_attendance_submission_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
  v_class_tenant uuid;
  v_class_school uuid;
  v_class_year integer;
  v_previous public.attendance_register_submissions%rowtype;
begin
  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Daily attendance submission scope mismatch: school does not belong to tenant';
  end if;

  select rc.tenant_id, rc.school_id, rc.academic_year
    into v_class_tenant, v_class_school, v_class_year
  from public.register_classes rc
  where rc.id = new.register_class_id;

  if v_class_tenant is null
     or v_class_tenant <> new.tenant_id
     or v_class_school <> new.school_id
     or v_class_year <> new.academic_year then
    raise exception 'Daily attendance submission scope mismatch: register class does not match tenant, school, and academic year';
  end if;

  if new.replaces_submission_id is not null then
    if new.replaces_submission_id = new.id then
      raise exception 'Daily attendance submission cannot replace itself';
    end if;

    select * into v_previous
    from public.attendance_register_submissions s
    where s.id = new.replaces_submission_id;

    if v_previous.id is null
       or v_previous.tenant_id <> new.tenant_id
       or v_previous.school_id <> new.school_id
       or v_previous.academic_year <> new.academic_year
       or v_previous.register_class_id <> new.register_class_id
       or v_previous.attendance_date <> new.attendance_date then
      raise exception 'Daily attendance replacement scope mismatch';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_daily_attendance_submission_scope_integrity() from public, anon, authenticated;

drop trigger if exists daily_attendance_submission_scope_integrity_trg on public.attendance_register_submissions;
create trigger daily_attendance_submission_scope_integrity_trg
before insert or update of tenant_id, school_id, academic_year, register_class_id, attendance_date, replaces_submission_id
on public.attendance_register_submissions
for each row execute function app_private.enforce_daily_attendance_submission_scope_integrity();

create or replace function app_private.enforce_subject_attendance_submission_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
  v_class_tenant uuid;
  v_class_school uuid;
  v_class_year integer;
  v_slot_tenant uuid;
  v_slot_school uuid;
  v_slot_year integer;
  v_slot_class uuid;
  v_previous public.subject_attendance_submissions%rowtype;
begin
  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Subject attendance submission scope mismatch: school does not belong to tenant';
  end if;

  select rc.tenant_id, rc.school_id, rc.academic_year
    into v_class_tenant, v_class_school, v_class_year
  from public.register_classes rc
  where rc.id = new.register_class_id;

  if v_class_tenant is null
     or v_class_tenant <> new.tenant_id
     or v_class_school <> new.school_id
     or v_class_year <> new.academic_year then
    raise exception 'Subject attendance submission scope mismatch: register class does not match tenant, school, and academic year';
  end if;

  select ts.tenant_id, ts.school_id, ts.academic_year, ts.register_class_id
    into v_slot_tenant, v_slot_school, v_slot_year, v_slot_class
  from public.timetable_slots ts
  where ts.id = new.timetable_slot_id;

  if v_slot_tenant is null
     or v_slot_tenant <> new.tenant_id
     or v_slot_school <> new.school_id
     or v_slot_year <> new.academic_year
     or v_slot_class <> new.register_class_id then
    raise exception 'Subject attendance submission scope mismatch: timetable slot does not match tenant, school, academic year, and register class';
  end if;

  if new.replaces_submission_id is not null then
    if new.replaces_submission_id = new.id then
      raise exception 'Subject attendance submission cannot replace itself';
    end if;

    select * into v_previous
    from public.subject_attendance_submissions s
    where s.id = new.replaces_submission_id;

    if v_previous.id is null
       or v_previous.tenant_id <> new.tenant_id
       or v_previous.school_id <> new.school_id
       or v_previous.academic_year <> new.academic_year
       or v_previous.register_class_id <> new.register_class_id
       or v_previous.timetable_slot_id <> new.timetable_slot_id
       or v_previous.attendance_date <> new.attendance_date then
      raise exception 'Subject attendance replacement scope mismatch';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_subject_attendance_submission_scope_integrity() from public, anon, authenticated;

drop trigger if exists subject_attendance_submission_scope_integrity_trg on public.subject_attendance_submissions;
create trigger subject_attendance_submission_scope_integrity_trg
before insert or update of tenant_id, school_id, academic_year, register_class_id, timetable_slot_id, attendance_date, replaces_submission_id
on public.subject_attendance_submissions
for each row execute function app_private.enforce_subject_attendance_submission_scope_integrity();