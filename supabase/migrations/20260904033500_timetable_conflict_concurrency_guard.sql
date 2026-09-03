-- Trigger-based overlap validation needs serialization: without a shared transaction
-- lock, two concurrent writes can both observe the pre-commit state and create a
-- conflicting timetable. Use narrowly scoped advisory locks for the same class,
-- teacher, or room at a recurring timetable position.

create or replace function app_private.lock_timetable_conflict_key(
  p_kind text,
  p_school_id uuid,
  p_academic_year integer,
  p_cycle_code text,
  p_weekday smallint,
  p_period_id uuid,
  p_entity_id uuid
)
returns void
language sql
volatile
security definer
set search_path=pg_catalog
as $$
  select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws('|',
        'scolapro-timetable',
        coalesce(p_kind,''),
        coalesce(p_school_id::text,''),
        coalesce(p_academic_year::text,''),
        coalesce(p_cycle_code,''),
        coalesce(p_weekday::text,''),
        coalesce(p_period_id::text,''),
        coalesce(p_entity_id::text,'')
      ),
      0
    )
  );
$$;

revoke all on function app_private.lock_timetable_conflict_key(text,uuid,integer,text,smallint,uuid,uuid)
from public,anon,authenticated;

create or replace function app_private.serialize_timetable_slot_conflicts()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_allocation public.teacher_allocations%rowtype;
begin
  if new.status<>'active' then
    return new;
  end if;

  select * into v_allocation
  from public.teacher_allocations
  where id=new.teacher_allocation_id;

  if not found then
    -- The integrity trigger that follows raises the canonical FK-style error.
    return new;
  end if;

  -- Keep lock acquisition order stable across all timetable mutations.
  perform app_private.lock_timetable_conflict_key(
    'class',new.school_id,new.academic_year,new.cycle_code,new.weekday,
    new.period_id,new.register_class_id
  );

  perform app_private.lock_timetable_conflict_key(
    'teacher',new.school_id,new.academic_year,new.cycle_code,new.weekday,
    new.period_id,v_allocation.staff_member_id
  );

  if new.room_id is not null then
    perform app_private.lock_timetable_conflict_key(
      'room',new.school_id,new.academic_year,new.cycle_code,new.weekday,
      new.period_id,new.room_id
    );
  end if;

  return new;
end;
$$;

revoke all on function app_private.serialize_timetable_slot_conflicts()
from public,anon,authenticated;

drop trigger if exists a_timetable_conflict_serialization_trg on public.timetable_slots;
create trigger a_timetable_conflict_serialization_trg
before insert or update of
  school_id,academic_year,cycle_code,weekday,period_id,register_class_id,
  teacher_allocation_id,room_id,status
on public.timetable_slots
for each row execute function app_private.serialize_timetable_slot_conflicts();

create or replace function app_private.serialize_teacher_allocation_timetable_conflicts()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_slot record;
begin
  if new.active_from is not distinct from old.active_from
     and new.active_to is not distinct from old.active_to then
    return new;
  end if;

  -- Acquire every class key first, then every teacher key, then every room key.
  -- The category ordering matches the timetable-slot serialization trigger and the
  -- within-category ORDER BY keeps multi-slot allocation edits deterministic.
  for v_slot in
    select distinct
      ts.school_id,ts.academic_year,ts.cycle_code,ts.weekday,ts.period_id,
      ts.register_class_id
    from public.timetable_slots ts
    where ts.teacher_allocation_id=new.id and ts.status='active'
    order by ts.school_id,ts.academic_year,ts.cycle_code,ts.weekday,ts.period_id,ts.register_class_id
  loop
    perform app_private.lock_timetable_conflict_key(
      'class',v_slot.school_id,v_slot.academic_year,v_slot.cycle_code,
      v_slot.weekday,v_slot.period_id,v_slot.register_class_id
    );
  end loop;

  for v_slot in
    select distinct
      ts.school_id,ts.academic_year,ts.cycle_code,ts.weekday,ts.period_id
    from public.timetable_slots ts
    where ts.teacher_allocation_id=new.id and ts.status='active'
    order by ts.school_id,ts.academic_year,ts.cycle_code,ts.weekday,ts.period_id
  loop
    perform app_private.lock_timetable_conflict_key(
      'teacher',v_slot.school_id,v_slot.academic_year,v_slot.cycle_code,
      v_slot.weekday,v_slot.period_id,new.staff_member_id
    );
  end loop;

  for v_slot in
    select distinct
      ts.school_id,ts.academic_year,ts.cycle_code,ts.weekday,ts.period_id,ts.room_id
    from public.timetable_slots ts
    where ts.teacher_allocation_id=new.id
      and ts.status='active'
      and ts.room_id is not null
    order by ts.school_id,ts.academic_year,ts.cycle_code,ts.weekday,ts.period_id,ts.room_id
  loop
    perform app_private.lock_timetable_conflict_key(
      'room',v_slot.school_id,v_slot.academic_year,v_slot.cycle_code,
      v_slot.weekday,v_slot.period_id,v_slot.room_id
    );
  end loop;

  return new;
end;
$$;

revoke all on function app_private.serialize_teacher_allocation_timetable_conflicts()
from public,anon,authenticated;

drop trigger if exists a_teacher_allocation_timetable_serialization_trg on public.teacher_allocations;
create trigger a_teacher_allocation_timetable_serialization_trg
before update of active_from,active_to
on public.teacher_allocations
for each row execute function app_private.serialize_teacher_allocation_timetable_conflicts();

comment on function app_private.lock_timetable_conflict_key(text,uuid,integer,text,smallint,uuid,uuid) is
'Transaction-scoped serialization key for recurring timetable class, teacher, and room conflict checks.';
comment on function app_private.serialize_timetable_slot_conflicts() is
'Precedes timetable overlap validation and serializes concurrent writes that target the same class, teacher, or room position.';
comment on function app_private.serialize_teacher_allocation_timetable_conflicts() is
'Serializes allocation effective-period edits against timetable writes using the same conflict keys.';
