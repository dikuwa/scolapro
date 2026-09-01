create or replace function app_private.enforce_enrolment_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
  v_learner_tenant uuid;
  v_grade public.grades%rowtype;
  v_class public.register_classes%rowtype;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.learner_id is distinct from old.learner_id
    or new.academic_year is distinct from old.academic_year
  ) then
    raise exception 'Enrolment tenant, school, learner, and academic year are immutable';
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Enrolment scope mismatch: school does not belong to tenant';
  end if;

  select l.tenant_id into v_learner_tenant
  from public.learners l
  where l.id = new.learner_id;

  if v_learner_tenant is null or v_learner_tenant <> new.tenant_id then
    raise exception 'Enrolment scope mismatch: learner does not belong to tenant';
  end if;

  if new.grade_id is not null then
    select * into v_grade from public.grades where id = new.grade_id;
    if not found
      or v_grade.tenant_id <> new.tenant_id
      or v_grade.school_id <> new.school_id
      or v_grade.academic_year <> new.academic_year then
      raise exception 'Enrolment scope mismatch: grade does not belong to enrolment school and academic year';
    end if;
  end if;

  if new.register_class_id is not null then
    if new.grade_id is null then
      raise exception 'Enrolment scope mismatch: register class requires a grade';
    end if;

    select * into v_class from public.register_classes where id = new.register_class_id;
    if not found
      or v_class.tenant_id <> new.tenant_id
      or v_class.school_id <> new.school_id
      or v_class.academic_year <> new.academic_year
      or v_class.grade_id <> new.grade_id then
      raise exception 'Enrolment scope mismatch: register class does not belong to enrolment grade, school, and academic year';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_enrolment_scope_integrity() from public, anon, authenticated;

drop trigger if exists enrolment_scope_integrity_trg on public.enrolments;
drop trigger if exists enrolment_core_scope_integrity_trg on public.enrolments;
create trigger enrolment_core_scope_integrity_trg
before insert or update of tenant_id, school_id, learner_id, academic_year, grade_id, register_class_id
on public.enrolments
for each row execute function app_private.enforce_enrolment_scope_integrity();