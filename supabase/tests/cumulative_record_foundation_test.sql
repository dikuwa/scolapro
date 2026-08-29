begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fd100000-0000-4000-8000-000000000001','crc-admin@example.test','authenticated','authenticated',now(),now()),
('fd100000-0000-4000-8000-000000000002','crc-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd100000-0000-4000-8000-000000000001','school_admin',current_date),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd100000-0000-4000-8000-000000000002','teacher',current_date);

select set_config('request.jwt.claim.sub','fd100000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok($$insert into public.learner_prior_school_history(tenant_id,school_id,learner_id,enrolment_id,school_name,medium_of_instruction,admission_date,admission_grade,recorded_by_user_id) values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','Previous Primary School','English','2020-01-15','Grade 4','fd100000-0000-4000-8000-000000000001')$$,'school admin can record verified prior-school CRC history');

select lives_ok($$insert into public.learner_health_history(tenant_id,school_id,learner_id,enrolment_id,observed_on,general_health,recorded_by_user_id) values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',current_date,'Good','fd100000-0000-4000-8000-000000000001')$$,'authorized support role can store physical-condition history');

select lives_ok($$insert into public.learner_psychometric_records(tenant_id,school_id,learner_id,enrolment_id,test_date,test_name,grade_label,tester_name,remarks,recorded_by_user_id) values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',current_date,'Readiness assessment','Grade 10','School counsellor','Recorded for longitudinal CRC history','fd100000-0000-4000-8000-000000000001')$$,'authorized support role can store psychometric ledger entry');

select lives_ok($$insert into public.learner_development_observations(tenant_id,school_id,learner_id,enrolment_id,academic_year,grade_label,domain,observation,recorded_by_user_id) values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',2026,'Grade 10','social','Positively integrates with peers.','fd100000-0000-4000-8000-000000000001')$$,'development observation is stored as year/grade narrative');

select lives_ok($$insert into public.learner_cumulative_notes(tenant_id,school_id,learner_id,enrolment_id,note_type,note,sensitivity,recorded_by_user_id) values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','recommendation','Continue monitoring progress.','restricted','fd100000-0000-4000-8000-000000000001')$$,'restricted recommendations can be retained in cumulative record');

select is((select count(*)::integer from public.learner_prior_school_history where learner_id='50000000-0000-4000-8000-000000000001'),1,'prior-school ledger is readable to school administration');
select is((select count(*)::integer from public.learner_psychometric_records where learner_id='50000000-0000-4000-8000-000000000001'),1,'psychometric history is readable to authorized support administration');

select set_config('request.jwt.claim.sub','fd100000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.learner_psychometric_records where learner_id='50000000-0000-4000-8000-000000000001'),0,'ordinary unassigned teacher cannot read psychometric CRC history');
select is((select count(*)::integer from public.learner_health_history where learner_id='50000000-0000-4000-8000-000000000001'),0,'ordinary unassigned teacher cannot read restricted health CRC history');

select * from finish();
rollback;
