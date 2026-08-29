begin;

select plan(6);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('f7000000-0000-4000-8000-000000000001','readiness-exam@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f7000000-0000-4000-8000-000000000001','exam_officer',current_date);

insert into public.examination_cycles(
  id,tenant_id,school_id,academic_year,cycle_key,display_name,status
) values(
  'f7100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'READINESS-TEST','Readiness test cycle','open'
);

insert into public.examination_candidates(
  id,tenant_id,school_id,examination_cycle_id,learner_id,enrolment_id,
  registration_status,identity_verified,created_by_user_id
) values(
  'f7200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f7100000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','ready',true,'f7000000-0000-4000-8000-000000000001'
),(
  'f7200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f7100000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002','withdrawn',true,'f7000000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.sub','f7000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok(
  $$select public.refresh_examination_readiness('f7100000-0000-4000-8000-000000000001')$$,
  'exam officer can rebuild readiness before Candidate Number assignment'
);

select is(
  (select count(*)::integer from public.examination_readiness_issues where candidate_id='f7200000-0000-4000-8000-000000000001' and issue_code='candidate_number_missing' and resolved=false),
  1,
  'active candidate without authority-issued Candidate Number is blocking readiness'
);

select is(
  (select count(*)::integer from public.examination_readiness_issues where candidate_id='f7200000-0000-4000-8000-000000000002' and issue_code='candidate_number_missing' and resolved=false),
  0,
  'withdrawn candidate does not create Candidate Number readiness work'
);

select lives_ok(
  $$select public.assign_examination_candidate_number('f7200000-0000-4000-8000-000000000001',' DNEA 0099 ','CENTRE 01','dnea_official','Issued for readiness test')$$,
  'official Candidate Number can be assigned through governed RPC'
);

select lives_ok(
  $$select public.refresh_examination_readiness('f7100000-0000-4000-8000-000000000001')$$,
  'readiness can be rebuilt after Candidate Number assignment'
);

select is(
  (select count(*)::integer from public.examination_readiness_issues where candidate_id='f7200000-0000-4000-8000-000000000001' and issue_code='candidate_number_missing' and resolved=false),
  0,
  'Candidate Number blocking issue disappears after governed authority assignment'
);

select * from finish();
rollback;