begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('f7000000-0000-4000-8000-000000000001','admission-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f7000000-0000-4000-8000-000000000001','school_admin',current_date);

insert into public.admission_applications(
  id,tenant_id,school_id,academic_year,requested_grade_id,applicant_first_names,
  applicant_surname,date_of_birth,guardian_name,guardian_contact,source,status
) values
  ('f7100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'30000000-0000-4000-8000-000000000010','New Learner','Admission Test','2012-02-03','Test Guardian','0810000000','school','accepted'),
  ('f7100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'30000000-0000-4000-8000-000000000010','Phantom','Admission','2012-04-05','Another Guardian','0810000001','school','accepted');

select set_config('request.jwt.claim.sub','f7000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select throws_ok(
  $$update public.admission_applications set status='enrolled' where id='f7100000-0000-4000-8000-000000000002'$$,
  'Enrolled admission must link the created learner and enrolment',
  'application cannot claim enrolled status without a real learner/enrolment link'
);

select lives_ok(
  $$select public.enrol_accepted_admission('f7100000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','ADM-INT-001',null,'female',current_date)$$,
  'school admin can atomically enrol an accepted application'
);

select is(
  (select status from public.admission_applications where id='f7100000-0000-4000-8000-000000000001'),
  'enrolled',
  'completed admission records enrolled status'
);

select ok(
  (select learner_id is not null and enrolment_id is not null and enrolled_at is not null from public.admission_applications where id='f7100000-0000-4000-8000-000000000001'),
  'enrolled application retains learner, enrolment and completion provenance'
);

select is(
  (select e.status from public.enrolments e join public.admission_applications a on a.enrolment_id=e.id where a.id='f7100000-0000-4000-8000-000000000001'),
  'current',
  'admission completion creates a real current enrolment'
);

select is(
  (select trim(l.first_names||' '||l.surname) from public.learners l join public.admission_applications a on a.learner_id=l.id where a.id='f7100000-0000-4000-8000-000000000001'),
  'New Learner Admission Test',
  'created learner identity preserves accepted application name'
);

select is(
  (select count(*)::integer from public.audit_events where entity_id='f7100000-0000-4000-8000-000000000001' and event_type='admission.enrolled'),
  1,
  'admission-to-enrolment handoff is auditable'
);

select * from finish();
rollback;