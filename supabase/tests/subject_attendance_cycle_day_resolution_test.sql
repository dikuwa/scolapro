begin;

select plan(5);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fdb00000-1000-4000-8000-000000000001','cycle-day-attendance@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fdb00000-1000-4000-8000-000000000001',
  'teacher',current_date-1
);

insert into public.staff_members(
  id,tenant_id,user_id,employee_number,first_name,last_name,status
) values(
  'fdb10000-1000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'fdb00000-1000-4000-8000-000000000001',
  'CYCLE-DAY-001','Cycle','Teacher','active'
);

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id
) values(
  'fdb20000-1000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fdb10000-1000-4000-8000-000000000001',
  'teacher',current_date-30,
  'fdb00000-1000-4000-8000-000000000001'
);

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name)
values(
  'fdb30000-1000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'CYCLE-DAY','Cycle Day Attendance'
);

insert into public.subject_offerings(
  id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle
) values(
  'fdb40000-1000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2026,
  'fdb30000-1000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000010',
  1
);

insert into public.teacher_allocations(
  id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from
) values(
  'fdb50000-1000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2026,
  'fdb40000-1000-4000-8000-000000000001',
  '40000000-0000-4000-8000-00000000001a',
  'fdb10000-1000-4000-8000-000000000001',
  current_date-30
);

insert into public.timetable_periods(
  id,tenant_id,school_id,academic_year,period_number,display_name,starts_at,ends_at
) values(
  'fdb60000-1000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2026,30,'Cycle Day Period','15:00','15:45'
);

update public.schools
set timetable_cycle_mode='weekday',timetable_cycle_length=7
where id='22222222-2222-4222-8222-222222222222';

insert into public.timetable_slots(
  id,tenant_id,school_id,academic_year,cycle_code,weekday,period_id,register_class_id,teacher_allocation_id,status
) values(
  'fdb70000-1000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2026,'CYCLE-DAY',extract(isodow from current_date)::smallint,
  'fdb60000-1000-4000-8000-000000000001',
  '40000000-0000-4000-8000-00000000001a',
  'fdb50000-1000-4000-8000-000000000001','active'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fdb00000-1000-4000-8000-000000000001',true);
set local role authenticated;

select has_function(
  'public',
  'submit_subject_period_attendance',
  array['uuid','date','jsonb','text','uuid','uuid','text'],
  'subject-period attendance submission RPC exists'
);

select lives_ok(
  $$select public.submit_subject_period_attendance(
    'fdb70000-1000-4000-8000-000000000001',current_date,'[]'::jsonb,'valid weekday',
    'fdb80000-1000-4000-8000-000000000001',null,'online'
  )$$,
  'valid configured weekday submission succeeds'
);

select throws_ok(
  $$select public.submit_subject_period_attendance(
    'fdb70000-1000-4000-8000-000000000001',current_date+1,'[]'::jsonb,'wrong day',
    'fdb80000-1000-4000-8000-000000000002',null,'online'
  )$$,
  'Attendance date does not match timetable day',
  'mismatched timetable day is rejected'
);

reset role;

delete from public.timetable_slots
where id='fdb70000-1000-4000-8000-000000000001';

insert into public.academic_years(tenant_id,school_id,year,status,starts_on,ends_on)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2027,'setup','2027-01-11','2027-12-05'
)
on conflict (school_id,year)
do update set starts_on=excluded.starts_on,ends_on=excluded.ends_on,status='setup';

update public.schools
set timetable_cycle_mode='rotating',timetable_cycle_length=5
where id='22222222-2222-4222-8222-222222222222';

delete from public.timetable_cycle_anchors
where school_id='22222222-2222-4222-8222-222222222222' and academic_year=2027;

insert into public.timetable_cycle_anchors(
  tenant_id,school_id,academic_year,anchor_date,anchor_day,created_by_user_id
) values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2027,'2027-01-11',1,
  'fdb00000-1000-4000-8000-000000000001'
);

set local role authenticated;

select is(
  public.resolve_timetable_date_for_day(
    '22222222-2222-4222-8222-222222222222',2027,2::smallint,'2027-01-14'
  ),
  '2027-01-12'::date,
  'rotating-cycle helper resolves the nearest configured Day 2 deterministically'
);

select is(
  public.resolve_timetable_date_for_day(
    '22222222-2222-4222-8222-222222222222',2027,2::smallint,'2027-01-14'
  ),
  '2027-01-12'::date,
  'repeated rotating-cycle resolution returns the same calendar date'
);

reset role;

select * from finish();
rollback;
