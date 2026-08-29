begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fc000000-0000-4000-8000-000000000001','candidate-number-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc000000-0000-4000-8000-000000000001','exam_officer',current_date);

insert into public.examination_cycles(
  id,tenant_id,school_id,academic_year,cycle_key,display_name,authority,status
) values (
  'fc100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'BEHAVIOUR-TEST','Behavioral Candidate Number Test','DNEA','open'
);

insert into public.examination_candidates(
  id,tenant_id,school_id,examination_cycle_id,learner_id,enrolment_id,created_by_user_id
) values
  ('fc200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc100000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000001'),
  ('fc200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc100000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002','fc000000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok(
  $$select public.assign_examination_candidate_number('fc200000-0000-4000-8000-000000000001','  ab 123  ','  centre 7  ','dnea_official','Initial authority allocation')$$,
  'authorized exam officer can record an authority-issued candidate number'
);

select is(
  (select candidate_number from public.examination_candidates where id='fc200000-0000-4000-8000-000000000001'),
  'AB 123',
  'candidate number is normalized without inventing a replacement value'
);

select is(
  (select centre_number from public.examination_candidates where id='fc200000-0000-4000-8000-000000000001'),
  'CENTRE 7',
  'centre number is normalized and stored with the official assignment'
);

select is(
  (select count(*)::integer from public.examination_candidate_number_history where candidate_id='fc200000-0000-4000-8000-000000000001'),
  1,
  'initial candidate-number assignment creates one immutable history row'
);

select lives_ok(
  $$select public.assign_examination_candidate_number('fc200000-0000-4000-8000-000000000001','AB 124',null,'official_correction','Authority correction')$$,
  'official correction is recorded through the same governed path'
);

select is(
  (select previous_candidate_number from public.examination_candidate_number_history where candidate_id='fc200000-0000-4000-8000-000000000001' and source='official_correction' and candidate_number='AB 124' limit 1),
  'AB 123',
  'correction history preserves the previous official candidate number'
);

select is(
  (select count(*)::integer from public.examination_candidate_number_history where candidate_id='fc200000-0000-4000-8000-000000000001'),
  2,
  'correction appends history instead of rewriting the assignment trail'
);

select throws_ok(
  $$select public.assign_examination_candidate_number('fc200000-0000-4000-8000-000000000002','AB 124','CENTRE 7','dnea_official',null)$$,
  'Candidate Number is already assigned in this examination cycle',
  'duplicate candidate numbers are rejected within one examination cycle'
);

select is(
  (select count(*)::integer from public.audit_events where entity_id='fc200000-0000-4000-8000-000000000001' and event_type='examination.candidate_number.assigned'),
  2,
  'each successful candidate-number assignment is auditable'
);

select * from finish();
rollback;
