begin;

select plan(7);

select ok(
  to_regprocedure('public.list_learning_resource_learner_borrowers(uuid)') is not null,
  'governed learner borrower read-model RPC exists'
);
select ok(
  not has_function_privilege('anon','public.list_learning_resource_learner_borrowers(uuid)','EXECUTE'),
  'anonymous users cannot list learner borrowers'
);
select ok(
  has_function_privilege('authenticated','public.list_learning_resource_learner_borrowers(uuid)','EXECUTE'),
  'authenticated users can invoke the governed learner borrower RPC'
);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fc000000-0000-4000-8000-000000000001','library-borrower-current@example.test','authenticated','authenticated',now(),now()),
('fc000000-0000-4000-8000-000000000002','library-borrower-platform@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,region,town,status)
values('fc100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Library Borrower Current School','LIB-BORROWER-CURRENT','Erongo','Swakopmund','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc000000-0000-4000-8000-000000000001','librarian','2026-01-01'),
('11111111-1111-4111-8111-111111111111','fc100000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000001','librarian','2026-02-01');

insert into public.platform_memberships(user_id,role_key,active_from)
values('fc000000-0000-4000-8000-000000000002','platform_support',current_date);

insert into public.learners(id,tenant_id,first_names,surname) values
('fc200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Current','Library Borrower'),
('fc200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Ended','Library Borrower'),
('fc200000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','Other School','Library Borrower');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,admission_number,enrolled_from,enrolled_to,status) values
('fc300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fc100000-0000-4000-8000-000000000001','fc200000-0000-4000-8000-000000000001',2026,'LIB-CUR-001','2026-01-15',null,'current'),
('fc300000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fc100000-0000-4000-8000-000000000001','fc200000-0000-4000-8000-000000000002',2026,'LIB-END-001','2026-01-15','2026-06-30','withdrawn'),
('fc300000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc200000-0000-4000-8000-000000000003',2026,'LIB-OTHER-001','2026-01-15',null,'current');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);

select is(
  (select count(*)::integer from public.list_learning_resource_learner_borrowers('fc100000-0000-4000-8000-000000000001')),
  1,
  'current-school learner borrower read model excludes ended enrolment'
);
select is(
  (select learner_id from public.list_learning_resource_learner_borrowers('fc100000-0000-4000-8000-000000000001') limit 1),
  'fc200000-0000-4000-8000-000000000001'::uuid,
  'current-school learner borrower read model returns the effective current learner'
);
select throws_ok(
  $$select * from public.list_learning_resource_learner_borrowers('22222222-2222-4222-8222-222222222222')$$,
  'Permission denied',
  'another active non-current school cannot expose learner borrower operational data'
);

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$select * from public.list_learning_resource_learner_borrowers('fc100000-0000-4000-8000-000000000001')$$,
  'Permission denied',
  'Platform Support cannot access school learner borrower operational data'
);

select * from finish();
rollback;
