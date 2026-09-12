begin;

select plan(14);

insert into public.tenants(id,name,slug) values
  ('ab100000-0000-4000-8000-000000000001','Learner Current Scope','learner-current-scope'),
  ('ab100000-0000-4000-8000-000000000002','Learner Other Tenant','learner-other-tenant');

insert into public.schools(id,tenant_id,name) values
  ('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000001','Learner Old School'),
  ('ab200000-0000-4000-8000-000000000002','ab100000-0000-4000-8000-000000000001','Learner Current School'),
  ('ab200000-0000-4000-8000-000000000003','ab100000-0000-4000-8000-000000000002','Learner Other Tenant School');

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('ab000000-0000-4000-8000-000000000001','learner-current-viewer@example.test','authenticated','authenticated',now(),now()),
  ('ab000000-0000-4000-8000-000000000002','learner-stale-staff@example.test','authenticated','authenticated',now(),now()),
  ('ab000000-0000-4000-8000-000000000003','learner-platform-support@example.test','authenticated','authenticated',now(),now()),
  ('ab000000-0000-4000-8000-000000000004','learner-platform-admin@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('ab300000-0000-4000-8000-000000000002','ab100000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000002','LRN-STALE','Stale','Learner Reader','active');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
  ('ab100000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000001',null,'school_admin',current_date-10),
  ('ab100000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000002','ab000000-0000-4000-8000-000000000001',null,'school_admin',current_date-1),
  ('ab100000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000002','ab000000-0000-4000-8000-000000000002','ab300000-0000-4000-8000-000000000002','school_admin',current_date-30);

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values (
  'ab310000-0000-4000-8000-000000000002','ab100000-0000-4000-8000-000000000001',
  'ab200000-0000-4000-8000-000000000002','ab300000-0000-4000-8000-000000000002',
  'management',current_date-30,current_date-1,'ab000000-0000-4000-8000-000000000002'
);

insert into public.platform_memberships(user_id,role_key,active_from) values
  ('ab000000-0000-4000-8000-000000000003','platform_support',current_date),
  ('ab000000-0000-4000-8000-000000000004','platform_admin',current_date);

insert into public.learners(id,tenant_id,first_names,surname) values
  ('ab400000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000001','Old School','Learner'),
  ('ab400000-0000-4000-8000-000000000002','ab100000-0000-4000-8000-000000000001','Current School','Learner'),
  ('ab400000-0000-4000-8000-000000000003','ab100000-0000-4000-8000-000000000001','Ended Enrolment','Learner'),
  ('ab400000-0000-4000-8000-000000000004','ab100000-0000-4000-8000-000000000002','Other Tenant','Learner');

insert into public.enrolments(
  id,tenant_id,school_id,learner_id,academic_year,admission_number,enrolled_from,enrolled_to,status
) values
  ('ab410000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000001','ab400000-0000-4000-8000-000000000001',2026,'OLD-001',current_date-30,null,'current'),
  ('ab410000-0000-4000-8000-000000000002','ab100000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000002','ab400000-0000-4000-8000-000000000002',2026,'CUR-001',current_date-30,null,'current'),
  ('ab410000-0000-4000-8000-000000000003','ab100000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000002','ab400000-0000-4000-8000-000000000003',2026,'END-001',current_date-30,current_date-1,'current'),
  ('ab410000-0000-4000-8000-000000000004','ab100000-0000-4000-8000-000000000002','ab200000-0000-4000-8000-000000000003','ab400000-0000-4000-8000-000000000004',2026,'OTHER-001',current_date-30,null,'current');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000001',true);

select throws_ok(
  $$select * from public.list_learner_directory_page('ab200000-0000-4000-8000-000000000001',2026,null,'current',null,null,null,false,1,50)$$,
  'Permission denied',
  'another still-active non-current school cannot enumerate learner identities'
);
select throws_ok(
  $$select * from public.search_operational_learner_directory('ab200000-0000-4000-8000-000000000001',null,30)$$,
  'Permission denied',
  'another still-active non-current school cannot use operational learner search'
);
select is(
  (select count(*) from public.list_learner_directory_page('ab200000-0000-4000-8000-000000000002',2026,null,'current',null,null,null,false,1,50)),
  1::bigint,
  'current learner directory returns only enrolments effective today'
);
select is(
  (select count(*) from public.search_operational_learner_directory('ab200000-0000-4000-8000-000000000002',null,30)),
  1::bigint,
  'operational search excludes an enrolment ended yesterday even when status remains current'
);
select is(
  app_private.can_read_learner_identity('ab200000-0000-4000-8000-000000000002','ab400000-0000-4000-8000-000000000002'),
  true,
  'current-school leadership can read a currently enrolled learner identity'
);
select is(
  app_private.can_read_learner_identity('ab200000-0000-4000-8000-000000000002','ab400000-0000-4000-8000-000000000003'),
  false,
  'ended enrolment removes current operational raw learner identity visibility'
);
select throws_ok(
  $$select * from public.list_learner_directory_page('ab200000-0000-4000-8000-000000000003',2026,null,'current',null,null,null,false,1,50)$$,
  'Permission denied',
  'cross-tenant learner directory enumeration is denied'
);

select set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$select * from public.list_learner_directory_page('ab200000-0000-4000-8000-000000000002',2026,null,'current',null,null,null,false,1,50)$$,
  'Permission denied',
  'ended staff placement cannot retain learner directory authority'
);
select throws_ok(
  $$select * from public.search_operational_learner_directory('ab200000-0000-4000-8000-000000000002',null,30)$$,
  'Permission denied',
  'ended staff placement cannot retain operational learner search authority'
);

select set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$select * from public.list_learner_directory_page('ab200000-0000-4000-8000-000000000002',2026,null,'current',null,null,null,false,1,50)$$,
  'Permission denied',
  'Platform Support cannot enumerate sensitive learner identities'
);
select is(
  app_private.can_read_learner_identity('ab200000-0000-4000-8000-000000000002','ab400000-0000-4000-8000-000000000002'),
  false,
  'Platform Support cannot read raw learner identity/profile data'
);

select set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000004',true);
select lives_ok(
  $$select * from public.list_learner_directory_page('ab200000-0000-4000-8000-000000000002',2026,null,'current',null,null,null,false,1,50)$$,
  'existing governed Platform Admin paged-directory oversight is preserved'
);
select is(
  app_private.can_read_learner_identity('ab200000-0000-4000-8000-000000000002','ab400000-0000-4000-8000-000000000002'),
  true,
  'existing governed Platform Admin raw-identity oversight is preserved'
);

reset role;
select is(
  (select count(*) from public.enrolments where id='ab410000-0000-4000-8000-000000000003'),
  1::bigint,
  'ended enrolment remains stored as historical provenance'
);

select * from finish();
rollback;
