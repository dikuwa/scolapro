begin;

select plan(9);

insert into public.tenants(id,name,slug) values
  ('fab10000-0000-4000-8000-000000000001','Enrolment Runtime Boundary','enrolment-runtime-boundary');

insert into public.schools(id,tenant_id,name) values
  ('fab20000-0000-4000-8000-000000000001','fab10000-0000-4000-8000-000000000001','Boundary School A'),
  ('fab20000-0000-4000-8000-000000000002','fab10000-0000-4000-8000-000000000001','Boundary School B');

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fab00000-0000-4000-8000-000000000001','platform-only-enrolment@example.test','authenticated','authenticated',now(),now()),
  ('fab00000-0000-4000-8000-000000000002','school-admin-enrolment@example.test','authenticated','authenticated',now(),now()),
  ('fab00000-0000-4000-8000-000000000003','other-school-admin-enrolment@example.test','authenticated','authenticated',now(),now());

insert into public.platform_memberships(user_id,role_key,active_from)
values('fab00000-0000-4000-8000-000000000001','platform_admin',current_date);

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('fab10000-0000-4000-8000-000000000001','fab20000-0000-4000-8000-000000000001','fab00000-0000-4000-8000-000000000002','school_admin',current_date),
  ('fab10000-0000-4000-8000-000000000001','fab20000-0000-4000-8000-000000000002','fab00000-0000-4000-8000-000000000003','school_admin',current_date);

insert into public.learners(id,tenant_id,first_names,surname)
values('fab30000-0000-4000-8000-000000000001','fab10000-0000-4000-8000-000000000001','Boundary','Learner');

insert into public.enrolments(
  id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status
) values(
  'fab40000-0000-4000-8000-000000000001','fab10000-0000-4000-8000-000000000001',
  'fab20000-0000-4000-8000-000000000001','fab30000-0000-4000-8000-000000000001',2026,current_date-30,'current'
);

insert into public.admission_applications(
  id,tenant_id,school_id,academic_year,applicant_first_names,applicant_surname,status
) values(
  'fab50000-0000-4000-8000-000000000001','fab10000-0000-4000-8000-000000000001',
  'fab20000-0000-4000-8000-000000000001',2026,'Prospective','Learner','received'
);

insert into public.transfer_events(
  id,tenant_id,learner_id,source_school_id,source_enrolment_id,destination_school_id,
  status,initiated_by_user_id,requested_on
) values(
  'fab60000-0000-4000-8000-000000000001','fab10000-0000-4000-8000-000000000001',
  'fab30000-0000-4000-8000-000000000001','fab20000-0000-4000-8000-000000000001',
  'fab40000-0000-4000-8000-000000000001','fab20000-0000-4000-8000-000000000002',
  'requested','fab00000-0000-4000-8000-000000000002',current_date
);

insert into public.year_end_progressions(
  id,tenant_id,school_id,learner_id,enrolment_id,academic_year,outcome,recommended_outcome,
  rule_set_key,rule_set_version,rationale,status,decided_by_user_id,decided_at
) values(
  'fab70000-0000-4000-8000-000000000001','fab10000-0000-4000-8000-000000000001',
  'fab20000-0000-4000-8000-000000000001','fab30000-0000-4000-8000-000000000001',
  'fab40000-0000-4000-8000-000000000001',2026,'promoted','promoted','boundary-rules','1',
  '{}'::jsonb,'reviewed','fab00000-0000-4000-8000-000000000002',now()
);

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','fab00000-0000-4000-8000-000000000001',true);
select is(
  app_private.can_manage_enrolment_workflow('fab20000-0000-4000-8000-000000000001'),
  false,
  'platform authority alone does not grant enrolment-workflow authority'
);
select throws_ok(
  $$select public.decide_admission_application('fab50000-0000-4000-8000-000000000001','accepted',null)$$,
  'Permission denied',
  'platform-only actor cannot decide a school admission'
);
select throws_ok(
  $$select public.approve_learner_transfer('fab60000-0000-4000-8000-000000000001',current_date,null)$$,
  'Permission denied',
  'platform-only actor cannot approve a source-school transfer'
);
select throws_ok(
  $$select public.approve_year_end_progression('fab70000-0000-4000-8000-000000000001')$$,
  'Permission denied',
  'platform-only actor cannot approve learner progression'
);

set local role authenticated;
select is(
  (select count(*)::integer from public.admission_applications where id='fab50000-0000-4000-8000-000000000001'),
  0,
  'platform-only actor cannot read school admission applications through RLS'
);
select is(
  (select count(*)::integer from public.year_end_progressions where id='fab70000-0000-4000-8000-000000000001'),
  0,
  'platform-only actor cannot read school progression decisions through RLS'
);
reset role;

select set_config('request.jwt.claim.sub','fab00000-0000-4000-8000-000000000003',true);
select is(
  app_private.can_manage_enrolment_workflow('fab20000-0000-4000-8000-000000000001'),
  false,
  'school authority does not cross into another school enrolment workflow'
);

select set_config('request.jwt.claim.sub','fab00000-0000-4000-8000-000000000002',true);
select is(
  app_private.can_manage_enrolment_workflow('fab20000-0000-4000-8000-000000000001'),
  true,
  'effective school administrator retains enrolment-workflow authority'
);
select lives_ok(
  $$select public.decide_admission_application('fab50000-0000-4000-8000-000000000001','accepted','reviewed locally')$$,
  'school-local administrator can decide an admission'
);

select * from finish();
rollback;
