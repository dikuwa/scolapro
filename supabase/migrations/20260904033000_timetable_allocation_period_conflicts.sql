-- Timetable slots inherit their effective period from the linked teacher allocation.
-- This allows finite and future teacher handovers to be planned without treating two
-- non-overlapping allocations as simultaneous class/teacher/room conflicts.
--
-- Physical integrity remains enforced for direct table writes, and allocation date
-- edits are revalidated so an initially non-overlapping schedule cannot later be made
-- conflicting by extending an allocation period.

-- The former unique indexes treated every active slot as effective for the entire
-- academic year. Replace them with non-unique lookup indexes; overlap is enforced by
-- the integrity trigger below.
drop index if exists public.timetable_slots_class_active_conflict_uidx;
drop index if exists public.timetable_slots_room_active_conflict_uidx;

create index if not exists timetable_slots_class_active_lookup_idx
on public.timetable_slots(school_id,academic_year,cycle_code,weekday,period_id,register_class_id)
where status='active';

create index if not exists timetable_slots_room_active_lookup_idx
on public.timetable_slots(school_id,academic_year,cycle_code,weekday,period_id,room_id)
where status='active' and room_id is not null;

create or replace function app_private.enforce_timetable_slot_integrity()
returns trigger
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_allocation public.teacher_allocations%rowtype;
  v_period public.timetable_periods%rowtype;
  v_class public.register_classes%rowtype;
  v_room public.school_rooms%rowtype;
begin
  select * into v_allocation
  from public.teacher_allocations
  where id=new.teacher_allocation_id;
  if not found then raise exception 'Teacher allocation does not exist' using errcode='23503'; end if;

  select * into v_period from public.timetable_periods where id=new.period_id;
  if not found then raise exception 'Timetable period does not exist' using errcode='23503'; end if;

  select * into v_class from public.register_classes where id=new.register_class_id;
  if not found then raise exception 'Register class does not exist' using errcode='23503'; end if;

  if v_allocation.school_id<>new.school_id
    or v_allocation.tenant_id<>new.tenant_id
    or v_allocation.academic_year<>new.academic_year
    or v_allocation.register_class_id<>new.register_class_id
  then raise exception 'Teacher allocation does not match timetable slot scope' using errcode='23514'; end if;

  if v_period.school_id<>new.school_id
    or v_period.tenant_id<>new.tenant_id
    or v_period.academic_year<>new.academic_year
  then raise exception 'Timetable period does not match slot scope' using errcode='23514'; end if;

  if v_class.school_id<>new.school_id
    or v_class.tenant_id<>new.tenant_id
    or v_class.academic_year<>new.academic_year
  then raise exception 'Register class does not match timetable slot scope' using errcode='23514'; end if;

  if new.room_id is not null then
    select * into v_room from public.school_rooms where id=new.room_id;
    if not found or v_room.school_id<>new.school_id or v_room.tenant_id<>new.tenant_id then
      raise exception 'Room does not match timetable slot school scope' using errcode='23514';
    end if;
  end if;

  if new.status='active' then
    if exists(
      select 1
      from public.timetable_slots existing
      join public.teacher_allocations existing_allocation
        on existing_allocation.id=existing.teacher_allocation_id
      where existing.id<>new.id
        and existing.status='active'
        and existing.school_id=new.school_id
        and existing.academic_year=new.academic_year
        and existing.cycle_code=new.cycle_code
        and existing.weekday=new.weekday
        and existing.period_id=new.period_id
        and existing.register_class_id=new.register_class_id
        and existing_allocation.active_from<=coalesce(v_allocation.active_to,'infinity'::date)
        and v_allocation.active_from<=coalesce(existing_allocation.active_to,'infinity'::date)
    ) then
      raise exception 'Class is already booked for an overlapping allocation period' using errcode='23505';
    end if;

    if exists(
      select 1
      from public.timetable_slots existing
      join public.teacher_allocations existing_allocation
        on existing_allocation.id=existing.teacher_allocation_id
      where existing.id<>new.id
        and existing.status='active'
        and existing.school_id=new.school_id
        and existing.academic_year=new.academic_year
        and existing.cycle_code=new.cycle_code
        and existing.weekday=new.weekday
        and existing.period_id=new.period_id
        and existing_allocation.staff_member_id=v_allocation.staff_member_id
        and existing_allocation.active_from<=coalesce(v_allocation.active_to,'infinity'::date)
        and v_allocation.active_from<=coalesce(existing_allocation.active_to,'infinity'::date)
    ) then
      raise exception 'Teacher is already booked for an overlapping allocation period' using errcode='23505';
    end if;

    if new.room_id is not null and exists(
      select 1
      from public.timetable_slots existing
      join public.teacher_allocations existing_allocation
        on existing_allocation.id=existing.teacher_allocation_id
      where existing.id<>new.id
        and existing.status='active'
        and existing.school_id=new.school_id
        and existing.academic_year=new.academic_year
        and existing.cycle_code=new.cycle_code
        and existing.weekday=new.weekday
        and existing.period_id=new.period_id
        and existing.room_id=new.room_id
        and existing_allocation.active_from<=coalesce(v_allocation.active_to,'infinity'::date)
        and v_allocation.active_from<=coalesce(existing_allocation.active_to,'infinity'::date)
    ) then
      raise exception 'Room is already booked for an overlapping allocation period' using errcode='23505';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_timetable_slot_integrity()
