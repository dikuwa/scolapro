create or replace function app_private.enforce_school_curriculum_overlay_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_school_tenant uuid;
  v_offering record;
begin
  select tenant_id into v_school_tenant from public.schools where id = new.school_id;
  if v_school_tenant is null or new.tenant_id is distinct from v_school_tenant then
    raise exception 'Curriculum overlay scope mismatch: school does not belong to tenant';
  end if;

  select tenant_id, school_id, academic_year, curriculum_version_id
    into v_offering
    from public.subject_offerings where id = new.subject_offering_id;
  if not found then raise exception 'Curriculum overlay subject offering does not exist'; end if;
  if (new.tenant_id,new.school_id,new.academic_year,new.curriculum_version_id)
     is distinct from (v_offering.tenant_id,v_offering.school_id,v_offering.academic_year,v_offering.curriculum_version_id) then
    raise exception 'Curriculum overlay scope mismatch: subject offering or curriculum version differs';
  end if;

  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id or
    new.school_id is distinct from old.school_id or
    new.academic_year is distinct from old.academic_year or
    new.subject_offering_id is distinct from old.subject_offering_id or
    new.curriculum_version_id is distinct from old.curriculum_version_id or
    new.created_by_user_id is distinct from old.created_by_user_id or
    new.created_at is distinct from old.created_at
  ) then raise exception 'Curriculum overlay scope and provenance are immutable'; end if;
  return new;
end;
$$;

create or replace function app_private.enforce_pacing_plan_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_school_tenant uuid;
  v_offering record;
  v_class record;
  v_allocation record;
begin
  select tenant_id into v_school_tenant from public.schools where id = new.school_id;
  if v_school_tenant is null or new.tenant_id is distinct from v_school_tenant then
    raise exception 'Pacing plan scope mismatch: school does not belong to tenant';
  end if;

  select tenant_id,school_id,academic_year,curriculum_version_id
    into v_offering from public.subject_offerings where id=new.subject_offering_id;
  if not found then raise exception 'Pacing plan subject offering does not exist'; end if;
  if (new.tenant_id,new.school_id,new.academic_year,new.curriculum_version_id)
     is distinct from (v_offering.tenant_id,v_offering.school_id,v_offering.academic_year,v_offering.curriculum_version_id) then
    raise exception 'Pacing plan scope mismatch: subject offering or curriculum version differs';
  end if;

  if new.register_class_id is not null then
    select tenant_id,school_id,academic_year into v_class from public.register_classes where id=new.register_class_id;
    if not found or (new.tenant_id,new.school_id,new.academic_year) is distinct from (v_class.tenant_id,v_class.school_id,v_class.academic_year) then
      raise exception 'Pacing plan scope mismatch: register class differs';
    end if;
  end if;

  if new.teacher_allocation_id is not null then
    select tenant_id,school_id,academic_year,subject_offering_id,register_class_id
      into v_allocation from public.teacher_allocations where id=new.teacher_allocation_id;
    if not found or (new.tenant_id,new.school_id,new.academic_year,new.subject_offering_id)
       is distinct from (v_allocation.tenant_id,v_allocation.school_id,v_allocation.academic_year,v_allocation.subject_offering_id) then
      raise exception 'Pacing plan scope mismatch: teacher allocation differs';
    end if;
    if new.register_class_id is not null and new.register_class_id is distinct from v_allocation.register_class_id then
      raise exception 'Pacing plan scope mismatch: teacher allocation belongs to another class';
    end if;
  end if;

  if tg_op='UPDATE' and (
    new.tenant_id is distinct from old.tenant_id or new.school_id is distinct from old.school_id or
    new.academic_year is distinct from old.academic_year or new.subject_offering_id is distinct from old.subject_offering_id or
    new.curriculum_version_id is distinct from old.curriculum_version_id or new.created_by_user_id is distinct from old.created_by_user_id or
    new.created_at is distinct from old.created_at
  ) then raise exception 'Pacing plan root scope and provenance are immutable'; end if;
  return new;
end;
$$;

create or replace function app_private.enforce_pacing_plan_item_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan record;
  v_unit_version uuid;
begin
  select tenant_id,school_id,curriculum_version_id into v_plan from public.pacing_plans where id=new.pacing_plan_id;
  if not found then raise exception 'Pacing plan item parent plan does not exist'; end if;
  if (new.tenant_id,new.school_id) is distinct from (v_plan.tenant_id,v_plan.school_id) then
    raise exception 'Pacing plan item scope mismatch: parent plan differs';
  end if;
  select curriculum_version_id into v_unit_version from public.curriculum_units where id=new.curriculum_unit_id;
  if v_unit_version is null or v_unit_version is distinct from v_plan.curriculum_version_id then
    raise exception 'Pacing plan item scope mismatch: curriculum unit belongs to another curriculum version';
  end if;
  if tg_op='UPDATE' and (
    new.tenant_id is distinct from old.tenant_id or new.school_id is distinct from old.school_id or
    new.pacing_plan_id is distinct from old.pacing_plan_id or new.curriculum_unit_id is distinct from old.curriculum_unit_id or
    new.created_at is distinct from old.created_at
  ) then raise exception 'Pacing plan item scope is immutable'; end if;
  return new;
end;
$$;

revoke all on function app_private.enforce_school_curriculum_overlay_scope_integrity() from public, anon, authenticated;
revoke all on function app_private.enforce_pacing_plan_scope_integrity() from public, anon, authenticated;
revoke all on function app_private.enforce_pacing_plan_item_scope_integrity() from public, anon, authenticated;

drop trigger if exists school_curriculum_overlay_scope_integrity_trg on public.school_curriculum_overlays;
create trigger school_curriculum_overlay_scope_integrity_trg before insert or update on public.school_curriculum_overlays
for each row execute function app_private.enforce_school_curriculum_overlay_scope_integrity();

drop trigger if exists pacing_plan_scope_integrity_trg on public.pacing_plans;
create trigger pacing_plan_scope_integrity_trg before insert or update on public.pacing_plans
for each row execute function app_private.enforce_pacing_plan_scope_integrity();

drop trigger if exists pacing_plan_item_scope_integrity_trg on public.pacing_plan_items;
create trigger pacing_plan_item_scope_integrity_trg before insert or update on public.pacing_plan_items
for each row execute function app_private.enforce_pacing_plan_item_scope_integrity();