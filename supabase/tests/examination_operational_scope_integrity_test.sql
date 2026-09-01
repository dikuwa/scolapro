begin;

select plan(9);

insert into auth.users(id,email,created_at,updated_at)
values ('ef100000-0000-4000-8000-000000000001','exam-ops@example.test',now(),now());

insert into public.examination_cycles(id,tenant_id,school_id,academic_year,cycle_key,display_name)
values
  ('ef110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'OPS-A','Ops Cycle A'),
  ('ef110000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'OPS-B','Ops Cycle B');

insert into public.examination_candidates(id,tenant_id,school_id,examination_cycle_id,learner_id,enrolment_id,created_by_user_id)
values
  ('ef120000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ef110000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','ef100000-0000-4000-8000-000000000001'),
  ('ef120000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ef110000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002','ef100000-0000-4000-8000-000000000001');

insert into public.examination_subject_registrations(id,tenant_id,school_id,candidate_id,subject_code,subject_name)
values ('ef130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ef120000-0000-4000-8000-000000000001','OPS-SCI','Ops Science');

select throws_ok(
  $$insert into public.examination_candidate_number_history(tenant_id,school_id,examination_cycle_id,candidate_id,candidate_number,assigned_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ef110000-0000-4000-8000-000000000002','ef120000-0000-4000-8000-000000000001','OPS-001','ef100000-0000-4000-8000-000000000001')$$,
  'Candidate number history scope mismatch: candidate does not match examination cycle',
  'candidate number history cycle must match candidate cycle'
);

select lives_ok(
  $$insert into public.examination_candidate_number_history(id,tenant_id,school_id,examination_cycle_id,candidate_id,candidate_number,assigned_by_user_id)
    values('ef140000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ef110000-0000-4000-8000-000000000001','ef120000-0000-4000-8000-000000000001','OPS-001','ef100000-0000-4000-8000-000000000001')$$,
  'valid candidate number history remains allowed'
);

select throws_ok(
  $$update public.examination_candidate_number_history set examination_cycle_id='ef110000-0000-4000-8000-000000000002' where id='ef140000-0000-4000-8000-000000000001'$$,
  'Candidate number history tenant, school, cycle, and candidate are immutable',
  'candidate number history scope cannot be rewritten'
);

select throws_ok(
  $$insert into public.examination_readiness_issues(tenant_id,school_id,examination_cycle_id,candidate_id,issue_code,message)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ef110000-0000-4000-8000-000000000002','ef120000-0000-4000-8000-000000000001','CYCLE_MISMATCH','Candidate does not match cycle')$$,
  'Examination readiness issue scope mismatch: candidate does not match examination cycle',
  'readiness candidate must match examination cycle'
);

select throws_ok(
  $$insert into public.examination_readiness_issues(tenant_id,school_id,examination_cycle_id,subject_registration_id,issue_code,message)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ef110000-0000-4000-8000-000000000001','ef130000-0000-4000-8000-000000000001','SUBJECT_WITHOUT_CANDIDATE','Missing candidate')$$,
  'Examination readiness issue scope mismatch: subject registration requires candidate',
  'subject readiness issue requires candidate provenance'
);

select throws_ok(
  $$insert into public.examination_readiness_issues(tenant_id,school_id,examination_cycle_id,candidate_id,subject_registration_id,issue_code,message)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ef110000-0000-4000-8000-000000000001','ef120000-0000-4000-8000-000000000002','ef130000-0000-4000-8000-000000000001','SUBJECT_CANDIDATE_MISMATCH','Wrong candidate')$$,
  'Examination readiness issue scope mismatch: subject registration does not match candidate',
  'subject readiness issue registration must match candidate'
);

select lives_ok(
  $$insert into public.examination_readiness_issues(id,tenant_id,school_id,examination_cycle_id,candidate_id,subject_registration_id,issue_code,message)
    values('ef150000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ef110000-0000-4000-8000-000000000001','ef120000-0000-4000-8000-000000000001','ef130000-0000-4000-8000-000000000001','READY_TEST','Valid issue')$$,
  'valid examination readiness issue remains allowed'
);

select lives_ok(
  $$update public.examination_readiness_issues set resolved=true,resolved_by_user_id='ef100000-0000-4000-8000-000000000001',resolved_at=now() where id='ef150000-0000-4000-8000-000000000001'$$,
  'readiness resolution lifecycle remains mutable'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_examination_candidate_history_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_examination_candidate_history_scope_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_examination_readiness_issue_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_examination_readiness_issue_scope_integrity()','EXECUTE'),
  'examination operational integrity helpers are private from client roles'
);

select * from finish();
rollback;