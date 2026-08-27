create or replace function public.upsert_school_subject(
  p_school_id uuid,
  p_subject_code text,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_subject_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_school_members(p_school_id) then raise exception 'Permission denied'; end if;

  select tenant_id into v_tenant_id from public.schools where id = p_school_id and status = 'active';
  if v_tenant_id is null then raise exception 'School not found or inactive'; end if;

  insert into public.subjects (tenant_id, school_id, subject_code, display_name)
  values (v_tenant_id, p_school_id, upper(btrim(p_subject_code)), btrim(p_display_name))
  on conflict (school_id, subject_code) do update
  set display_name = excluded.display_name,
      status = 'active',
      updated_at = now()
  returning id into v_subject_id;

  return v_subject_id;
end;
$$;

grant execute on function public.upsert_school_subject(uuid,text,text) to authenticated;

create or replace function public.upsert_subject_offering(
  p_school_id uuid,
  p_academic_year integer,
  p_subject_id uuid,
  p_grade_id uuid,
  p_periods_per_cycle smallint
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
  if not exists (select 1 from public.subjects where id = p_subject_id and school_id = p_school_id and status = 'active') then raise exception 'Subject is outside school scope'; end if;
  if not exists (select 1 from public.grades where id = p_grade_id and school_id = p_school_id and academic_year = p_academic_year) then raise exception 'Grade is outside school/year scope'; end if;

  insert into public.subject_offerings (tenant_id, school_id, academic_year, subject_id, grade_id, periods_per_cycle)
  values (v_tenant_id, p_school_id, p_academic_year, p_subject_id, p_grade_id, p_periods_per_cycle)
  on conflict (school_id, academic_year, subject_id, grade_id) do update
  set periods_per_cycle = excluded.periods_per_cycle,
      status = 'active',
      updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.upsert_subject_offering(uuid,integer,uuid,uuid,smallint) to authenticated;

create or replace function public.create_teacher_allocation(
  p_school_id uuid,
  p_academic_year integer,
  p_subject_offering_id uuid,
  p_register_class_id uuid,
  p_staff_member_id uuid
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

  if not exists (select 1 from public.subject_offerings where id = p_subject_offering_id and school_id = p_school_id and academic_year = p_academic_year and status = 'active') then raise exception 'Subject offering is outside school/year scope'; end if;
  if not exists (select 1 from public.register_classes where id = p_register_class_id and school_id = p_school_id and academic_year = p_academic_year) then raise exception 'Register class is outside school/year scope'; end if;
  if not exists (
    select 1 from public.staff_members sm
    join public.school_memberships m on m.staff_member_id = sm.id
    where sm.id = p_staff_member_id and m.school_id = p_school_id
      and m.active_from <= current_date and (m.active_to is null or m.active_to >= current_date)
  ) then raise exception 'Staff member is outside active school scope'; end if;

  insert into public.teacher_allocations (tenant_id, school_id, academic_year, subject_offering_id, register_class_id, staff_member_id)
  values (v_tenant_id, p_school_id, p_academic_year, p_subject_offering_id, p_register_class_id, p_staff_member_id)
  on conflict (subject_offering_id, register_class_id, staff_member_id, active_from) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.teacher_allocations
    where subject_offering_id = p_subject_offering_id
      and register_class_id = p_register_class_id
      and staff_member_id = p_staff_member_id
      and active_to is null
    order by active_from desc limit 1;
  end if;
  return v_id;
end;
$$;

grant execute on function public.create_teacher_allocation(uuid,integer,uuid,uuid,uuid) to authenticated;

create or replace function public.upsert_timetable_period(
  p_school_id uuid,
  p_academic_year integer,
  p_period_number smallint,
  p_display_name text,
  p_starts_at time default null,
  p_ends_at time default null,
  p_is_teaching_period boolean default true
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

  insert into public.timetable_periods (tenant_id, school_id, academic_year, period_number, display_name, starts_at, ends_at, is_teaching_period)
  values (v_tenant_id, p_school_id, p_academic_year, p_period_number, btrim(p_display_name), p_starts_at, p_ends_at, p_is_teaching_period)
  on conflict (school_id, academic_year, period_number) do update
  set display_name = excluded.display_name,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      is_teaching_period = excluded.is_teaching_period
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.upsert_timetable_period(uuid,integer,smallint,text,time,time,boolean) to authenticated;

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

  if not exists (select 1 from public.timetable_periods where id = p_period_id and school_id = p_school_id and academic_year = p_academic_year) then raise exception 'Period is outside school/year scope'; end if;
  if not exists (select 1 from public.register_classes where id = p_register_class_id and school_id = p_school_id and academic_year = p_academic_year) then raise exception 'Class is outside school/year scope'; end if;
  if not exists (select 1 from public.teacher_allocations where id = p_teacher_allocation_id and school_id = p_school_id and academic_year = p_academic_year and register_class_id = p_register_class_id and active_to is null) then raise exception 'Teacher allocation does not match the selected class'; end if;

  insert into public.timetable_slots (tenant_id, school_id, academic_year, cycle_code, weekday, period_id, register_class_id, teacher_allocation_id, room_label)
  values (v_tenant_id, p_school_id, p_academic_year, upper(coalesce(nullif(btrim(p_cycle_code), ''), 'A')), p_weekday, p_period_id, p_register_class_id, p_teacher_allocation_id, nullif(btrim(coalesce(p_room_label, '')), ''))
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'This class or teacher is already booked for that cycle, day and period';
end;
$$;

grant execute on function public.create_timetable_slot(uuid,integer,text,smallint,uuid,uuid,uuid,text) to authenticated;
