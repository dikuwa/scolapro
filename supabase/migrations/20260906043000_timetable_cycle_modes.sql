-- Per-school timetable day model: standard weekday labels or rotating Day N cycles.
-- Existing schools remain Monday-Friday by default.

alter table public.schools
  add column if not exists timetable_cycle_mode text not null default 'weekday',
  add column if not exists timetable_cycle_length smallint not null default 5;

alter table public.schools
  drop constraint if exists schools_timetable_cycle_mode_check,
  drop constraint if exists schools_timetable_cycle_length_check,
  drop constraint if exists schools_weekday_mode_max_7_check;

alter table public.schools
  add constraint schools_timetable_cycle_mode_check
    check (timetable_cycle_mode in ('weekday','rotating')),
  add constraint schools_timetable_cycle_length_check
    check (timetable_cycle_length between 1 and 10),
  add constraint schools_weekday_mode_max_7_check
    check (timetable_cycle_mode <> 'weekday' or timetable_cycle_length <= 7);

alter table public.timetable_slots
  drop constraint if exists timetable_slots_weekday_check;

alter table public.timetable_slots
  add constraint timetable_slots_weekday_check
  check (weekday between 1 and 10);

create or replace function app_private.enforce_timetable_slot_cycle_day()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_cycle_length smallint;
begin
  select s.timetable_cycle_length
    into v_cycle_length
  from public.schools s
  where s.id=new.school_id;

  if v_cycle_length is null then
    raise exception 'Timetable slot school does not exist' using errcode='23503';
  end if;

  if new.weekday > v_cycle_length then
    raise exception 'Day % is outside this school''s configured timetable cycle', new.weekday
      using errcode='23514';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_timetable_slot_cycle_day()
from public,anon,authenticated;

drop trigger if exists timetable_slot_cycle_day_trg on public.timetable_slots;
create trigger timetable_slot_cycle_day_trg
before insert or update of school_id,weekday
on public.timetable_slots
for each row execute function app_private.enforce_timetable_slot_cycle_day();

create or replace function app_private.enforce_school_timetable_cycle_configuration()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_max_day smallint;
begin
  if new.timetable_cycle_mode='weekday' and new.timetable_cycle_length>7 then
    raise exception 'Standard weekday timetable cycles cannot exceed 7 days' using errcode='23514';
  end if;

  if new.timetable_cycle_length<1 or new.timetable_cycle_length>10 then
    raise exception 'Timetable cycle length must be between 1 and 10 days' using errcode='23514';
  end if;

  if tg_op='UPDATE' and new.timetable_cycle_length < old.timetable_cycle_length then
    select max(ts.weekday)
      into v_max_day
    from public.timetable_slots ts
    where ts.school_id=new.id
      and ts.status='active';

    if v_max_day is not null and v_max_day>new.timetable_cycle_length then
      raise exception 'Timetable cycle cannot be shortened below Day % while active slots still use that day', v_max_day
        using errcode='23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_school_timetable_cycle_configuration()
from public,anon,authenticated;

drop trigger if exists school_timetable_cycle_configuration_trg on public.schools;
create trigger school_timetable_cycle_configuration_trg
before insert or update of timetable_cycle_mode,timetable_cycle_length
on public.schools
for each row execute function app_private.enforce_school_timetable_cycle_configuration();

create or replace function public.update_school_timetable_cycle(
  p_school_id uuid,
  p_cycle_mode text,
  p_cycle_length smallint
)
returns void
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_mode text := lower(btrim(coalesce(p_cycle_mode,'')));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_school_role(p_school_id,array['school_admin','principal']) then
    raise exception 'Permission denied';
  end if;

  if v_mode not in ('weekday','rotating') then
    raise exception 'Timetable cycle mode must be weekday or rotating';
  end if;
  if p_cycle_length is null or p_cycle_length<1 or p_cycle_length>10 then
    raise exception 'Timetable cycle length must be between 1 and 10 days';
  end if;
  if v_mode='weekday' and p_cycle_length>7 then
    raise exception 'Standard weekday timetable cycles cannot exceed 7 days';
  end if;

  update public.schools
  set timetable_cycle_mode=v_mode,
      timetable_cycle_length=p_cycle_length,
      updated_at=now()
  where id=p_school_id and status='active';

  if not found then raise exception 'School not found or inactive'; end if;
end;
$$;

revoke all on function public.update_school_timetable_cycle(uuid,text,smallint)
from public,anon;
grant execute on function public.update_school_timetable_cycle(uuid,text,smallint)
to authenticated;

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
  v_cycle_length smallint;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_school_members(p_school_id) then raise exception 'Permission denied'; end if;

  select tenant_id,timetable_cycle_length
    into v_tenant_id,v_cycle_length
  from public.schools
  where id=p_school_id and status='active';

  if v_tenant_id is null then raise exception 'School not found or inactive'; end if;
  if p_weekday<1 or p_weekday>v_cycle_length then
    raise exception 'Day % is outside this school''s configured timetable cycle', p_weekday;
  end if;

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

comment on column public.schools.timetable_cycle_mode is
  'School timetable day vocabulary: weekday uses real weekday names; rotating uses Day N labels.';
comment on column public.schools.timetable_cycle_length is
  'Number of configured timetable days. Weekday mode permits 1-7; rotating mode permits 1-10.';
comment on function public.update_school_timetable_cycle(uuid,text,smallint) is
  'Governed School Admin/Principal boundary for changing the school timetable day model without invalidating active slots.';
comment on function app_private.enforce_timetable_slot_cycle_day() is
  'Defense-in-depth guard preventing timetable slots from using a day beyond the school configured cycle length.';
