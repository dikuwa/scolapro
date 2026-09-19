begin;

select plan(18);

insert into public.schools(id,tenant_id,name,emis_number,status) values
  ('52920000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Support QA Prior School','SUP-QA-OLD','active'),
  ('52920000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Support QA Current School','SUP-QA-CUR','active');

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('52900000-0000-4000-8000-000000000001','support-qa-principal@example.test','authenticated','authenticated',now(),now()),
  ('52900000-0000-4000-8000-000000000002','support-qa-counsellor@example.test','authenticated','authenticated',now(),now()),
  ('52900000-0000-4000-8000-000000000003','support-qa-teacher@example.test','authenticated','authenticated',now(),now()),
  ('52900000-0000-4000-8000-000000000004','support-qa-hod@example.test','authenticated','authenticated',now(),now()),
  ('52900000-0000-4000-8000-000000000005','support-qa-platform@example.test','authenticated','authenticated',now(),now());

insert into public.platform_memberships(user_id,role_key,active_from)
values('52900000-0000-4000-8000-000000000005','platform_support',current_date);

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('52930000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','52900000-0000-4000-8000-000000000002','SUP-QA-COUNS','Support','Counsellor','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values (
  '52931000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','52920000-0000-4000-8000-000000000001',
  '52930000-0000-4000-8000-000000000001','support',current_date-30,null,'52900000-0000-4000-8000-000000000001'
);

insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
  ('52940000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','52920000-0000-4000-8000-000000000001','52900000-0000-4000-8000-000000000001',null,'principal',current_date-30),
  ('52940000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','52920000-0000-4000-8000-000000000002','52900000-0000-4000-8000-000000000001',null,'principal',current_date-5),
  ('52940000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','52920000-0000-4000-8000-000000000001','52900000-0000-4000-8000-000000000002','52930000-0000-4000-8000-000000000001','counsellor',current_date-20),
  ('52940000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','52920000-0000-4000-8000-000000000001','52900000-0000-4000-8000-000000000003',null,'teacher',current_date-20),
  ('52940000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','52920000-0000-4000-8000-000000000001','52900000-0000-4000-8000-000000000004',null,'hod',current_date-20);

set local session_replication_role = replica;

insert into public.learners(id,tenant_id,first_names,surname)
values('52950000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Support QA','Learner');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,enrolled_to,status)
values(
  '52951000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','52920000-0000-4000-8000-000000000001',
  '52950000-0000-4000-8000-000000000001',2026,current_date-60,null,'current'
);

insert into public.learner_support_cases(
  id,tenant_id,school_id,learner_id,enrolment_id,opened_on,case_type,sensitivity,summary,status,owner_staff_member_id,opened_by_user_id,created_at
) values(
  '52960000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','52920000-0000-4000-8000-000000000001',
  '52950000-0000-4000-8000-000000000001','52951000-0000-4000-8000-000000000001',current_date-10,'wellbeing','restricted',
  'Historical restricted support fact','open','52930000-0000-4000-8000-000000000001','52900000-0000-4000-8000-000000000002','2026-09-01T08:00:00Z'
);

insert into public.learner_support_interventions(
  id,tenant_id,school_id,support_case_id,intervention_date,intervention_type,note,recorded_by_user_id,created_at
) values(
  '52961000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','52920000-0000-4000-8000-000000000001',
  '52960000-0000-4000-8000-000000000001',current_date-4,'meeting','Historical confidential intervention',
  '52900000-0000-4000-8000-000000000002','2026-09-02T09:00:00Z'
);

set local session_replication_role = origin;
select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','52900000-0000-4000-8000-000000000001',true);
select is(
  app_private.can_access_learner_support_case('52960000-0000-4000-8000-000000000001'),
  false,
  'principal cannot use an older simultaneously active school membership to read confidential support history'
);
select is(
  app_private.can_manage_learner_support('52920000-0000-4000-8000-000000000001'),
  false,
  'principal support-management authority is bound to deterministic current school'
);

select set_config('request.jwt.claim.sub','52900000-0000-4000-8000-000000000002',true);
select is(
  app_private.can_access_learner_support_case('52960000-0000-4000-8000-000000000001'),
  true,
  'current counsellor with current linked staff placement can read owned confidential support history'
);
select is(
  app_private.can_manage_learner_support('52920000-0000-4000-8000-000000000001'),
  true,
  'current counsellor with current linked staff placement retains support authority'
);

update public.staff_school_assignments
set effective_to = current_date-1
where id='52931000-0000-4000-8000-000000000001';

select is(
  app_private.can_access_learner_support_case('52960000-0000-4000-8000-000000000001'),
  false,
  'stale counsellor staff placement removes confidential support-case access even while membership remains active'
);
select is(
  app_private.can_manage_learner_support('52920000-0000-4000-8000-000000000001'),
  false,
  'stale linked staff placement removes confidential support-management authority'
);

select set_config('request.jwt.claim.sub','52900000-0000-4000-8000-000000000003',true);
select is(
  app_private.can_access_learner_support_case('52960000-0000-4000-8000-000000000001'),
  false,
  'ordinary teacher membership does not expose restricted learner-support history'
);

select set_config('request.jwt.claim.sub','52900000-0000-4000-8000-000000000004',true);
select is(
  app_private.can_access_learner_support_case('52960000-0000-4000-8000-000000000001'),
  false,
  'HOD membership does not expose restricted learner-support history'
);

select set_config('request.jwt.claim.sub','52900000-0000-4000-8000-000000000005',true);
select is(
  app_private.can_manage_learner_support('52920000-0000-4000-8000-000000000001'),
  false,
  'Platform Support does not gain learner-support authority'
);
select is(
  app_private.can_access_learner_support_case('52960000-0000-4000-8000-000000000001'),
  false,
  'Platform Support cannot read confidential learner-support history'
);

reset role;

select is(
  (select summary from public.learner_support_cases where id='52960000-0000-4000-8000-000000000001'),
  'Historical restricted support fact'::text,
  'later staff/school authority changes do not rewrite historical support-case facts'
);
select is(
  (select opened_by_user_id from public.learner_support_cases where id='52960000-0000-4000-8000-000000000001'),
  '52900000-0000-4000-8000-000000000002'::uuid,
  'support-case opener provenance survives later authority changes'
);
select is(
  (select created_at from public.learner_support_cases where id='52960000-0000-4000-8000-000000000001'),
  '2026-09-01T08:00:00Z'::timestamptz,
  'support-case creation time provenance survives later authority changes'
);
select is(
  (select note from public.learner_support_interventions where id='52961000-0000-4000-8000-000000000001'),
  'Historical confidential intervention'::text,
  'append-only support intervention history remains intact'
);
select is(
  (select recorded_by_user_id from public.learner_support_interventions where id='52961000-0000-4000-8000-000000000001'),
  '52900000-0000-4000-8000-000000000002'::uuid,
  'support intervention actor provenance remains intact'
);
select is(
  (select created_at from public.learner_support_interventions where id='52961000-0000-4000-8000-000000000001'),
  '2026-09-02T09:00:00Z'::timestamptz,
  'support intervention timestamp provenance remains intact'
);

select ok(
  not has_table_privilege('authenticated','public.learner_support_interventions','UPDATE')
  and not has_table_privilege('authenticated','public.learner_support_interventions','DELETE'),
  'confidential support interventions remain append-only for authenticated clients'
);

select ok(
  not has_function_privilege('authenticated','app_private.user_can_access_learner_support_case(uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.user_can_access_learner_support_case(uuid,uuid)','EXECUTE'),
  'arbitrary-actor confidential support helper remains private'
);

select * from finish();
rollback;
