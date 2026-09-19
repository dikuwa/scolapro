begin;

select plan(12);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('f5400000-0000-4000-8000-000000000001','rc-old-manager@example.test','authenticated','authenticated',now(),now()),
  ('f5400000-0000-4000-8000-000000000002','rc-stale-manager@example.test','authenticated','authenticated',now(),now()),
  ('f5400000-0000-4000-8000-000000000003','rc-valid-manager@example.test','authenticated','authenticated',now(),now()),
  ('f5400000-0000-4000-8000-000000000004','rc-support@example.test','authenticated','authenticated',now(),now()),
  ('f5400000-0000-4000-8000-000000000005','rc-platform@example.test','authenticated','authenticated',now(),now()),
  ('f5400000-0000-4000-8000-000000000006','rc-parent@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,status) values
  ('f5410000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Report Card QA School A','active'),
  ('f5410000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Report Card QA School B','active');

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('f5420000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','f5400000-0000-4000-8000-000000000002','RC-STALE','Stale','Manager','active'),
  ('f5420000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','f5400000-0000-4000-8000-000000000003','RC-VALID','Valid','Manager','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values
  ('f5430000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','f5410000-0000-4000-8000-000000000001','f5420000-0000-4000-8000-000000000001','management',current_date-30,current_date-1,'f5400000-0000-4000-8000-000000000002'),
  ('f5430000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','f5410000-0000-4000-8000-000000000001','f5420000-0000-4000-8000-000000000002','management',current_date-30,null,'f5400000-0000-4000-8000-000000000003');

insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
  ('f5440000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','f5410000-0000-4000-8000-000000000001','f5400000-0000-4000-8000-000000000001',null,'principal',current_date-20),
  ('f5440000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','f5410000-0000-4000-8000-000000000002','f5400000-0000-4000-8000-000000000001',null,'teacher',current_date-1),
  ('f5440000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','f5410000-0000-4000-8000-000000000001','f5400000-0000-4000-8000-000000000002','f5420000-0000-4000-8000-000000000001','principal',current_date-10),
  ('f5440000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','f5410000-0000-4000-8000-000000000001','f5400000-0000-4000-8000-000000000003','f5420000-0000-4000-8000-000000000002','principal',current_date-10);

insert into public.platform_memberships(user_id,role_key,active_from) values
  ('f5400000-0000-4000-8000-000000000004','platform_support',current_date-10),
  ('f5400000-0000-4000-8000-000000000005','platform_admin',current_date-10);

insert into public.learners(id,tenant_id,first_names,surname,sex)
values('f5450000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Lifecycle','Learner','unspecified');

insert into public.enrolments(
  id,tenant_id,school_id,learner_id,academic_year,admission_number,enrolled_from,status
) values(
  'f5460000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'f5410000-0000-4000-8000-000000000001','f5450000-0000-4000-8000-000000000001',
  2026,'RC-QA-001',current_date-100,'current'
);

insert into public.guardian_profiles(id,tenant_id,first_names,surname,status)
values('f5470000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Current','Parent','active');

insert into public.learner_guardians(
  id,tenant_id,learner_id,guardian_id,relationship_type,effective_from
) values(
  'f5480000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'f5450000-0000-4000-8000-000000000001','f5470000-0000-4000-8000-000000000001','parent',current_date-30
);

insert into public.guardian_user_links(id,tenant_id,guardian_id,user_id,linked_by_user_id)
values(
  'f5490000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'f5470000-0000-4000-8000-000000000001','f5400000-0000-4000-8000-000000000006',
  'f5400000-0000-4000-8000-000000000003'
);

insert into public.report_card_snapshots(
  id,tenant_id,school_id,learner_id,enrolment_id,academic_year,term_number,
  template_version,snapshot_version,data_snapshot,status,generated_by_user_id,
  certified_by_user_id,certified_at
) values
  (
    'f54a0000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
    'f5410000-0000-4000-8000-000000000001','f5450000-0000-4000-8000-000000000001',
    'f5460000-0000-4000-8000-000000000001',2026,1,'QA_TEMPLATE_V1',1,
    '{"results":[{"official_result_id":"qa-result-1","academic_rule_set_key":"qa","academic_rule_set_version":1}],"attendance":{"present":10},"report_card_settings":{"remarks_mode":"manual"}}'::jsonb,
    'certified','f5400000-0000-4000-8000-000000000003','f5400000-0000-4000-8000-000000000003',now()
  ),
  (
    'f54a0000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
    'f5410000-0000-4000-8000-000000000001','f5450000-0000-4000-8000-000000000001',
    'f5460000-0000-4000-8000-000000000001',2026,2,'QA_TEMPLATE_V1',1,
    '{"results":[{"official_result_id":"qa-result-2","academic_rule_set_key":"qa","academic_rule_set_version":1}]}'::jsonb,
    'certified','f5400000-0000-4000-8000-000000000003','f5400000-0000-4000-8000-000000000003',now()
  );

select is(
  app_private.user_can_manage_report_cards('f5400000-0000-4000-8000-000000000001','f5410000-0000-4000-8000-000000000001'),
  false,
  'older active non-current school manager cannot manage report cards'
);
select is(
  app_private.user_can_manage_report_cards('f5400000-0000-4000-8000-000000000002','f5410000-0000-4000-8000-000000000001'),
  false,
  'ended linked staff placement removes report-card management authority'
);
select is(
  app_private.user_can_manage_report_cards('f5400000-0000-4000-8000-000000000004','f5410000-0000-4000-8000-000000000001'),
  false,
  'Platform Support has no report-card management override'
);
select is(
  app_private.user_can_manage_report_cards('f5400000-0000-4000-8000-000000000005','f5410000-0000-4000-8000-000000000001'),
  true,
  'Platform Admin retains governed report-card management authority'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f5400000-0000-4000-8000-000000000001',true);
set local role authenticated;
select throws_ok(
  $$select public.publish_report_card_snapshot('f54a0000-0000-4000-8000-000000000001')$$,
  'P0001',
  'Report-card publisher is not authorized for school',
  'non-current manager cannot publish an exact certified snapshot'
);
reset role;

select set_config('request.jwt.claim.sub','f5400000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok(
  $$select public.publish_report_card_snapshot('f54a0000-0000-4000-8000-000000000001')$$,
  'P0001',
  'Report-card publisher is not authorized for school',
  'stale linked manager cannot publish a certified snapshot'
);
reset role;

select set_config('request.jwt.claim.sub','f5400000-0000-4000-8000-000000000003',true);
set local role authenticated;
select lives_ok(
  $$select public.publish_report_card_snapshot('f54a0000-0000-4000-8000-000000000001')$$,
  'current effective manager can publish the exact certified snapshot'
);
reset role;

select is(
  (select status from public.report_card_snapshots where id='f54a0000-0000-4000-8000-000000000001'),
  'published',
  'publication advances only the targeted certified snapshot'
);
select is(
  (select status from public.report_card_snapshots where id='f54a0000-0000-4000-8000-000000000002'),
  'certified',
  'another certified snapshot remains unpublished and unchanged'
);

select set_config('request.jwt.claim.sub','f5400000-0000-4000-8000-000000000006',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.report_card_snapshots),
  1,
  'parent sees only the published snapshot, not certified-only or draft/internal versions'
);
select is(
  (select id from public.report_card_snapshots),
  'f54a0000-0000-4000-8000-000000000001'::uuid,
  'parent sees the exact published snapshot version'
);
reset role;

update public.learner_guardians
set effective_to=current_date-1
where id='f5480000-0000-4000-8000-000000000001';

set local role authenticated;
select is(
  (select count(*)::integer from public.report_card_snapshots),
  0,
  'ending the guardian relationship removes published report visibility immediately'
);
reset role;

select * from finish();
rollback;