from public,anon,authenticated;

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

  if new.active_to is not null and new.active_to<new.active_from then
    raise exception 'Teacher allocation active-to date cannot precede active-from date';
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

  -- If this allocation already owns active timetable slots, changing its dates must not
  -- create a class/teacher/room overlap with another active slot at the same timetable
  -- position.
  if tg_op='UPDATE'
    and (new.active_from is distinct from old.active_from or new.active_to is distinct from old.active_to)
    and exists(
      select 1
      from public.timetable_slots owned
      join public.timetable_slots other
        on other.id<>owned.id
       and other.status='active'
       and other.school_id=owned.school_id
       and other.academic_year=owned.academic_year
       and other.cycle_code=owned.cycle_code
       and other.weekday=owned.weekday
       and other.period_id=owned.period_id
      join public.teacher_allocations other_allocation
        on other_allocation.id=other.teacher_allocation_id
      where owned.teacher_allocation_id=new.id
        and owned.status='active'
        and other_allocation.id<>new.id
        and other_allocation.active_from<=coalesce(new.active_to,'infinity'::date)
        and new.active_from<=coalesce(other_allocation.active_to,'infinity'::date)
        and (
          other.register_class_id=owned.register_class_id
          or other_allocation.staff_member_id=new.staff_member_id
          or (owned.room_id is not null and other.room_id=owned.room_id)
        )
    ) then
      raise exception 'Teacher allocation period change would create an overlapping timetable conflict' using errcode='23505';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_teacher_allocation_scope_integrity()
from public,anon,authenticated;

drop trigger if exists teacher_allocation_scope_integrity_trg on public.teacher_allocations;
create trigger teacher_allocation_scope_integrity_trg
before insert or update of
  tenant_id,school_id,academic_year,subject_offering_id,register_class_id,
  staff_member_id,active_from,active_to
on public.teacher_allocations
for each row execute function app_private.enforce_teacher_allocation_scope_integrity();

