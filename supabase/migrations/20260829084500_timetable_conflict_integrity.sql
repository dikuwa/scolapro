-- Timetable conflicts must be enforced by the physical model, not only by UI/RPC
-- assumptions. The original teacher-conflict index keyed teacher_allocation_id, which
-- allowed the same staff member to be double-booked through two different allocations.
-- The original class UNIQUE constraint also retained cancelled slots as blockers.

-- Replace the unconditional class uniqueness constraint with an active-only index so
-- cancelled/superseded history can coexist with the replacement slot.
do $$
declare
  v_constraint text;
begin
  select c.conname into v_constraint
  from pg_constraint c
  where c.conrelid='public.timetable_slots'::regclass
    and c.contype='u'
    and pg_get_constraintdef(c.oid)='UNIQUE (school_id, academic_year, cycle_code, weekday, period_id, register_class_id)'
  limit 1;

  if v_constraint is not null then
    execute format('alter table public.timetable_slots drop constraint %I',v_constraint);
  end if;
end;
$$;

create unique index if not exists timetable_slots_class_active_conflict_uidx
on public.timetable_slots(school_id,academic_year,cycle_code,weekday,period_id,register_class_id)
where status='active';

-- Room occupancy must survive direct-table writes as well as the room assignment RPC.
create unique index if not exists timetable_slots_room_active_conflict_uidx
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

  if new.status='active' and exists(
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
  ) then
    raise exception 'Teacher is already booked for that cycle, day and period' using errcode='23505';
  end if;

  return new;
end;
$$;
revoke all on function app_private.enforce_timetable_slot_integrity() from public,anon,authenticated;

drop trigger if exists timetable_slot_integrity_guard on public.timetable_slots;
create trigger timetable_slot_integrity_guard
before insert or update on public.timetable_slots
for each row execute function app_private.enforce_timetable_slot_integrity();

comment on function app_private.enforce_timetable_slot_integrity() is
'Defense-in-depth timetable guard: validates slot scope and prevents one staff member being double-booked through different teacher allocations.';