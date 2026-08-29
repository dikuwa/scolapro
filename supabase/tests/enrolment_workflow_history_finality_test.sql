begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fb000000-0000-4000-8000-000000000001','history-finality-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb000000-0000-4000-8000-000000000001','school_admin',current_date);

-- An enrolled admission is a historical receipt pointing at the learner/enrolment
-- that was actually created. Later corrections belong on the learner workflow, not
-- by rewriting this receipt.
insert into public.admission_applications(
  id,tenant_id,school_id,academic_year,requested_grade_id,
  applicant_first_names,applicant_surname,date_of_birth,status,
  reviewed_by_user_id,reviewed_at,learner_id,enrolment_id,enrolled_at
) values (
  'fb100000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2026,
  '30000000-0000-4000-8000-000000000010',
  'Historical','Learner','2010-01-01','enrolled',
  'fb000000-0000-4000-8000-000000000001',now(),
  '50000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',now()
);

select throws_ok(
  $$update public.admission_applications set applicant_surname='Rewritten' where id='fb100000-0000-4000-8000-000000000001'$$,
  'Enrolled admission applications are immutable historical records',
  'enrolled admission history cannot be rewritten by privileged direct DML'
);

select throws_ok(
  $$delete from public.admission_applications where id='fb100000-0000-4000-8000-000000000001'$$,
  'Enrolled admission applications are immutable historical records',
  'enrolled admission history cannot be deleted'
);

insert into public.transfer_events(
  id,tenant_id,learner_id,source_school_id,source_enrolment_id,destination_name,
  requested_on,effective_on,reason,status,initiated_by_user_id
) values
  ('fb200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','60000000-0000-4000-8000-000000000001','Receiving School',current_date,current_date+1,'Relocation','requested','fb000000-0000-4000-8000-000000000001'),
  ('fb200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','60000000-0000-4000-8000-000000000002','Other School',current_date,current_date+2,'Guardian request','requested','fb000000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok(
  $$select public.approve_learner_transfer('fb200000-0000-4000-8000-000000000001',current_date+1,'Verified')$$,
  'requested transfer can still transition to approved'
);
select lives_ok(
  $$select public.complete_learner_transfer('fb200000-0000-4000-8000-000000000001')$$,
  'approved transfer can still transition to completed'
);

select throws_ok(
  $$update public.transfer_events set decision_note='Rewritten after completion' where id='fb200000-0000-4000-8000-000000000001'$$,
  'Completed or cancelled transfer records are immutable',
  'completed transfer history cannot be rewritten'
);
select throws_ok(
  $$delete from public.transfer_events where id='fb200000-0000-4000-8000-000000000001'$$,
  'Completed or cancelled transfer records are immutable',
  'completed transfer history cannot be deleted'
);

select lives_ok(
  $$select public.cancel_learner_transfer('fb200000-0000-4000-8000-000000000002','No longer moving')$$,
  'requested transfer can still transition to cancelled'
);
select throws_ok(
  $$update public.transfer_events set reason='Rewritten after cancellation' where id='fb200000-0000-4000-8000-000000000002'$$,
  'Completed or cancelled transfer records are immutable',
  'cancelled transfer history cannot be rewritten'
);

select * from finish();
rollback;