begin;

select plan(14);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fb900000-0000-4000-8000-000000000001','readiness-admin@example.test','authenticated','authenticated',now(),now()),
  ('fb900000-0000-4000-8000-000000000002','readiness-hod@example.test','authenticated','authenticated',now(),now()),
  ('fb900000-0000-4000-8000-000000000003','readiness-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb900000-0000-4000-8000-000000000001','school_admin',current_date-5),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb900000-0000-4000-8000-000000000002','hod',current_date-5),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb900000-0000-4000-8000-000000000003','teacher',current_date-5);

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status) values
  ('fb910000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','READY-A','Readiness A','active'),
  ('fb910000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','READY-B','Readiness B','active');
insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status) values
  ('fb920000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fb910000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',5,'active'),
  ('fb920000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fb910000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000010',5,'active');

insert into public.learner_subject_registrations(
  id,tenant_id,school_id,academic_year,enrolment_id,learner_id,subject_offering_id,status,source,registered_by_user_id,registered_at
) values
  ('fb930000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','fb920000-0000-4000-8000-000000000001','active','qa','fb900000-0000-4000-8000-000000000001',now()),
  ('fb930000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','fb920000-0000-4000-8000-000000000002','active','qa','fb900000-0000-4000-8000-000000000001',now());

insert into public.official_results(
  id,tenant_id,school_id,academic_year,enrolment_id,learner_id,subject_offering_id,term_number,result_value,symbol,assessment_scheme_key,assessment_scheme_version,calculation_snapshot,approved_by_user_id
) values
  ('fb940000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','fb920000-0000-4000-8000-000000000001',1,76,'B','READY','1','{}','fb900000-0000-4000-8000-000000000001'),
  ('fb940000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'60000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','fb920000-0000-4000-8000-000000000001',1,68,'C','READY','1','{}','fb900000-0000-4000-8000-000000000001');

select ok(has_function_privilege('authenticated','public.list_learner_subject_result_readiness_page(uuid,integer,integer,text,uuid,uuid,text,integer,integer)','EXECUTE'),'authenticated role can reach the self-authorizing paged readiness RPC');
select ok(has_function_privilege('authenticated','public.get_subject_result_readiness_summary(uuid,integer,integer,uuid,uuid)','EXECUTE'),'authenticated role can reach the self-authorizing readiness summary RPC');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fb900000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok(
  $$select * from public.list_learner_subject_result_readiness_page('22222222-2222-4222-8222-222222222222',2026,1)$$,
  'P0001','Permission denied','ordinary teacher cannot enumerate the academic-leadership readiness workspace'
);
reset role;

select set_config('request.jwt.claim.sub','fb900000-0000-4000-8000-000000000002',true);
set local role authenticated;
select lives_ok($$select * from public.list_learner_subject_result_readiness_page('22222222-2222-4222-8222-222222222222',2026,1)$$,'HOD can open the readiness workspace');
reset role;

select set_config('request.jwt.claim.sub','fb900000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  (select reconciliation_status from public.list_learner_subject_result_readiness_page('22222222-2222-4222-8222-222222222222',2026,1,null,null,null,'missing_registered_results',1,100) where enrolment_id='60000000-0000-4000-8000-000000000001'),
  'missing_registered_results','registered subject without an official result is filterable as missing'
);
select is(
  (select reconciliation_status from public.list_learner_subject_result_readiness_page('22222222-2222-4222-8222-222222222222',2026,1,null,null,null,'legacy_results_without_registrations',1,100) where enrolment_id='60000000-0000-4000-8000-000000000002'),
  'legacy_results_without_registrations','legacy official result without a subject registration is filterable explicitly'
);
select is(
  (select registered_subject_count from public.list_learner_subject_result_readiness_page('22222222-2222-4222-8222-222222222222',2026,1,null,null,null,'missing_registered_results',1,100) where enrolment_id='60000000-0000-4000-8000-000000000001'),
  2,'paged readiness exposes registered subject count'
);
select is(
  (select missing_registered_result_count from public.list_learner_subject_result_readiness_page('22222222-2222-4222-8222-222222222222',2026,1,null,null,null,'missing_registered_results',1,100) where enrolment_id='60000000-0000-4000-8000-000000000001'),
  1,'paged readiness exposes missing registered-result count'
);
select is(
  (select count(*)::integer from public.list_learner_subject_result_readiness_page('22222222-2222-4222-8222-222222222222',2026,1,null,null,null,'all',1,1)),
  1,'page size is honored'
);
select ok(
  (select total_count>1 from public.list_learner_subject_result_readiness_page('22222222-2222-4222-8222-222222222222',2026,1,null,null,null,'all',1,1)),
  'paged row carries total matching count independent of page size'
);
select ok(
  (select count(*)<=100 from public.list_learner_subject_result_readiness_page('22222222-2222-4222-8222-222222222222',2026,1,null,null,null,'all',1,500)),
  'page size is capped at 100'
);
select is(
  (select missing_registered_results_count from public.get_subject_result_readiness_summary('22222222-2222-4222-8222-222222222222',2026,1,null,null)),
  1::bigint,'summary counts the deliberate missing-result learner'
);
select is(
  (select legacy_results_without_registrations_count from public.get_subject_result_readiness_summary('22222222-2222-4222-8222-222222222222',2026,1,null,null)),
  1::bigint,'summary counts the deliberate legacy-result learner'
);
select throws_ok(
  $$select * from public.list_learner_subject_result_readiness_page('22222222-2222-4222-8222-222222222222',2026,1,null,null,null,'bogus',1,50)$$,
  'P0001','Unsupported subject-result readiness status filter','unsupported readiness status fails closed'
);
select is(
  (select count(*)::integer from public.list_learner_subject_result_readiness_page('22222222-2222-4222-8222-222222222222',2026,1,'60000000-0000-4000-8000-000000000001',null,null,'all',1,50)),
  0,'search does not accidentally match hidden UUID identifiers'
);

reset role;
select * from finish();
rollback;
