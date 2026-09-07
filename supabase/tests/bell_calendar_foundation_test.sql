begin;

select plan(19);

select has_table('public', 'timetable_bell_schedules', 'bell schedule table exists');
select has_table('public', 'timetable_bell_schedule_periods', 'bell schedule period table exists');

select is(
  (select count(*)::integer from public.timetable_bell_schedules where lower(display_name) in ('summer reference fixture','winter reference fixture')),
  0,
  'seasonal reference schedules are not seeded as production defaults'
);

select ok(
  not has_table_privilege('authenticated','public.timetable_bell_schedules','INSERT')
  and not has_table_privilege('authenticated','public.timetable_bell_schedules','UPDATE')
  and not has_table_privilege('authenticated','public.timetable_bell_schedules','DELETE'),
  'authenticated clients cannot bypass governed schedule mutations with direct DML'
);

select ok(
  not has_table_privilege('authenticated','public.timetable_bell_schedule_periods','INSERT')
  and not has_table_privilege('authenticated','public.timetable_bell_schedule_periods','UPDATE')
  and not has_table_privilege('authenticated','public.timetable_bell_schedule_periods','DELETE'),
  'authenticated clients cannot bypass governed bell-period mutations with direct DML'
);

insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'bd090000-0000-4000-8000-000000000001',
  'authenticated','authenticated','bell-calendar-admin@scolapro.invalid','',now(),now(),now()
);

insert into public.tenants(id,name,slug)
values('bd100000-0000-4000-8000-000000000001','Bell Calendar Fixture Tenant','bell-calendar-fixture');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('bd110000-0000-4000-8000-000000000001','bd100000-0000-4000-8000-000000000001','Bell Calendar Fixture School','BELL-FIXTURE','Khomas','Windhoek');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key)
values('bd100000-0000-4000-8000-000000000001','bd110000-0000-4000-8000-000000000001','bd090000-0000-4000-8000-000000000001','school_admin');

insert into public.academic_years(id,tenant_id,school_id,year,status)
values('bd115000-0000-4000-8000-000000000001','bd100000-0000-4000-8000-000000000001','bd110000-0000-4000-8000-000000000001',2197,'active');

insert into public.timetable_periods(id,tenant_id,school_id,academic_year,period_number,display_name,is_teaching_period,starts_at,ends_at)
values
  ('bd120000-0000-4000-8000-000000000001','bd100000-0000-4000-8000-000000000001','bd110000-0000-4000-8000-000000000001',2197,1,'Period 1',true,'08:00','08:40'),
  ('bd120000-0000-4000-8000-000000000002','bd100000-0000-4000-8000-000000000001','bd110000-0000-4000-8000-000000000001',2197,2,'Period 2',true,'09:00','09:40');

insert into public.timetable_bell_schedules(id,tenant_id,school_id,academic_year,display_name,effective_from,effective_to,applies_to_weekdays)
values
  ('bd130000-0000-4000-8000-000000000001','bd100000-0000-4000-8000-000000000001','bd110000-0000-4000-8000-000000000001',2197,'Summer reference fixture','2197-01-01','2197-06-30',array[1,2,3,4,5]::smallint[]),
  ('bd130000-0000-4000-8000-000000000002','bd100000-0000-4000-8000-000000000001','bd110000-0000-4000-8000-000000000001',2197,'Winter reference fixture','2197-07-01','2197-12-31',array[1,2,3,4,5]::smallint[]);

insert into public.timetable_bell_schedule_periods(bell_schedule_id,timetable_period_id,starts_at,ends_at)
values
  ('bd130000-0000-4000-8000-000000000002','bd120000-0000-4000-8000-000000000001','07:45','08:25'),
  ('bd130000-0000-4000-8000-000000000002','bd120000-0000-4000-8000-000000000002',null,null);

insert into public.school_day_overrides(tenant_id,school_id,school_date,is_school_day,source)
values('bd100000-0000-4000-8000-000000000001','bd110000-0000-4000-8000-000000000001','2197-05-13',false,'school');

