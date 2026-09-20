begin;

select plan(8);

insert into public.schools(id,tenant_id,name,status) values
  ('f6311000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Conduct Perf Current','active'),
  ('f6311000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Conduct Perf Other','active');

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('f6312000-0000-4000-8000-000000000001','conduct-perf-admin@example.test','authenticated','authenticated',now(),now()),
  ('f6312000-0000-4000-8000-000000000002','conduct-perf-class@example.test','authenticated','authenticated',now(),now()),
  ('f6312000-0000-4000-8000-000000000003','conduct-perf-support@example.test','authenticated','authenticated',now(),now()),
  ('f6312000-0000-4000-8000-000000000004','conduct-perf-platform@example.test','authenticated','authenticated',now(),now()),
  ('f6312000-0000-4000-8000-000000000005','conduct-perf-other@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values('f6313000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','f6312000-0000-4000-8000-000000000002','COND-PERF-CT','Conduct','Teacher','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id
) values(
  'f6313100-0000-4000-8000-000000000002',
  '11111111-1111-4111-8111-111111111111',
  'f6311000-0000-4000-8000-000000000001',
  'f6313000-0000-4000-8000-000000000002',
  'teacher',current_date-5,'f6312000-0000-4000-8000-000000000001'
);

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','f6311000-0000-4000-8000-000000000001','f6312000-0000-4000-8000-000000000001',null,'school_admin',current_date-5),
  ('11111111-1111-4111-8111-111111111111','f6311000-0000-4000-8000-000000000001','f6312000-0000-4000-8000-000000000002','f6313000-0000-4000-8000-000000000002','class_teacher',current_date-5),
  ('11111111-1111-4111-8111-111111111111','f6311000-0000-4000-8000-000000000002','f6312000-0000-4000-8000-000000000005',null,'school_admin',current_date-5);

insert into public.platform_memberships(user_id,role_key,active_from) values
  ('f6312000-0000-4000-8000-000000000003','platform_support',current_date-5),
  ('f6312000-0000-4000-8000-000000000004','platform_admin',current_date-5);

set local session_replication_role=replica;

insert into public.register_classes(id,tenant_id,school_id,academic_year,class_code,display_name,register_teacher_staff_id) values
  ('f6314000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','f6311000-0000-4000-8000-000000000001',2026,'CP-A','Conduct Perf A','f6313000-0000-4000-8000-000000000002'),
  ('f6314000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','f6311000-0000-4000-8000-000000000001',2026,'CP-B','Conduct Perf B',null);

insert into public.learners(id,tenant_id,first_names,surname) values
  ('f6315000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Assigned','Learner'),
  ('f6315000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Other','Learner'),
  ('f6315000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','Ended','Learner');

insert into public.enrolments(
 id,tenant_id,school_id,learner_id,academic_year,register_class_id,enrolled_from,enrolled_to,status
) values
  ('f6316000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','f6311000-0000-4000-8000-000000000001','f6315000-0000-4000-8000-000000000001',2026,'f6314000-0000-4000-8000-000000000001',current_date-10,null,'current'),
  ('f6316000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','f6311000-0000-4000-8000-000000000001','f6315000-0000-4000-8000-000000000002',2026,'f6314000-0000-4000-8000-000000000002',current_date-10,null,'current'),
  ('f6316000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','f6311000-0000-4000-8000-000000000001','f6315000-0000-4000-8000-000000000003',2026,'f6314000-0000-4000-8000-000000000001',current_date-10,current_date-1,'withdrawn');

set local session_replication_role=origin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','f6312000-0000-4000-8000-000000000001',true);
select is(
  (select count(*)::integer from public.list_conduct_learners('f6311000-0000-4000-8000-000000000001',current_date)),
  2,
  'current-school admin retains school-wide current learner roster'
);

select set_config('request.jwt.claim.sub','f6312000-0000-4000-8000-000000000002',true);
select is(
  (select count(*)::integer from public.list_conduct_learners('f6311000-0000-4000-8000-000000000001',current_date)),
  1,
  'class teacher retains only assigned learner scope'
);
select is(
  (select count(*)::integer from public.list_conduct_learners('f6311000-0000-4000-8000-000000000001',current_date-2)),
  1,
  'class teacher roster remains effective-date aware'
);

select set_config('request.jwt.claim.sub','f6312000-0000-4000-8000-000000000003',true);
select is(
  (select count(*)::integer from public.list_conduct_learners('f6311000-0000-4000-8000-000000000001',current_date)),
  0,
  'Platform Support remains denied conduct roster access'
);

select set_config('request.jwt.claim.sub','f6312000-0000-4000-8000-000000000004',true);
select is(
  (select count(*)::integer from public.list_conduct_learners('f6311000-0000-4000-8000-000000000001',current_date)),
  2,
  'governed Platform Admin retains conduct roster oversight'
);

select set_config('request.jwt.claim.sub','f6312000-0000-4000-8000-000000000005',true);
select is(
  (select count(*)::integer from public.list_conduct_learners('f6311000-0000-4000-8000-000000000001',current_date)),
  0,
  'another current school cannot read this school conduct roster'
);

select ok(
  has_function_privilege('authenticated','public.list_conduct_learners(uuid,date)','EXECUTE')
  and not has_function_privilege('anon','public.list_conduct_learners(uuid,date)','EXECUTE')
  and not has_function_privilege('public','public.list_conduct_learners(uuid,date)','EXECUTE'),
  'conduct roster RPC remains authenticated-only'
);

select is(
  (select count(*)::integer from public.list_conduct_learners('f6311000-0000-4000-8000-000000000001',current_date)
   where learner_id='f6315000-0000-4000-8000-000000000003'),
  0,
  'ended enrolment remains excluded'
);

select * from finish();
rollback;
