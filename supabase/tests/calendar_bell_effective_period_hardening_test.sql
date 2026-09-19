begin;

select plan(12);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('55300000-0000-4000-8000-000000000001','calendar-bell-manager@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','55300000-0000-4000-8000-000000000001','school_admin',current_date-1);

insert into public.academic_years(id,tenant_id,school_id,year,status,starts_on,ends_on)
values(
  '55301000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',2196,'setup','2196-01-15','2196-12-01'
);

insert into public.timetable_periods(
  id,tenant_id,school_id,academic_year,period_number,display_name,is_teaching_period,starts_at,ends_at
) values(
  '55302000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',2196,1,'Period 1',true,'08:00','08:40'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','55300000-0000-4000-8000-000000000001',true);
set local role authenticated;

select throws_ok(
  $$select public.upsert_timetable_bell_schedule(
    '22222222-2222-4222-8222-222222222222',2196,'Too early','2196-01-10','2196-02-01',array[1,2,3,4,5]::smallint[]
  )$$,
  'Bell schedule cannot start before the academic year',
  'bell schedule cannot start outside the academic-year anchor'
);

select throws_ok(
  $$select public.upsert_timetable_bell_schedule(
    '22222222-2222-4222-8222-222222222222',2196,'Too late','2196-11-01','2196-12-10',array[1,2,3,4,5]::smallint[]
  )$$,
  'Bell schedule cannot end after the academic year',
  'bell schedule cannot end outside the academic-year anchor'
);

select lives_ok(
  $$select public.upsert_timetable_bell_schedule(
    '22222222-2222-4222-8222-222222222222',2196,'Weekday base','2196-01-15','2196-06-30',array[1,2,3,4,5]::smallint[]
  )$$,
  'valid bell schedule inside academic-year window is accepted'
);

select throws_ok(
  $$select public.upsert_timetable_bell_schedule(
    '22222222-2222-4222-8222-222222222222',2196,'Overlap','2196-03-01','2196-05-31',array[1,3,5]::smallint[]
  )$$,
  'Bell schedule overlaps an existing schedule on one or more weekdays',
  'overlapping schedule on common weekdays fails safely'
);

select lives_ok(
  $$select public.upsert_timetable_bell_schedule(
    '22222222-2222-4222-8222-222222222222',2196,'Weekend parallel','2196-03-01','2196-05-31',array[6,7]::smallint[]
  )$$,
  'same date range is allowed when weekday coverage is disjoint'
);

select lives_ok(
  $$select public.upsert_timetable_bell_schedule(
    '22222222-2222-4222-8222-222222222222',2196,'Later weekdays','2196-07-01','2196-12-01',array[1,2,3,4,5]::smallint[]
  )$$,
  'adjacent non-overlapping weekday schedule is accepted'
);

select is(
  public.resolve_timetable_bell_schedule('22222222-2222-4222-8222-222222222222',2196,'2196-04-06')::text,
  (select id::text from public.timetable_bell_schedules where school_id='22222222-2222-4222-8222-222222222222' and academic_year=2196 and display_name='Weekday base'),
  'weekday resolver selects the single effective weekday schedule'
);

select is(
  public.resolve_timetable_bell_schedule('22222222-2222-4222-8222-222222222222',2196,'2196-04-03')::text,
  (select id::text from public.timetable_bell_schedules where school_id='22222222-2222-4222-8222-222222222222' and academic_year=2196 and display_name='Weekend parallel'),
  'weekend resolver selects disjoint weekend schedule'
);

reset role;

insert into public.timetable_bell_schedules(
  id,tenant_id,school_id,academic_year,display_name,effective_from,effective_to,applies_to_weekdays,created_by_user_id
) values(
  '55303000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',2196,'Historical fixture',current_date-30,current_date-1,array[1,2,3,4,5]::smallint[],
  '55300000-0000-4000-8000-000000000001'
);

insert into public.timetable_bell_schedule_periods(
  bell_schedule_id,timetable_period_id,starts_at,ends_at
) values(
  '55303000-0000-4000-8000-000000000001','55302000-0000-4000-8000-000000000001','07:30','08:10'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','55300000-0000-4000-8000-000000000001',true);

select throws_ok(
  $$select public.upsert_timetable_bell_schedule_period(
    '55303000-0000-4000-8000-000000000001','55302000-0000-4000-8000-000000000001','07:45','08:25'
  )$$,
  'Historical bell schedules are final; create a new effective schedule instead',
  'completed historical bell period configuration cannot be rewritten'
);

reset role;

select is(
  (select starts_at::text from public.timetable_bell_schedule_periods
   where bell_schedule_id='55303000-0000-4000-8000-000000000001'
     and timetable_period_id='55302000-0000-4000-8000-000000000001'),
  '07:30:00',
  'denied historical edit leaves original bell period intact'
);

select ok(
  has_function_privilege('authenticated','public.resolve_timetable_bell_periods(uuid,integer,date)','EXECUTE')
  and not has_function_privilege('anon','public.resolve_timetable_bell_periods(uuid,integer,date)','EXECUTE'),
  'bell-period resolution remains authenticated-only'
);

select ok(
  to_regprocedure('public.resolve_timetable_day(uuid,integer,date)') is not null,
  'canonical timetable-day/calendar-anchor resolver remains intact'
);

select * from finish();
rollback;