select is(
  (select teaching_impact from public.school_day_overrides where school_id='bd110000-0000-4000-8000-000000000001' and school_date='2197-05-13'),
  'NO_TEACHING',
  'legacy closure writes derive and persist canonical NO_TEACHING semantics'
);

update public.school_day_overrides
set is_school_day=true,
    teaching_impact='ALTERED_TIMETABLE',
    bell_schedule_id='bd130000-0000-4000-8000-000000000002'
where school_id='bd110000-0000-4000-8000-000000000001'
  and school_date='2197-05-13';

select throws_ok(
  $$insert into public.school_day_overrides(tenant_id,school_id,school_date,is_school_day,source,teaching_impact)
    values('bd100000-0000-4000-8000-000000000001','bd110000-0000-4000-8000-000000000001','2197-05-14',true,'school','INVALID')$$,
  '23514',
  null,
  'teaching impact is limited to the governed N17 vocabulary'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'bd090000-0000-4000-8000-000000000001', true);

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

select is(
  (select starts_at::text from public.resolve_timetable_bell_periods('bd110000-0000-4000-8000-000000000001',2197,'2197-08-11') where period_id='bd120000-0000-4000-8000-000000000001'),
  '07:45:00',
  'effective bell schedule overrides the base teaching-period time'
);

select ok(
  (select starts_at is null and ends_at is null from public.resolve_timetable_bell_periods('bd110000-0000-4000-8000-000000000001',2197,'2197-08-11') where period_id='bd120000-0000-4000-8000-000000000002'),
  'explicit Anytime override remains untimed even when the base period has fixed times'
);

select is(
  public.resolve_school_teaching_impact('bd110000-0000-4000-8000-000000000001','2197-05-13'),
  'ALTERED_TIMETABLE',
  'richer teaching impact remains available through the date resolver'
);

select is(
  public.resolve_timetable_bell_schedule('bd110000-0000-4000-8000-000000000001',2197,'2197-05-13')::text,
  'bd130000-0000-4000-8000-000000000002',
  'altered day can select a date-specific bell schedule ahead of automatic effective resolution'
);

select throws_ok(
  $$select * from public.resolve_timetable_bell_periods('22222222-2222-4222-8222-222222222222',2026,'2026-01-12')$$,
  'Permission denied',
  'bell-period resolver rejects authenticated callers without school access'
);

select ok(
  to_regprocedure('public.resolve_timetable_day(uuid,integer,date)') is not null
  and to_regclass('public.timetable_cycle_anchors') is not null,
  'existing timetable day resolver and cycle anchors remain intact'
);

select lives_ok(
  $$select public.upsert_timetable_bell_schedule(
      'bd110000-0000-4000-8000-000000000001',2197,'Audited schedule','2197-03-01','2197-03-31',array[1,2,3,4,5]::smallint[]
    )$$,
  'governed bell schedule creation succeeds for an authorized school admin'
);

select lives_ok(
  $$select public.upsert_timetable_bell_schedule_period(
      'bd130000-0000-4000-8000-000000000001','bd120000-0000-4000-8000-000000000001','08:05','08:45'
    )$$,
  'governed bell period mutation succeeds for an authorized school admin'
);

select lives_ok(
  $$select public.configure_school_teaching_day(
      'bd110000-0000-4000-8000-000000000001','2197-04-09','PARTIAL_DAY','Assembly','school'::uuid,'school'
    )$$,
  'placeholder'
);

-- Use a valid null bell schedule for the audited partial-day mutation. The prior
-- lives_ok deliberately cannot be used because UUID coercion would obscure the RPC contract.
select lives_ok(
  $$select public.configure_school_teaching_day(
      'bd110000-0000-4000-8000-000000000001','2197-04-09','PARTIAL_DAY','Assembly',null,'school'
    )$$,
  'governed calendar teaching-impact mutation succeeds for an authorized school admin'
);

select is(
  (select count(*)::integer from public.audit_events
    where actor_user_id='bd090000-0000-4000-8000-000000000001'
      and event_type in ('timetable.bell_schedule.created','timetable.bell_period.changed','calendar.teaching_impact.changed')),
  3,
  'bell and teaching-impact mutations append canonical audit events'
);

select * from finish();
rollback;
