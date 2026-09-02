begin;

select plan(20);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fa8c0000-0000-4000-8000-000000000001','result-readiness-admin@example.test','authenticated','authenticated',now(),now()),
  ('fa8c0000-0000-4000-8000-000000000002','result-readiness-teacher@example.test','authenticated','authenticated',now(),now());
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa8c0000-0000-4000-8000-000000000001','school_admin','2026-01-01'),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa8c0000-0000-4000-8000-000000000002','teacher','2026-01-01');

insert into public.academic_years(id,tenant_id,school_id,year,status,starts_on,ends_on) values
  ('fa8c1000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'active','2026-01-01','2026-12-15');
insert into public.academic_terms(id,tenant_id,school_id,academic_year_id,term_number,display_name,starts_on,ends_on,status) values
  ('fa8c1000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa8c1000-0000-4000-8000-000000000001',1,'Term 1','2026-01-12','2026-04-30','closed');

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status) values
  ('fa8c2000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','READY-RES-A','Registered Result A','active'),
  ('fa8c2000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','READY-RES-B','Registered Missing B','active'),
  ('fa8c2000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','READY-RES-C','Legacy Result C','active');
insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status) values
  ('fa8c3000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fa8c2000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',5,'active'),
  ('fa8c3000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fa8c2000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000010',5,'active'),
  ('fa8c3000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fa8c2000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000010',5,'active');

insert into public.learner_subject_registrations(
  id,tenant_id,school_id,academic_year,enrolment_id,learner_id,subject_offering_id,status,source,registered_by_user_id,registered_at,created_at,updated_at
) values
  ('fa8c4000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','fa8c3000-0000-4000-8000-000000000001','active','qa','fa8c0000-0000-4000-8000-000000000001','2026-02-01','2026-02-01','2026-02-01'),
  ('fa8c4000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','fa8c3000-0000-4000-8000-000000000002','active','qa','fa8c0000-0000-4000-8000-000000000001','2026-02-01','2026-02-01','2026-02-01');
insert into public.audit_events(id,tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata,occurred_at) values
  ('fa8c5000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa8c0000-0000-4000-8000-000000000001','learner_subject_registration.registered','learner_subject_registration','fa8c4000-0000-4000-8000-000000000001','{}'::jsonb,'2026-02-01'),
  ('fa8c5000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa8c0000-0000-4000-8000-000000000001','learner_subject_registration.registered','learner_subject_registration','fa8c4000-0000-4000-8000-000000000002','{}'::jsonb,'2026-02-01');

insert into public.official_results(
  id,tenant_id,school_id,academic_year,enrolment_id,learner_id,subject_offering_id,term_number,
  result_value,result_status,symbol,assessment_scheme_key,assessment_scheme_version,calculation_snapshot,
  approved_by_user_id,approved_at,locked_at
) values
  ('fa8c6000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','fa8c3000-0000-4000-8000-000000000001',1,75,null,'B','qa','v1','{}'::jsonb,'fa8c0000-0000-4000-8000-000000000001','2026-05-02','2026-05-02'),
  ('fa8c6000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','fa8c3000-0000-4000-8000-000000000003',1,68,null,'C','qa','v1','{}'::jsonb,'fa8c0000-0000-4000-8000-000000000001','2026-05-02','2026-05-02');

select ok(to_regprocedure('app_private.build_learner_subject_result_readiness(uuid,smallint)') is not null,'private subject-result readiness helper exists');
select ok(not has_function_privilege('authenticated','app_private.build_learner_subject_result_readiness(uuid,smallint)','EXECUTE'),'private readiness builder cannot be invoked directly by authenticated clients');
select ok(not has_function_privilege('anon','public.get_learner_subject_result_readiness(uuid,integer)','EXECUTE'),'anonymous users cannot read learner subject-result readiness');
select ok(has_function_privilege('authenticated','public.get_learner_subject_result_readiness(uuid,integer)','EXECUTE'),'authenticated users can call the self-authorizing readiness RPC');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa8c0000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok(
  $$select public.get_learner_subject_result_readiness('60000000-0000-4000-8000-000000000001',1)$$,
  'Permission denied',
  'ordinary teacher cannot read cross-subject learner reconciliation without academic-leadership scope'
);
reset role;

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa8c0000-0000-4000-8000-000000000001',true);
set local role authenticated;

create temporary table initial_readiness on commit drop as
select public.get_learner_subject_result_readiness('60000000-0000-4000-8000-000000000001',1) data;

select is((select data->>'term_name' from initial_readiness),'Term 1','readiness resolves the configured academic term');
select is((select data->>'reference_date' from initial_readiness),'2026-04-30','historical term readiness uses the configured term end as reference date');
select is((select (data->>'registered_subject_count')::integer from initial_readiness),2,'two subjects were registered at the term reference date');
select is((select (data->>'official_result_count')::integer from initial_readiness),2,'two official-result rows exist for the term');
select is((select (data->>'matched_result_count')::integer from initial_readiness),1,'one official result matches a registered subject');
select is((select (data->>'missing_registered_result_count')::integer from initial_readiness),1,'one registered subject is missing an official result');
select is((select (data->>'unregistered_result_count')::integer from initial_readiness),1,'one legacy official result has no registration at the term reference date');
select is((select data->>'reconciliation_status' from initial_readiness),'mixed_mismatch','simultaneous missing and legacy results are classified as a mixed mismatch');
select is((select (data->>'blocking')::boolean from initial_readiness),false,'readiness remains explicitly non-blocking');
select is(
  (select item->>'subject_code' from initial_readiness cross join lateral jsonb_array_elements(data->'missing_registered_results') item limit 1),
  'READY-RES-B',
  'missing-results detail identifies the registered subject needing a result'
);
select is(
  (select item->>'subject_code' from initial_readiness cross join lateral jsonb_array_elements(data->'unregistered_results') item limit 1),
  'READY-RES-C',
  'legacy-results detail identifies the unregistered result subject'
);
select throws_ok(
  $$select public.get_learner_subject_result_readiness('60000000-0000-4000-8000-000000000001',0)$$,
  'Term number is invalid',
  'invalid term numbers are rejected'
);

insert into public.official_results(
  id,tenant_id,school_id,academic_year,enrolment_id,learner_id,subject_offering_id,term_number,
  result_value,result_status,symbol,assessment_scheme_key,assessment_scheme_version,calculation_snapshot,
  approved_by_user_id,approved_at,locked_at
) values(
  'fa8c6000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','fa8c3000-0000-4000-8000-000000000002',1,null,'withheld',null,'qa','v1','{}'::jsonb,'fa8c0000-0000-4000-8000-000000000001','2026-05-02','2026-05-02');

create temporary table after_missing_fixed on commit drop as
select public.get_learner_subject_result_readiness('60000000-0000-4000-8000-000000000001',1) data;
select is((select (data->>'missing_registered_result_count')::integer from after_missing_fixed),0,'adding the missing registered result clears missing-result count');
select is((select (data->>'attention_result_count')::integer from after_missing_fixed),1,'withheld result is surfaced separately as a status needing attention');
select is((select data->>'reconciliation_status' from after_missing_fixed),'unregistered_results_present','legacy unregistered result remains the higher structural mismatch after missing result is supplied');

reset role;
select * from finish();
rollback;
