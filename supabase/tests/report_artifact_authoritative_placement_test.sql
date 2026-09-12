begin;

select plan(12);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('ad000000-0000-4000-8000-000000000001','report-multischool@example.test','authenticated','authenticated',now(),now()),
  ('ad000000-0000-4000-8000-000000000002','report-stale@example.test','authenticated','authenticated',now(),now()),
  ('ad000000-0000-4000-8000-000000000003','report-current@example.test','authenticated','authenticated',now(),now()),
  ('ad000000-0000-4000-8000-000000000004','report-support@example.test','authenticated','authenticated',now(),now()),
  ('ad000000-0000-4000-8000-000000000005','report-platform@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug,status)
values ('ad100000-0000-4000-8000-000000000001','Report Artifact QA','report-artifact-qa','active');

insert into public.schools(id,tenant_id,name,emis_number,status) values
  ('ad110000-0000-4000-8000-000000000001','ad100000-0000-4000-8000-000000000001','Report Old School','RPT-ART-OLD','active'),
  ('ad110000-0000-4000-8000-000000000002','ad100000-0000-4000-8000-000000000001','Report Current School','RPT-ART-CUR','active');

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('ad120000-0000-4000-8000-000000000001','ad100000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000002','RPT-STALE','Stale','Manager','active'),
  ('ad120000-0000-4000-8000-000000000002','ad100000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000003','RPT-CURRENT','Current','Manager','active');

-- Multi-school legacy administrator: the later membership is deterministic current school.
insert into public.school_memberships(
  tenant_id,school_id,user_id,staff_member_id,role_key,active_from
) values
  ('ad100000-0000-4000-8000-000000000001','ad110000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000001',null,'school_admin',current_date-30),
  ('ad100000-0000-4000-8000-000000000001','ad110000-0000-4000-8000-000000000002','ad000000-0000-4000-8000-000000000001',null,'school_admin',current_date-10),
  ('ad100000-0000-4000-8000-000000000001','ad110000-0000-4000-8000-000000000002','ad000000-0000-4000-8000-000000000002','ad120000-0000-4000-8000-000000000001','school_admin',current_date-30),
  ('ad100000-0000-4000-8000-000000000001','ad110000-0000-4000-8000-000000000002','ad000000-0000-4000-8000-000000000003','ad120000-0000-4000-8000-000000000002','school_admin',current_date-10);

insert into public.staff_school_assignments(
  tenant_id,school_id,staff_member_id,assignment_type,position_title,effective_from,effective_to,created_by_user_id
) values
  ('ad100000-0000-4000-8000-000000000001','ad110000-0000-4000-8000-000000000002','ad120000-0000-4000-8000-000000000001','management','Ended Manager',current_date-30,current_date-1,'ad000000-0000-4000-8000-000000000005'),
  ('ad100000-0000-4000-8000-000000000001','ad110000-0000-4000-8000-000000000002','ad120000-0000-4000-8000-000000000002','management','Current Manager',current_date-10,null,'ad000000-0000-4000-8000-000000000005');

insert into public.platform_memberships(user_id,role_key,active_from) values
  ('ad000000-0000-4000-8000-000000000004','platform_support',current_date-5),
  ('ad000000-0000-4000-8000-000000000005','platform_admin',current_date-5);

insert into public.learners(id,tenant_id,first_names,surname) values
  ('ad130000-0000-4000-8000-000000000001','ad100000-0000-4000-8000-000000000001','Old','Report Learner'),
  ('ad130000-0000-4000-8000-000000000002','ad100000-0000-4000-8000-000000000001','Current','Report Learner');

insert into public.enrolments(
  id,tenant_id,school_id,learner_id,academic_year,admission_number,enrolled_from,status
) values
  ('ad140000-0000-4000-8000-000000000001','ad100000-0000-4000-8000-000000000001','ad110000-0000-4000-8000-000000000001','ad130000-0000-4000-8000-000000000001',2026,'RPT-OLD-001','2026-01-01','current'),
  ('ad140000-0000-4000-8000-000000000002','ad100000-0000-4000-8000-000000000001','ad110000-0000-4000-8000-000000000002','ad130000-0000-4000-8000-000000000002',2026,'RPT-CUR-001','2026-01-01','current');

insert into public.report_card_snapshots(
  id,tenant_id,school_id,learner_id,enrolment_id,academic_year,term_number,
  template_version,snapshot_version,data_snapshot,status,generated_by_user_id,
  certified_by_user_id,certified_at
) values
  ('ad150000-0000-4000-8000-000000000001','ad100000-0000-4000-8000-000000000001','ad110000-0000-4000-8000-000000000001','ad130000-0000-4000-8000-000000000001','ad140000-0000-4000-8000-000000000001',2026,1,'ARTIFACT_QA_V1',9901,'{}'::jsonb,'certified','ad000000-0000-4000-8000-000000000005','ad000000-0000-4000-8000-000000000005',now()),
  ('ad150000-0000-4000-8000-000000000002','ad100000-0000-4000-8000-000000000001','ad110000-0000-4000-8000-000000000002','ad130000-0000-4000-8000-000000000002','ad140000-0000-4000-8000-000000000002',2026,1,'ARTIFACT_QA_V1',9902,'{}'::jsonb,'certified','ad000000-0000-4000-8000-000000000005','ad000000-0000-4000-8000-000000000005',now());

insert into public.report_card_documents(
  id,tenant_id,school_id,snapshot_id,template_key,template_version,document_format,
  storage_bucket,storage_path,status,generated_by_user_id
) values
  ('ad160000-0000-4000-8000-000000000001','ad100000-0000-4000-8000-000000000001','ad110000-0000-4000-8000-000000000001','ad150000-0000-4000-8000-000000000001','TERM_REPORT','ARTIFACT_QA_V1','pdf','report-card-artifacts','artifact-qa/old.pdf','ready','ad000000-0000-4000-8000-000000000005'),
  ('ad160000-0000-4000-8000-000000000002','ad100000-0000-4000-8000-000000000001','ad110000-0000-4000-8000-000000000002','ad150000-0000-4000-8000-000000000002','TERM_REPORT','ARTIFACT_QA_V1','pdf','report-card-artifacts','artifact-qa/current.pdf','ready','ad000000-0000-4000-8000-000000000005');

select is(
  app_private.user_can_manage_report_cards('ad000000-0000-4000-8000-000000000002','ad110000-0000-4000-8000-000000000002'),
  false,
  'ended authoritative placement defeats stale linked school-admin membership'
);
select ok(
  app_private.user_can_manage_report_cards('ad000000-0000-4000-8000-000000000003','ad110000-0000-4000-8000-000000000002'),
  'current authoritative manager placement retains report-card authority'
);

select set_config('request.jwt.claim.role','authenticated',true);

-- Any-active-membership SECURITY DEFINER leakage is closed for the non-current school.
select set_config('request.jwt.claim.sub','ad000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select throws_ok(
  $$select * from public.get_report_card_status_for_enrolment('ad110000-0000-4000-8000-000000000001',2026,1,'ad140000-0000-4000-8000-000000000001')$$,
  'Permission denied',
  'older active non-current school cannot expose generated report status or pdf readiness'
);
select is(
  (select count(*)::integer from public.report_card_documents where school_id='ad110000-0000-4000-8000-000000000001'),
  0,
  'older active non-current school cannot read report-card document metadata'
);
select is(
  (select count(*)::integer from public.get_report_card_status_for_enrolment('ad110000-0000-4000-8000-000000000002',2026,1,'ad140000-0000-4000-8000-000000000002')),
  1,
  'deterministic current-school member retains current-enrolment report status access'
);
reset role;

-- Stale linked management placement cannot read document metadata or use SECURITY DEFINER status lookup.
select set_config('request.jwt.claim.sub','ad000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.report_card_documents where school_id='ad110000-0000-4000-8000-000000000002'),
  0,
  'ended manager placement cannot retain report-card document read authority through stale membership'
);
select throws_ok(
  $$select * from public.get_report_card_status_for_enrolment('ad110000-0000-4000-8000-000000000002',2026,1,'ad140000-0000-4000-8000-000000000002')$$,
  'Permission denied',
  'ended manager placement cannot retain generated artifact status access'
);
reset role;

-- A currently placed manager remains authorized.
select set_config('request.jwt.claim.sub','ad000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.report_card_documents where school_id='ad110000-0000-4000-8000-000000000002'),
  1,
  'current manager can read current-school report-card document metadata'
);
select is(
  (select count(*)::integer from public.get_report_card_status_for_enrolment('ad110000-0000-4000-8000-000000000002',2026,1,'ad140000-0000-4000-8000-000000000002')),
  1,
  'current manager can read generated artifact status for the current school'
);
reset role;

-- Platform Support remains troubleshooting-only.
select set_config('request.jwt.claim.sub','ad000000-0000-4000-8000-000000000004',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.report_card_documents),
  0,
  'Platform Support cannot read sensitive report-card document metadata'
);
select throws_ok(
  $$select * from public.get_report_card_status_for_enrolment('ad110000-0000-4000-8000-000000000002',2026,1,'ad140000-0000-4000-8000-000000000002')$$,
  'Permission denied',
  'Platform Support cannot use generated artifact status lookup'
);
reset role;

-- Governed Platform Admin oversight remains available.
select set_config('request.jwt.claim.sub','ad000000-0000-4000-8000-000000000005',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.report_card_documents where tenant_id='ad100000-0000-4000-8000-000000000001'),
  2,
  'Platform Admin retains governed report-card document oversight'
);
reset role;

select * from finish();
rollback;
