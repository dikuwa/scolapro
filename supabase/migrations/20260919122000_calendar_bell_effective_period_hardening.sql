-- Issue #553: bounded calendar/bell effective-period hardening.
-- Preserve the canonical calendar/bell models; close overlap and historical-edit gaps.

create or replace function public.upsert_timetable_bell_schedule(
  p_school_id uuid,
  p_academic_year integer,
  p_display_name text,
  p_effective_from date,
  p_effective_to date default null,
  p_applies_to_weekdays smallint[] default array[1,2,3,4,5]::smallint[]
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_school public.schools%rowtype;
  v_year public.academic_years%rowtype;
  v_id uuid;
  v_weekdays smallint[];
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_platform_role(array['platform_admin']) and (
       not app_private.user_targets_current_school(auth.uid(),p_school_id)
       or not app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])
     ) then raise exception 'Permission denied'; end if;
  if btrim(coalesce(p_display_name,''))='' then raise exception 'Bell schedule name is required'; end if;
  if p_effective_from is null then raise exception 'Bell schedule start date is required'; end if;
  if p_effective_to is not null and p_effective_to<p_effective_from then raise exception 'Bell schedule end date cannot be before start date'; end if;
  if p_applies_to_weekdays is null or cardinality(p_applies_to_weekdays)<1 or not (p_applies_to_weekdays <@ array[1,2,3,4,5,6,7]::smallint[]) then
    raise exception 'Choose at least one valid weekday';
  end if;

  select * into v_school from public.schools where id=p_school_id and status='active';
  if not found then raise exception 'School not found or inactive'; end if;

  select * into v_year
  from public.academic_years
  where school_id=p_school_id and year=p_academic_year;
  if not found then raise exception 'Configure the academic year before creating a bell schedule'; end if;

  if v_year.starts_on is not null and p_effective_from<v_year.starts_on then
    raise exception 'Bell schedule cannot start before the academic year';
  end if;
  if v_year.ends_on is not null and coalesce(p_effective_to,v_year.ends_on)>v_year.ends_on then
    raise exception 'Bell schedule cannot end after the academic year';
  end if;

  select array_agg(distinct d order by d) into v_weekdays
  from unnest(p_applies_to_weekdays) d;

  if exists(
    select 1
    from public.timetable_bell_schedules bs
    where bs.school_id=p_school_id
      and bs.academic_year=p_academic_year
      and daterange(bs.effective_from,coalesce(bs.effective_to,'infinity'::date),'[]')
          && daterange(p_effective_from,coalesce(p_effective_to,'infinity'::date),'[]')
      and bs.applies_to_weekdays && v_weekdays
  ) then
    raise exception 'Bell schedule overlaps an existing schedule on one or more weekdays';
  end if;

  insert into public.timetable_bell_schedules(
    tenant_id,school_id,academic_year,display_name,effective_from,effective_to,applies_to_weekdays,created_by_user_id
  ) values (
    v_school.tenant_id,p_school_id,p_academic_year,btrim(p_display_name),p_effective_from,p_effective_to,
    v_weekdays,auth.uid()
  ) returning id into v_id;

  insert into public.audit_events(
    tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
  ) values (
    v_school.tenant_id, p_school_id, auth.uid(), 'timetable.bell_schedule.created',
    'timetable_bell_schedule', v_id,
    jsonb_build_object(
      'academic_year', p_academic_year,
      'display_name', btrim(p_display_name),
      'effective_from', p_effective_from,
      'effective_to', p_effective_to,
      'applies_to_weekdays', to_jsonb(v_weekdays)
    )
  );

  return v_id;
end;
$$;

create or replace function public.upsert_timetable_bell_schedule_period(
  p_bell_schedule_id uuid,
  p_timetable_period_id uuid,
  p_starts_at time default null,
  p_ends_at time default null
)
returns void
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_schedule public.timetable_bell_schedules%rowtype;
  v_period public.timetable_periods%rowtype;
  v_override_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_schedule from public.timetable_bell_schedules where id=p_bell_schedule_id;
  if not found then raise exception 'Bell schedule not found'; end if;
  if not app_private.has_platform_role(array['platform_admin']) and (
       not app_private.user_targets_current_school(auth.uid(),v_schedule.school_id)
       or not app_private.has_school_role(v_schedule.school_id,array['school_admin','principal','deputy_principal'])
     ) then raise exception 'Permission denied'; end if;

  if v_schedule.effective_to is not null and v_schedule.effective_to<current_date then
    raise exception 'Historical bell schedules are final; create a new effective schedule instead';
  end if;

  select * into v_period from public.timetable_periods where id=p_timetable_period_id;
  if not found or v_period.school_id<>v_schedule.school_id or v_period.academic_year<>v_schedule.academic_year then
    raise exception 'Timetable period is outside bell schedule school/year scope';
  end if;
  if (p_starts_at is null)<>(p_ends_at is null) then raise exception 'Provide both bell times or leave both empty for Anytime'; end if;
  if p_starts_at is not null and p_ends_at<=p_starts_at then raise exception 'Bell schedule end time must be after start time'; end if;

  insert into public.timetable_bell_schedule_periods(bell_schedule_id,timetable_period_id,starts_at,ends_at)
  values(p_bell_schedule_id,p_timetable_period_id,p_starts_at,p_ends_at)
  on conflict(bell_schedule_id,timetable_period_id)
  do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,updated_at=now()
  returning id into v_override_id;

  insert into public.audit_events(
    tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
  ) values (
    v_schedule.tenant_id, v_schedule.school_id, auth.uid(), 'timetable.bell_period.changed',
    'timetable_bell_schedule_period', v_override_id,
    jsonb_build_object(
      'bell_schedule_id', p_bell_schedule_id,
      'timetable_period_id', p_timetable_period_id,
      'starts_at', p_starts_at,
      'ends_at', p_ends_at,
      'anytime', p_starts_at is null and p_ends_at is null
    )
  );
end;
$$;

revoke all on function public.upsert_timetable_bell_schedule(uuid,integer,text,date,date,smallint[]) from public,anon;
revoke all on function public.upsert_timetable_bell_schedule_period(uuid,uuid,time,time) from public,anon;
grant execute on function public.upsert_timetable_bell_schedule(uuid,integer,text,date,date,smallint[]) to authenticated;
grant execute on function public.upsert_timetable_bell_schedule_period(uuid,uuid,time,time) to authenticated;

comment on function public.upsert_timetable_bell_schedule(uuid,integer,text,date,date,smallint[]) is
'Creates a school-local effective bell schedule only inside the configured academic-year window and rejects overlapping weekday/date coverage.';
comment on function public.upsert_timetable_bell_schedule_period(uuid,uuid,time,time) is
'Configures period times for non-historical bell schedules; completed historical schedules are immutable.';
