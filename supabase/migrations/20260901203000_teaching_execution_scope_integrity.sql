create or replace function app_private.enforce_teaching_schedule_item_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_plan record;
  v_class record;
  v_allocation record;
begin
  select ppi.tenant_id,
         ppi.school_id,
         pp.academic_year,
         pp.subject_offering_id,
         pp.register_class_id,
         pp.teacher_allocation_id
    into v_plan
    from public.pacing_plan_items ppi
    join public.pacing_plans pp on pp.id = ppi.pacing_plan_id
   where ppi.id = new.pacing_plan_item_id;

  if not found then
    raise exception 'Teaching schedule scope mismatch: pacing plan item does not exist';
  end if;

  if (new.tenant_id,new.school_id,new.academic_year)
     is distinct from (v_plan.tenant_id,v_plan.school_id,v_plan.academic_year) then
    raise exception 'Teaching schedule scope mismatch: pacing plan differs';
  end if;

  if v_plan.register_class_id is not null
     and new.register_class_id is distinct from v_plan.register_class_id then
    raise exception 'Teaching schedule scope mismatch: pacing plan belongs to another class';
  end if;

  if v_plan.teacher_allocation_id is not null
     and new.teacher_allocation_id is distinct from v_plan.teacher_allocation_id then
    raise exception 'Teaching schedule scope mismatch: pacing plan belongs to another teacher allocation';
  end if;

  select tenant_id,school_id,academic_year
    into v_class
    from public.register_classes
   where id = new.register_class_id;

  if not found or (new.tenant_id,new.school_id,new.academic_year)
     is distinct from (v_class.tenant_id,v_class.school_id,v_class.academic_year) then
    raise exception 'Teaching schedule scope mismatch: register class differs';
  end if;

  select tenant_id,school_id,academic_year,subject_offering_id,register_class_id
    into v_allocation
    from public.teacher_allocations
   where id = new.teacher_allocation_id;

  if not found or (new.tenant_id,new.school_id,new.academic_year,v_plan.subject_offering_id,new.register_class_id)
     is distinct from (v_allocation.tenant_id,v_allocation.school_id,v_allocation.academic_year,v_allocation.subject_offering_id,v_allocation.register_class_id) then
    raise exception 'Teaching schedule scope mismatch: teacher allocation differs';
  end if;

  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.academic_year is distinct from old.academic_year
    or new.pacing_plan_item_id is distinct from old.pacing_plan_item_id
    or new.register_class_id is distinct from old.register_class_id
    or new.teacher_allocation_id is distinct from old.teacher_allocation_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Teaching schedule root scope and provenance are immutable';
  end if;

  return new;
end;
$$;

create or replace function app_private.enforce_lesson_preparation_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_schedule record;
begin
  select tenant_id,school_id
    into v_schedule
    from public.teaching_schedule_items
   where id = new.teaching_schedule_item_id;

  if not found then
    raise exception 'Lesson preparation scope mismatch: teaching schedule item does not exist';
  end if;

  if (new.tenant_id,new.school_id)
     is distinct from (v_schedule.tenant_id,v_schedule.school_id) then
    raise exception 'Lesson preparation scope mismatch: teaching schedule differs';
  end if;

  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.teaching_schedule_item_id is distinct from old.teaching_schedule_item_id
    or new.prepared_by_user_id is distinct from old.prepared_by_user_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Lesson preparation root scope and provenance are immutable';
  end if;

  return new;
end;
$$;

create or replace function app_private.enforce_teaching_actual_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_schedule record;
begin
  select tenant_id,school_id
    into v_schedule
    from public.teaching_schedule_items
   where id = new.teaching_schedule_item_id;

  if not found then
    raise exception 'Teaching actual scope mismatch: teaching schedule item does not exist';
  end if;

  if (new.tenant_id,new.school_id)
     is distinct from (v_schedule.tenant_id,v_schedule.school_id) then
    raise exception 'Teaching actual scope mismatch: teaching schedule differs';
  end if;

  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.teaching_schedule_item_id is distinct from old.teaching_schedule_item_id
    or new.recorded_by_user_id is distinct from old.recorded_by_user_id
    or new.recorded_at is distinct from old.recorded_at
  ) then
    raise exception 'Teaching actual root scope and provenance are immutable';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_teaching_schedule_item_scope_integrity() from public, anon, authenticated;
revoke all on function app_private.enforce_lesson_preparation_scope_integrity() from public, anon, authenticated;
revoke all on function app_private.enforce_teaching_actual_scope_integrity() from public, anon, authenticated;

drop trigger if exists teaching_schedule_item_scope_integrity_trg on public.teaching_schedule_items;
create trigger teaching_schedule_item_scope_integrity_trg
before insert or update on public.teaching_schedule_items
for each row execute function app_private.enforce_teaching_schedule_item_scope_integrity();

drop trigger if exists lesson_preparation_scope_integrity_trg on public.lesson_preparations;
create trigger lesson_preparation_scope_integrity_trg
before insert or update on public.lesson_preparations
for each row execute function app_private.enforce_lesson_preparation_scope_integrity();

drop trigger if exists teaching_actual_scope_integrity_trg on public.teaching_actuals;
create trigger teaching_actual_scope_integrity_trg
before insert or update on public.teaching_actuals
for each row execute function app_private.enforce_teaching_actual_scope_integrity();
