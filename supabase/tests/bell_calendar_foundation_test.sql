begin;

select plan(11);

select has_table('public', 'timetable_bell_schedules', 'bell schedule table exists');
select has_table('public', 'timetable_bell_schedule_periods', 'bell schedule period table exists');

select is(
  (select count(*)::integer from public.timetable_bell_schedules where lower(display_name) in ('summer reference fixture','winter reference fixture')),
  0,
  'seasonal reference schedules are not seeded as production defaults'
);

insert into public.tenants(id,name,slug)
values('bd100000-0000-4000-8000-000000000001','Bell Calendar Fixture Tenant','bell-calendar-fixture');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('bd110000-0000-4000-8000-000000000001','bd100000-0000-4000-8000-000000000001','Bell Calendar Fixture School','BELL-FIXTURE','Khomas','Windhoek');

insert into public.timetable_periods(id,tenant_id,school_id,academic_year,period_number,display_name,is_teaching_period,starts_at,ends_at)
values
  ('bd120000-0000-4000-8000-000000000001','bd100000-0000-4000-8000-000000000001','bd110000-0000-4000-8000-000000000001',2197,1,'Period 1',true,'08:00','08:40'),
  ('bd120000-0000-4000-8000-000000000002','bd100000-0000-4000-8000-000000000001','bd110000-0000-4000-8000-000000000001',2197,2,'Period 2',true,null,null);

insert into public.timetable_bell_schedules(id,tenant_id,school_id,academic_year,display_name,effective_from,effective_to,applies_to_weekdays)
values
  ('bd130000-0000-4000-8000-000000000001','bd100000-0000-4000-8000-000000000001','bd110000-0000-4000-8000-000000000001',2197,'Summer reference fixture','2197-01-01','2197-06-30',array[1,2,3,4,5]::smallint[]),
  ('bd130000-0000-4000-8000-000000000002','bd100000-0000-4000-8000-000000000001','bd110000-0000-4000-8000-000000000001',2197,'Winter reference fixture','2197-07-01','2197-12-31',array[1,2,3,4,5]::smallint[]);

select is(
  public.resolve_timetable_bell_schedule('bd110000-0000-4000-8000-000000000001',2197,'2197-05-12')::text,
  'bd130000-0000-4000-8000-000000000001',
  'summer fixture resolves inside its effective date range'
);

select is(
  public.resolve_timetable_bell_schedule('bd110000-0000-4000-8000-000000000001',2197,'2197-08-11')::text,
  'bd130000-0000-4000-8000-000000000002',
  'winter fixture resolves inside its effective date range'
);

insert into public.timetable_bell_schedule_periods(bell_schedule_id,timetable_period_id,starts_at,ends_at)
values
  ('bd130000-0000-4000-8000-000000000002','bd120000-0000-4000-8000-000000000001','07:45','08:25'),
  ('bd130000-0000-4000-8000-000000000002','bd120000-0000-4000-8000-000000000002',null,null);

select is(
  (select starts_at::text from public.resolve_timetable_bell_periods('bd110000-0000-4000-8000-000000000001',2197,'2197-08-11') where period_id='bd120000-0000-4000-8000-000000000001'),
  '07:45:00',
  'effective bell schedule overrides the base teaching-period time'
);

select ok(
  (select starts_at is null and ends_at is null from public.resolve_timetable_bell_periods('bd110000-0000-4000-8000-000000000001',2197,'2197-08-11') where period_id='bd120000-0000-4000-8000-000000000002'),
  'Anytime teaching period remains untimed in an effective bell schedule'
);

insert into public.school_day_overrides(tenant_id,school_id,school_date,is_school_day,source)
values('bd100000-0000-4000-8000-000000000001','bd110000-0000-4000-8000-000000000001','2197-05-13',false,'school');

select is(
  public.resolve_school_teaching_impact('bd110000-0000-4000-8000-000000000001','2197-05-13'),
  'NO_TEACHING',
  'legacy is_school_day=false override resolves as NO_TEACHING'
);

update public.school_day_overrides
set is_school_day=true,
    teaching_impact='ALTERED_TIMETABLE',
    bell_schedule_id='bd130000-0000-4000-8000-000000000002'
where school_id='bd110000-0000-4000-8000-000000000001'
  and school_date='2197-05-13';

select is(
  public.resolve_timetable_bell_schedule('bd110000-0000-4000-8000-000000000001',2197,'2197-05-13')::text,
  'bd130000-0000-4000-8000-000000000002',
  'altered day can select a date-specific bell schedule ahead of automatic effective resolution'
);

select ok(
  to_regprocedure('public.resolve_timetable_day(uuid,integer,date)') is not null
  and to_regclass('public.timetable_cycle_anchors') is not null,
  'existing timetable day resolver and cycle anchors remain intact'
);

select throws_ok(
  $$insert into public.school_day_overrides(tenant_id,school_id,school_date,is_school_day,source,teaching_impact)
    values('bd100000-0000-4000-8000-000000000001','bd110000-0000-4000-8000-000000000001','2197-05-14',true,'school','INVALID')$$,
  '23514',
  null,
  'teaching impact is limited to the governed N17 vocabulary'
);

select * from finish();
rollback;