create or replace function public.create_timetable_slot(
  p_school_id uuid,
  p_academic_year integer,
  p_cycle_code text,
  p_weekday smallint,
  p_period_id uuid,
  p_register_class_id uuid,
  p_teacher_allocation_id uuid,
  p_room_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_school_members(p_school_id) then raise exception 'Permission denied'; end if;
  select tenant_id into v_tenant_id from public.schools where id = p_school_id and status = 'active';

  if not exists (
    select 1 from public.timetable_periods
    where id = p_period_id and school_id = p_school_id and academic_year = p_academic_year
  ) then raise exception 'Period is outside school/year scope'; end if;
  if not exists (
    select 1 from public.register_classes
    where id = p_register_class_id and school_id = p_school_id and academic_year = p_academic_year
  ) then raise exception 'Class is outside school/year scope'; end if;
  if not exists (
    select 1 from public.teacher_allocations
    where id = p_teacher_allocation_id
      and school_id = p_school_id
      and academic_year = p_academic_year
      and register_class_id = p_register_class_id
  ) then raise exception 'Teacher allocation does not match the selected class'; end if;

  insert into public.timetable_slots(
    tenant_id, school_id, academic_year, cycle_code, weekday, period_id,
    register_class_id, teacher_allocation_id, room_label
  ) values (
    v_tenant_id, p_school_id, p_academic_year,
    upper(coalesce(nullif(btrim(p_cycle_code), ''), 'A')),
    p_weekday, p_period_id, p_register_class_id, p_teacher_allocation_id,
    nullif(btrim(coalesce(p_room_label, '')), '')
  ) returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'This class, teacher, or room is already booked for an overlapping allocation period';
end;
$$;

revoke all on function public.create_timetable_slot(uuid,integer,text,smallint,uuid,uuid,uuid,text)
from public,anon;
grant execute on function public.create_timetable_slot(uuid,integer,text,smallint,uuid,uuid,uuid,text)
to authenticated;

create or replace function public.assign_timetable_slot_room(
  p_slot_id uuid,
  p_room_id uuid default null
)
returns void
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_slot public.timetable_slots%rowtype;
  v_room public.school_rooms%rowtype;
  v_allocation public.teacher_allocations%rowtype;
begin
  select * into v_slot from public.timetable_slots where id=p_slot_id;
  if not found then raise exception 'Timetable slot not found.' using errcode='22023'; end if;
  if not app_private.has_school_role(v_slot.school_id, array['school_admin']) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  select * into v_allocation
  from public.teacher_allocations
  where id=v_slot.teacher_allocation_id;

  if p_room_id is null then
    update public.timetable_slots
    set room_id=null, room_label=null, updated_at=now()
    where id=p_slot_id;
  else
    select * into v_room
    from public.school_rooms
    where id=p_room_id and status='active';
    if not found or v_room.school_id<>v_slot.school_id or v_room.tenant_id<>v_slot.tenant_id then
      raise exception 'Room is not available for this school.' using errcode='22023';
    end if;

    if exists (
      select 1
      from public.timetable_slots other
      join public.teacher_allocations other_allocation
        on other_allocation.id=other.teacher_allocation_id
      where other.id<>p_slot_id
        and other.status='active'
        and other.school_id=v_slot.school_id
        and other.academic_year=v_slot.academic_year
        and other.cycle_code=v_slot.cycle_code
        and other.weekday=v_slot.weekday
        and other.period_id=v_slot.period_id
        and other.room_id=p_room_id
        and other_allocation.active_from<=coalesce(v_allocation.active_to,'infinity'::date)
        and v_allocation.active_from<=coalesce(other_allocation.active_to,'infinity'::date)
    ) then
      raise exception 'This room is already booked for an overlapping allocation period.' using errcode='23505';
    end if;

    update public.timetable_slots
    set room_id=p_room_id, room_label=v_room.display_name, updated_at=now()
    where id=p_slot_id;
  end if;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_slot.tenant_id,v_slot.school_id,auth.uid(),
    'timetable_slot.room_assigned','timetable_slot',p_slot_id,
    jsonb_build_object('room_id',p_room_id)
  );
end;
$$;

revoke all on function public.assign_timetable_slot_room(uuid,uuid) from public,anon;
grant execute on function public.assign_timetable_slot_room(uuid,uuid) to authenticated;

comment on function app_private.enforce_timetable_slot_integrity() is
'Defense-in-depth timetable guard using teacher-allocation effective periods for class, teacher, and room conflicts.';
comment on function public.create_timetable_slot(uuid,integer,text,smallint,uuid,uuid,uuid,text) is
'Creates a recurring timetable slot whose effective period is inherited from the linked teacher allocation; non-overlapping teacher handovers may coexist.';
comment on function public.assign_timetable_slot_room(uuid,uuid) is
'Assigns a room while checking timetable occupancy only across overlapping teacher-allocation effective periods.';
