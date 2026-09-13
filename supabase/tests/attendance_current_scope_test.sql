begin;
select plan(15);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('ac100000-0000-4000-8000-000000000001','attendance-current-admin@example.test','authenticated','authenticated',now(),now()),
  ('ac100000-0000-4000-8000-000000000002','attendance-stale-teacher@example.test','authenticated','authenticated',now(),now()),
  ('ac100000-0000-4000-8000-000000000003','attendance-support@example.test','authenticated','authenticated',now(),now()),
  ('ac100000-0000-4000-8000-000000000004','attendance-multischool@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,region,town) values
  ('ac110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Attendance Other School','ATT-CURRENT-OTHER','Erongo','Walvis Bay');

insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name) values
  ('ac120000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ac110000-0000-4000-8000-000000000001',extract(year from current_date)::integer,'ATT-10','Attendance Grade 10');

insert into public.register_classes(id,tenant_id,school_id,grade_id,academic_year,class_code,display_name) values
  ('ac130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ac110000-0000-4000-8000-000000000001','ac120000-0000-4000-8000-000000000001',extract(year from current_date)::integer,'ATT-A','Attendance A');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ac100000-0000-4000-8000-000000000001','school_admin',current_date-1),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ac100000-0000-4000-8000-000000000003','school_admin',current_date-1),
  ('11111111-1111-4111-8111-111111111111','ac110000-0000-4000-8000-000000000001','ac100000-0000-4000-8000-000000000004','school_admin',current_date-20);

insert into public.platform_memberships(user_id,role_key,active_from) values
  ('ac100000-0000-4000-8000-000000000003','platform_support',current_date-10);

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('ac140000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ac100000-0000-4000-8000-000000000002','ATT-STALE','Stale','Teacher','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id
) values(
  'ac150000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'ac140000-0000-4000-8000-000000000001','teacher',current_date-30,'ac100000-0000-4000-8000-000000000001'
);

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ac100000-0000-4000-8000-000000000002','ac140000-0000-4000-8000-000000000001','teacher',current_date-30);

-- Create durable rows while the relevant actors still have valid authority.
insert into public.attendance_register_submissions(
  id,tenant_id,school_id,academic_year,register_class_id,attendance_date,recorded_by_user_id,note
) values(
  'ac160000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',extract(year from current_date)::integer,
  '40000000-0000-4000-8000-00000000001a',current_date,'ac100000-0000-4000-8000-000000000002','historical stale-placement evidence'
),(
  'ac160000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ac110000-0000-4000-8000-000000000001',extract(year from current_date)::integer,
  'ac130000-0000-4000-8000-000000000001',current_date,'ac100000-0000-4000-8000-000000000004','historical non-current-school evidence'
);

-- The multi-school actor now has a newer deterministic current school.
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ac100000-0000-4000-8000-000000000004','school_admin',current_date-1);

-- The linked teacher placement is now stale, while their school membership remains active.
update public.staff_school_assignments
set effective_to=current_date-1
where id='ac150000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ac100000-0000-4000-8000-000000000001',true);

select ok(
  app_private.can_record_attendance('22222222-2222-4222-8222-222222222222'),
  'current-school attendance administrator retains daily register authority'
);

select lives_ok(
  $$select public.submit_daily_register(
    '40000000-0000-4000-8000-00000000001a',current_date,'[]'::jsonb,'current scope',null,null,'online'
  )$$,
  'current-school attendance administrator can submit the current daily register'
);

select is(
  (select count(*)::integer from public.attendance_register_submissions
   where school_id='22222222-2222-4222-8222-222222222222' and attendance_date=current_date),
  2,
  'current-school register read exposes authorized current-school submissions'
);

-- Current register submission must reject an enrolment whose effective period ended.
reset role;
update public.enrolments
set enrolled_to=current_date-1,status='withdrawn'
where id='60000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','ac100000-0000-4000-8000-000000000001',true);

select throws_ok(
  $$select public.submit_daily_register(
    '40000000-0000-4000-8000-00000000001a',current_date,
    '[{"enrolment_id":"60000000-0000-4000-8000-000000000001","status":"absent"}]'::jsonb,
    'ended enrolment',null,null,'online'
  )$$,
  'Attendance exception contains an invalid enrolment',
  'ended enrolment is excluded from current register operations'
);

-- Stale linked placement cannot read or mutate attendance despite active membership.
select set_config('request.jwt.claim.sub','ac100000-0000-4000-8000-000000000002',true);
select is(
  (select count(*)::integer from public.attendance_register_submissions
   where id='ac160000-0000-4000-8000-000000000001'),
  0,
  'stale linked teacher placement cannot read current attendance evidence'
);
select throws_ok(
  $$select public.submit_daily_register(
    '40000000-0000-4000-8000-00000000001a',current_date,'[]'::jsonb,'stale teacher',null,null,'online'
  )$$,
  'Permission denied',
  'stale linked teacher placement cannot retain daily attendance mutation authority'
);

-- Platform Support remains non-operational even when mixed with school leadership.
select set_config('request.jwt.claim.sub','ac100000-0000-4000-8000-000000000003',true);
select is(
  (select count(*)::integer from public.attendance_register_submissions
   where school_id='22222222-2222-4222-8222-222222222222'),
  0,
  'Platform Support cannot read school-operational attendance through a school role'
);
select throws_ok(
  $$select public.submit_daily_register(
    '40000000-0000-4000-8000-00000000001a',current_date,'[]'::jsonb,'support',null,null,'online'
  )$$,
  'Permission denied',
  'Platform Support cannot write school-operational attendance through a school role'
);

-- Another still-active but non-current school cannot read or write attendance.
select set_config('request.jwt.claim.sub','ac100000-0000-4000-8000-000000000004',true);
select is(
  (select count(*)::integer from public.attendance_register_submissions
   where school_id='ac110000-0000-4000-8000-000000000001'),
  0,
  'another active non-current school cannot expose attendance submissions'
);
select throws_ok(
  $$select public.submit_daily_register(
    'ac130000-0000-4000-8000-000000000001',current_date,'[]'::jsonb,'non-current school',null,null,'online'
  )$$,
  'Permission denied',
  'another active non-current school cannot authorize attendance mutation'
);

-- Deterministic current-school authority still works for that same multi-school user.
select lives_ok(
  $$select public.submit_daily_register(
    '40000000-0000-4000-8000-00000000001a',current_date,'[]'::jsonb,'deterministic current school',null,null,'online'
  )$$,
  'multi-school actor can operate only their deterministic current school'
);

reset role;
select set_config('request.jwt.claim.sub','',true);

select is(
  (select count(*)::integer from public.attendance_register_submissions
   where id in ('ac160000-0000-4000-8000-000000000001','ac160000-0000-4000-8000-000000000002')),
  2,
  'historical attendance submissions remain durable after authority becomes stale or non-current'
);

select is(
  (select recorded_by_user_id from public.attendance_register_submissions where id='ac160000-0000-4000-8000-000000000001'),
  'ac100000-0000-4000-8000-000000000002'::uuid,
  'historical attendance recorder provenance remains intact'
);

select ok(
  not has_function_privilege('authenticated','app_private.user_can_record_daily_attendance(uuid,uuid)','EXECUTE'),
  'arbitrary-user attendance authorization helper remains private'
);

select ok(
  has_function_privilege('authenticated','app_private.can_record_attendance(uuid)','EXECUTE')
  and has_function_privilege('authenticated','app_private.can_read_current_attendance(uuid)','EXECUTE'),
  'narrow authenticated attendance policy wrappers remain executable for RLS/RPC evaluation'
);

select * from finish();
rollback;
