begin;

select plan(8);

insert into public.tenants(id,name,slug)
values ('f6250000-0000-4000-8000-000000000001','Enrolment RLS Perf','enrolment-rls-perf');

insert into public.schools(id,tenant_id,name)
values
  ('f6251000-0000-4000-8000-000000000001','f6250000-0000-4000-8000-000000000001','Perf Current School'),
  ('f6251000-0000-4000-8000-000000000002','f6250000-0000-4000-8000-000000000001','Perf Other School');

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('f6252000-0000-4000-8000-000000000001','perf-admin@example.test','authenticated','authenticated',now(),now()),
  ('f6252000-0000-4000-8000-000000000002','perf-class-teacher@example.test','authenticated','authenticated',now(),now()),
  ('f6252000-0000-4000-8000-000000000003','perf-librarian@example.test','authenticated','authenticated',now(),now()),
  ('f6252000-0000-4000-8000-000000000004','perf-support@example.test','authenticated','authenticated',now(),now()),
  ('f6252000-0000-4000-8000-000000000005','perf-platform-admin@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values
  ('f6253000-0000-4000-8000-000000000002','f6250000-0000-4000-8000-000000000001','f6252000-0000-4000-8000-000000000002','PERF-T1','Perf','Teacher','active');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
  ('f6250000-0000-4000-8000-000000000001','f6251000-0000-4000-8000-000000000001','f6252000-0000-4000-8000-000000000001',null,'school_admin',current_date-5),
  ('f6250000-0000-4000-8000-000000000001','f6251000-0000-4000-8000-000000000001','f6252000-0000-4000-8000-000000000002','f6253000-0000-4000-8000-000000000002','class_teacher',current_date-5),
  ('f6250000-0000-4000-8000-000000000001','f6251000-0000-4000-8000-000000000001','f6252000-0000-4000-8000-000000000003',null,'librarian',current_date-5);

insert into public.platform_memberships(user_id,role_key,active_from) values
  ('f6252000-0000-4000-8000-000000000004','platform_support',current_date-5),
  ('f6252000-0000-4000-8000-000000000005','platform_admin',current_date-5);

insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name)
values ('f6254000-0000-4000-8000-000000000001','f6250000-0000-4000-8000-000000000001','f6251000-0000-4000-8000-000000000001',2026,'8','Grade 8');

insert into public.register_classes(id,tenant_id,school_id,grade_id,academic_year,class_code,display_name,register_teacher_staff_id)
values (
  'f6255000-0000-4000-8000-000000000001',
  'f6250000-0000-4000-8000-000000000001',
  'f6251000-0000-4000-8000-000000000001',
  'f6254000-0000-4000-8000-000000000001',
  2026,'8A','Grade 8A','f6253000-0000-4000-8000-000000000002'
);

insert into public.learners(id,tenant_id,first_names,surname) values
  ('f6256000-0000-4000-8000-000000000001','f6250000-0000-4000-8000-000000000001','Current','Learner'),
  ('f6256000-0000-4000-8000-000000000002','f6250000-0000-4000-8000-000000000001','Ended','Learner');

insert into public.enrolments(
  id,tenant_id,school_id,learner_id,academic_year,grade_id,register_class_id,admission_number,enrolled_from,enrolled_to,status
) values
  ('f6257000-0000-4000-8000-000000000001','f6250000-0000-4000-8000-000000000001','f6251000-0000-4000-8000-000000000001','f6256000-0000-4000-8000-000000000001',2026,'f6254000-0000-4000-8000-000000000001','f6255000-0000-4000-8000-000000000001','PERF-CUR',current_date-30,null,'current'),
  ('f6257000-0000-4000-8000-000000000002','f6250000-0000-4000-8000-000000000001','f6251000-0000-4000-8000-000000000001','f6256000-0000-4000-8000-000000000002',2026,'f6254000-0000-4000-8000-000000000001',null,'PERF-END',current_date-30,current_date-1,'current');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','f6252000-0000-4000-8000-000000000001',true);
select is(
  (select count(*)::integer from public.enrolments where school_id='f6251000-0000-4000-8000-000000000001'),
  1,
  'current-school admin sees only the current effective enrolment'
);

select set_config('request.jwt.claim.sub','f6252000-0000-4000-8000-000000000002',true);
select is(
  (select count(*)::integer from public.enrolments where learner_id='f6256000-0000-4000-8000-000000000001'),
  1,
  'class teacher keeps scoped access to the assigned current learner'
);
select is(
  (select count(*)::integer from public.enrolments where learner_id='f6256000-0000-4000-8000-000000000002'),
  0,
  'class teacher cannot read an ended enrolment'
);

select set_config('request.jwt.claim.sub','f6252000-0000-4000-8000-000000000003',true);
select is(
  (select count(*)::integer from public.enrolments where school_id='f6251000-0000-4000-8000-000000000001'),
  0,
  'librarian does not gain raw enrolment access'
);

select set_config('request.jwt.claim.sub','f6252000-0000-4000-8000-000000000004',true);
select is(
  (select count(*)::integer from public.enrolments where school_id='f6251000-0000-4000-8000-000000000001'),
  0,
  'Platform Support remains denied raw enrolment access'
);

select set_config('request.jwt.claim.sub','f6252000-0000-4000-8000-000000000005',true);
select is(
  (select count(*)::integer from public.enrolments where school_id='f6251000-0000-4000-8000-000000000001'),
  2,
  'governed Platform Admin retains historical and current enrolment oversight'
);

select set_config('request.jwt.claim.sub','f6252000-0000-4000-8000-000000000001',true);
select is(
  app_private.can_read_enrolment_row(
    'f6251000-0000-4000-8000-000000000002',
    'f6256000-0000-4000-8000-000000000001',
    'current',
    current_date-1,
    null
  ),
  false,
  'non-current school is denied deterministically'
);

select ok(
  has_function_privilege('authenticated','app_private.can_read_enrolment_row(uuid,uuid,text,date,date)','EXECUTE')
  and not has_function_privilege('anon','app_private.can_read_enrolment_row(uuid,uuid,text,date,date)','EXECUTE')
  and not has_function_privilege('public','app_private.can_read_enrolment_row(uuid,uuid,text,date,date)','EXECUTE'),
  'row-aware helper is executable only by authenticated users for RLS evaluation'
);

reset role;
select * from finish();
rollback;
