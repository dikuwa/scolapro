begin;

-- N19 fixture-only reference schedules. These rows are rolled back and never seed production.
do $$
declare
  v_school_id uuid;
  v_tenant_id uuid;
  v_period_id uuid;
  v_summer_id uuid:=gen_random_uuid();
  v_winter_id uuid:=gen_random_uuid();
begin
  select s.id,s.tenant_id into v_school_id,v_tenant_id
  from public.schools s
  join public.academic_years ay on ay.school_id=s.id
  where ay.year=2026
  limit 1;

  if v_school_id is null then
    raise notice 'bell_calendar_foundation_test: no 2026 school fixture available; schema assertions still run';
    return;
  end if;

  select id into v_period_id from public.timetable_periods
  where school_id=v_school_id and academic_year=2026 order by period_number limit 1;

  insert into public.timetable_bell_schedules(id,tenant_id,school_id,academic_year,display_name,effective_from,effective_to,applies_to_weekdays)
  values
    (v_summer_id,v_tenant_id,v_school_id,2026,'Summer reference fixture','2026-01-01','2026-06-30',array[1,2,3,4,5]::smallint[]),
    (v_winter_id,v_tenant_id,v_school_id,2026,'Winter reference fixture','2026-07-01','2026-12-31',array[1,2,3,4,5]::smallint[]);

  if public.resolve_timetable_bell_schedule(v_school_id,2026,'2026-05-11')<>v_summer_id then
    raise exception 'Summer fixture was not selected inside its effective range';
  end if;
  if public.resolve_timetable_bell_schedule(v_school_id,2026,'2026-08-10')<>v_winter_id then
    raise exception 'Winter fixture was not selected inside its effective range';
  end if;

  if v_period_id is not null then
    insert into public.timetable_bell_schedule_periods(bell_schedule_id,timetable_period_id,starts_at,ends_at)
    values(v_winter_id,v_period_id,'07:45','08:25');
    if not exists(select 1 from public.resolve_timetable_bell_periods(v_school_id,2026,'2026-08-10') p where p.period_id=v_period_id and p.starts_at='07:45') then
      raise exception 'Effective bell period time was not resolved';
    end if;
  end if;
end $$;

-- Static invariants do not depend on fixture data.
do $$
begin
  if not exists(select 1 from pg_constraint where conname='school_day_overrides_teaching_impact_check') then
    raise exception 'Teaching impact constraint is missing';
  end if;
  if to_regprocedure('public.resolve_timetable_day(uuid,integer,date)') is null then
    raise exception 'Existing resolve_timetable_day() foundation must remain available';
  end if;
  if to_regclass('public.timetable_cycle_anchors') is null then
    raise exception 'Existing timetable_cycle_anchors foundation must remain available';
  end if;
end $$;

rollback;
