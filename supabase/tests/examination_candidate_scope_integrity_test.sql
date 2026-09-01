begin;

select plan(7);

insert into auth.users(id,email,created_at,updated_at)
values ('fe100000-0000-4000-8000-000000000001','exam-candidate@example.test',now(),now());

insert into public.examination_cycles(id,tenant_id,school_id,academic_year,cycle_key,display_name)
values ('fe110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'NSSCO-2026','NSSCO 2026');

insert into public.tenants(id,name,slug)
values ('fe120000-0000-4000-8000-000000000001','Exam Candidate Tenant B','exam-candidate-tenant-b');

insert into public.learners(id,tenant_id,first_names,surname)
values ('fe130000-0000-4000-8000-000000000001','fe120000-0000-4000-8000-000000000001','Cross','Tenant');

select throws_ok(
  $$insert into public.examination_candidates(tenant_id,school_id,examination_cycle_id,learner_id,enrolment_id,created_by_user_id)
    values('fe120000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','fe110000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','fe100000-0000-4000-8000-000000000001')$$,
  'Examination candidate scope mismatch: school does not belong to tenant',
  'candidate tenant must match school tenant'
);

select throws_ok(
  $$insert into public.examination_candidates(tenant_id,school_id,examination_cycle_id,learner_id,enrolment_id,created_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe110000-0000-4000-8000-000000000001','fe130000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','fe100000-0000-4000-8000-000000000001')$$,
  'Examination candidate scope mismatch: learner does not belong to tenant',
  'candidate learner must belong to candidate tenant'
);

select throws_ok(
  $$insert into public.examination_candidates(tenant_id,school_id,examination_cycle_id,learner_id,enrolment_id,created_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe110000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002','fe100000-0000-4000-8000-000000000001')$$,
  'Examination candidate scope mismatch: enrolment does not match candidate and examination year',
  'candidate enrolment must belong to the candidate learner and examination year'
);

select lives_ok(
  $$insert into public.examination_candidates(id,tenant_id,school_id,examination_cycle_id,learner_id,enrolment_id,created_by_user_id)
    values('fe140000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe110000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','fe100000-0000-4000-8000-000000000001')$$,
  'valid examination candidate remains allowed'
);

select lives_ok(
  $$update public.examination_candidates set registration_status='ready', identity_verified=true where id='fe140000-0000-4000-8000-000000000001'$$,
  'candidate workflow fields remain mutable'
);

select throws_ok(
  $$update public.examination_candidates set enrolment_id='60000000-0000-4000-8000-000000000002' where id='fe140000-0000-4000-8000-000000000001'$$,
  'Examination candidate tenant, school, cycle, learner, and enrolment are immutable',
  'candidate identity scope cannot be moved after creation'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_examination_candidate_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_examination_candidate_scope_integrity()','EXECUTE'),
  'examination candidate integrity helper is private from client roles'
);

select * from finish();
rollback;