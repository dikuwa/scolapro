begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fb000000-0000-4000-8000-000000000001','profile-teacher@example.test','authenticated','authenticated',now(),now()),
('fb000000-0000-4000-8000-000000000002','profile-admin@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values('fb100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fb000000-0000-4000-8000-000000000001','PROFILE-T1','Profile','Teacher','active');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb000000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000001','class_teacher',current_date),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb000000-0000-4000-8000-000000000002',null,'school_admin',current_date);

update public.register_classes
set register_teacher_staff_id='fb100000-0000-4000-8000-000000000001'
where id='40000000-0000-4000-8000-00000000001a';

select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok(
  $$select public.submit_profile_change_request('50000000-0000-4000-8000-000000000001','learner','50000000-0000-4000-8000-000000000001','surname','Corrected','Verified against learner file')$$,
  'assigned class teacher can propose a learner correction'
);

select is(
  (select surname from public.learners where id='50000000-0000-4000-8000-000000000001'),
  'Demo',
  'proposal does not rewrite authoritative learner data before review'
);

select is(
  (select status from public.profile_change_requests where learner_id='50000000-0000-4000-8000-000000000001' and proposed_value='Corrected'),
  'pending',
  'submitted correction enters the review queue'
);

select ok(
  not has_table_privilege('authenticated','public.learners','UPDATE'),
  'authenticated clients cannot bypass reviewed correction with direct learner UPDATE'
);

select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000002',true);

select lives_ok(
  $$select public.review_profile_change_request((select id from public.profile_change_requests where learner_id='50000000-0000-4000-8000-000000000001' and proposed_value='Corrected'),'approved','Checked against source documents')$$,
  'school admin can approve and apply a pending correction'
);

select is(
  (select surname from public.learners where id='50000000-0000-4000-8000-000000000001'),
  'Corrected',
  'approved correction updates the authoritative learner record'
);

select throws_ok(
  $$select public.review_profile_change_request((select id from public.profile_change_requests where learner_id='50000000-0000-4000-8000-000000000001' and proposed_value='Corrected'),'approved','again')$$,
  'Only pending change requests can be reviewed',
  'a reviewed correction cannot be approved twice'
);

select is(
  (select count(*)::integer from public.audit_events where event_type='profile_change.approved' and metadata->>'field_key'='surname' and metadata->>'learner_id'='50000000-0000-4000-8000-000000000001'),
  1,
  'approved profile correction is auditable'
);

select * from finish();
rollback;