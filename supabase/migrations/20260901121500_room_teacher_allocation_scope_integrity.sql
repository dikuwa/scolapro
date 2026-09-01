create or replace function app_private.enforce_school_room_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
  ) then
    raise exception 'School room tenant and school are immutable';
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'School room scope mismatch: school does not belong to tenant';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_school_room_scope_integrity() from public, anon, authenticated;

drop trigger if exists school_room_scope_integrity_trg on public.school_rooms;
create trigger school_room_scope_integrity_trg
before insert or update of tenant_id, school_id
on public.school_rooms
for each row execute function app_private.enforce_school_room_scope_integrity();

create or replace function app_private.enforce_teacher_allocation_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
  v_offering_tenant uuid;
  v_offering_school uuid;
  v_offering_year integer;
  v_class_tenant uuid;
  v_class_school uuid;
  v_class_year integer;
  v_staff_tenant uuid;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.academic_year is distinct from old.academic_year
    or new.subject_offering_id is distinct from old.subject_offering_id
    or new.register_class_id is distinct from old.register_class_id
    or new.staff_member_id is distinct from old.staff_member_id
  ) then
    raise exception 'Teacher allocation tenant, school, year, offering, class, and staff identity are immutable';
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Teacher allocation scope mismatch: school does not belong to tenant';
  end if;

  select so.tenant_id, so.school_id, so.academic_year
    into v_offering_tenant, v_offering_school, v_offering_year
  from public.subject_offerings so
  where so.id = new.subject_offering_id;

  if v_offering_tenant is null
     or v_offering_tenant <> new.tenant_id
     or v_offering_school <> new.school_id
     or v_offering_year <> new.academic_year then
    raise exception 'Teacher allocation scope mismatch: subject offering does not belong to school/year';
  end if;

  select rc.tenant_id, rc.school_id, rc.academic_year
    into v_class_tenant, v_class_school, v_class_year
  from public.register_classes rc
  where rc.id = new.register_class_id;

  if v_class_tenant is null
     or v_class_tenant <> new.tenant_id
     or v_class_school <> new.school_id
     or v_class_year <> new.academic_year then
    raise exception 'Teacher allocation scope mismatch: register class does not belong to school/year';
  end if;

  select sm.tenant_id into v_staff_tenant
  from public.staff_members sm
  where sm.id = new.staff_member_id;

  if v_staff_tenant is null or v_staff_tenant <> new.tenant_id then
    raise exception 'Teacher allocation scope mismatch: staff member does not belong to tenant';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_teacher_allocation_scope_integrity() from public, anon, authenticated;

drop trigger if exists teacher_allocation_scope_integrity_trg on public.teacher_allocations;
create trigger teacher_allocation_scope_integrity_trg
before insert or update of tenant_id, school_id, academic_year, subject_offering_id, register_class_id, staff_member_id
on public.teacher_allocations
for each row execute function app_private.enforce_teacher_allocation_scope_integrity();
