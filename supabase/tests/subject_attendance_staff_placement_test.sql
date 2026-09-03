begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fda00000-1000-4000-8000-000000000001','subject-placement-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(
  id,tenant_id,user_id,employee_number,first_name,last_name,status
) values(
  'fda10000-1000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'fda00000-1000-4000-8000-000000000001',
  'SUBJ-PLACE-001','Subject','Teacher','active'
);

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values(
  'fda20000-1000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fda10000-1000-4000-8000-000000000001',
  'teacher',current_date-30,null,
  'fda00000-1000-4000-8000-000000000001'
);

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name)
values(
  'fda30000-1000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'SUBJ-PLACE','Subject Placement Test'
);

insert into public.subject_offerings(
  id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle
) values(
  'fda40000-1000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2026,
  'fda30000-1000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000010',
  1
);

insert into public.teacher_allocations(
  id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from
) values(
  'fda50000-1000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2026,
  'fda40000-1000-4000-8000-000000000001',
  '40000000-0000-4000-8000-00000000001a',
  'fda10000-1000-4000-8000-000000000001',
  current_date-30
);

insert into public.timetable_periods(
  id,tenant_id,school_id,academic_year,period_number,display_name,starts_at,ends_at
) values(
  'fda60000-1000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2026,29,'Placement Period','14:00','14:45'
);

insert into public.timetable_slots(
  id,tenant_id,school_id,academic_year,cycle_code,weekday,period_id,register_class_id,teacher_allocation_id,status
) values(
  'fda70000-1000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2026,'PLACEMENT',extract(isodow from current_date)::smallint,
  'fda60000-1000-4000-8000-000000000001',
  '40000000-0000-4000-8000-00000000001a',
  'fda50000-1000-4000-8000-000000000001','active'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fda00000-1000-4000-8000-000000000001',true);

select is(
  app_private.can_record_subject_attendance(
    'fda70000-1000-4000-8000-000000000001',current_date
  ),
  true,
  'allocated teacher can record subject attendance while school placement is effective'
);

select lives_ok(
  $$select public.submit_subject_period_attendance(
    'fda70000-1000-4000-8000-000000000001',current_date,'[]'::jsonb,'Before departure',
    'fda80000-1000-4000-8000-000000000001',null,'online'
  )$$,
  'allocated teacher can submit subject-period attendance before placement ends'
);

update public.staff_school_assignments
set effective_to=current_date-1
where id='fda20000-1000-4000-8000-000000000001';

select is(
  app_private.staff_member_has_school_assignment(
    'fda10000-1000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222',
    current_date
  ),
  false,
  'teacher no longer has effective school placement after departure'
);

select is(
  app_private.can_record_subject_attendance(
    'fda70000-1000-4000-8000-000000000001',current_date
  ),
  false,
  'open teacher allocation no longer grants subject-attendance authority after placement ends'
);

select throws_ok(
  $$select public.submit_subject_period_attendance(
    'fda70000-1000-4000-8000-000000000001',current_date,'[]'::jsonb,'After departure',
    'fda80000-1000-4000-8000-000000000002',null,'online'
  )$$,
  'Permission denied',
  'subject-period attendance submission is rejected after teacher placement ends'
);

select is(
  (select count(*)::integer from public.subject_attendance_submissions
   where timetable_slot_id='fda70000-1000-4000-8000-000000000001'),
  1,
  'rejected stale-authority attempt does not create a second submission'
);

select is(
  (select count(*)::integer from public.teacher_allocations
   where id='fda50000-1000-4000-8000-000000000001'),
  1,
  'teacher allocation history remains stored after operational authority is removed'
);

select * from finish();
rollback;
