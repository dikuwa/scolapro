create or replace function app_private.enforce_assessment_component_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_scheme record;
begin
  select tenant_id, school_id
    into v_scheme
    from public.assessment_schemes
   where id = new.assessment_scheme_id;

  if not found then
    raise exception 'Assessment component scheme does not exist';
  end if;

  if (new.tenant_id, new.school_id) is distinct from (v_scheme.tenant_id, v_scheme.school_id) then
    raise exception 'Assessment component scope mismatch: scheme belongs to another tenant or school';
  end if;

  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.assessment_scheme_id is distinct from old.assessment_scheme_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Assessment component scope and provenance are immutable';
  end if;

  return new;
end;
$$;

create or replace function app_private.enforce_assessment_instance_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_school_tenant uuid;
  v_scheme record;
  v_component record;
  v_offering record;
  v_class record;
  v_allocation record;
begin
  select tenant_id into v_school_tenant
    from public.schools
   where id = new.school_id;
  if v_school_tenant is null or new.tenant_id is distinct from v_school_tenant then
    raise exception 'Assessment instance scope mismatch: school does not belong to tenant';
  end if;

  select tenant_id, school_id, subject_offering_id
    into v_scheme
    from public.assessment_schemes
   where id = new.assessment_scheme_id;
  if not found then
    raise exception 'Assessment instance scheme does not exist';
  end if;
  if (new.tenant_id, new.school_id, new.subject_offering_id)
     is distinct from (v_scheme.tenant_id, v_scheme.school_id, v_scheme.subject_offering_id) then
    raise exception 'Assessment instance scope mismatch: scheme belongs to another school or subject offering';
  end if;

  if new.assessment_component_id is not null then
    select tenant_id, school_id, assessment_scheme_id
      into v_component
      from public.assessment_components
     where id = new.assessment_component_id;
    if not found then
      raise exception 'Assessment instance component does not exist';
    end if;
    if (new.tenant_id, new.school_id, new.assessment_scheme_id)
       is distinct from (v_component.tenant_id, v_component.school_id, v_component.assessment_scheme_id) then
      raise exception 'Assessment instance scope mismatch: component belongs to another scheme or school';
    end if;
  end if;

  select tenant_id, school_id, academic_year, grade_id
    into v_offering
    from public.subject_offerings
   where id = new.subject_offering_id;
  if not found then
    raise exception 'Assessment instance subject offering does not exist';
  end if;
  if (new.tenant_id, new.school_id, new.academic_year)
     is distinct from (v_offering.tenant_id, v_offering.school_id, v_offering.academic_year) then
    raise exception 'Assessment instance scope mismatch: subject offering belongs to another school or academic year';
  end if;

  select tenant_id, school_id, academic_year, grade_id
    into v_class
    from public.register_classes
   where id = new.register_class_id;
  if not found then
    raise exception 'Assessment instance register class does not exist';
  end if;
  if (new.tenant_id, new.school_id, new.academic_year, v_offering.grade_id)
     is distinct from (v_class.tenant_id, v_class.school_id, v_class.academic_year, v_class.grade_id) then
    raise exception 'Assessment instance scope mismatch: register class belongs to another school, year, or grade';
  end if;

  if new.teacher_allocation_id is not null then
    select tenant_id, school_id, academic_year, subject_offering_id, register_class_id
      into v_allocation
      from public.teacher_allocations
     where id = new.teacher_allocation_id;
    if not found then
      raise exception 'Assessment instance teacher allocation does not exist';
    end if;
    if (new.tenant_id, new.school_id, new.academic_year, new.subject_offering_id, new.register_class_id)
       is distinct from (v_allocation.tenant_id, v_allocation.school_id, v_allocation.academic_year, v_allocation.subject_offering_id, v_allocation.register_class_id) then
      raise exception 'Assessment instance scope mismatch: teacher allocation belongs to another offering or class';
    end if;
  end if;

  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.academic_year is distinct from old.academic_year
    or new.assessment_scheme_id is distinct from old.assessment_scheme_id
    or new.subject_offering_id is distinct from old.subject_offering_id
    or new.register_class_id is distinct from old.register_class_id
    or new.created_by_user_id is distinct from old.created_by_user_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Assessment instance root scope and provenance are immutable';
  end if;

  return new;
end;
$$;

create or replace function app_private.enforce_learner_mark_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_instance record;
  v_enrolment record;
  v_replaced record;
begin
  select tenant_id, school_id, academic_year, register_class_id
    into v_instance
    from public.assessment_instances
   where id = new.assessment_instance_id;
  if not found then
    raise exception 'Learner mark assessment instance does not exist';
  end if;
  if (new.tenant_id, new.school_id) is distinct from (v_instance.tenant_id, v_instance.school_id) then
    raise exception 'Learner mark scope mismatch: assessment instance belongs to another school';
  end if;

  select tenant_id, school_id, academic_year, register_class_id, learner_id
    into v_enrolment
    from public.enrolments
   where id = new.enrolment_id;
  if not found then
    raise exception 'Learner mark enrolment does not exist';
  end if;
  if (new.tenant_id, new.school_id, v_instance.academic_year, v_instance.register_class_id, new.learner_id)
     is distinct from (v_enrolment.tenant_id, v_enrolment.school_id, v_enrolment.academic_year, v_enrolment.register_class_id, v_enrolment.learner_id) then
    raise exception 'Learner mark scope mismatch: enrolment or learner does not belong to the assessment class and year';
  end if;

  if new.replaces_mark_id is not null then
    select tenant_id, school_id, assessment_instance_id, enrolment_id, learner_id
      into v_replaced
      from public.learner_marks
     where id = new.replaces_mark_id;
    if not found then
      raise exception 'Learner mark replacement target does not exist';
    end if;
    if (new.tenant_id, new.school_id, new.assessment_instance_id, new.enrolment_id, new.learner_id)
       is distinct from (v_replaced.tenant_id, v_replaced.school_id, v_replaced.assessment_instance_id, v_replaced.enrolment_id, v_replaced.learner_id) then
      raise exception 'Learner mark scope mismatch: replacement target belongs to another learner or assessment';
    end if;
  end if;

  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.assessment_instance_id is distinct from old.assessment_instance_id
    or new.enrolment_id is distinct from old.enrolment_id
    or new.learner_id is distinct from old.learner_id
    or new.replaces_mark_id is distinct from old.replaces_mark_id
    or new.recorded_by_user_id is distinct from old.recorded_by_user_id
    or new.recorded_at is distinct from old.recorded_at
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Learner mark scope and provenance are immutable';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_assessment_component_scope_integrity() from public, anon, authenticated;
revoke all on function app_private.enforce_assessment_instance_scope_integrity() from public, anon, authenticated;
revoke all on function app_private.enforce_learner_mark_scope_integrity() from public, anon, authenticated;

drop trigger if exists assessment_component_scope_integrity_trg on public.assessment_components;
create trigger assessment_component_scope_integrity_trg
before insert or update on public.assessment_components
for each row execute function app_private.enforce_assessment_component_scope_integrity();

drop trigger if exists assessment_instance_scope_integrity_trg on public.assessment_instances;
create trigger assessment_instance_scope_integrity_trg
before insert or update on public.assessment_instances
for each row execute function app_private.enforce_assessment_instance_scope_integrity();

drop trigger if exists learner_mark_scope_integrity_trg on public.learner_marks;
create trigger learner_mark_scope_integrity_trg
before insert or update on public.learner_marks
for each row execute function app_private.enforce_learner_mark_scope_integrity();
