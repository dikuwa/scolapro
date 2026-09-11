begin;

select plan(5);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values ('ee700000-0000-4000-8000-000000000001','report-current-school-admin@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,status) values
  ('ee710000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Report Current School A','TST-RPT-CURRENT-A','active'),
  ('ee710000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Report Current School B','TST-RPT-CURRENT-B','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values ('11111111-1111-4111-8111-111111111111','ee710000-0000-4000-8000-000000000001','ee700000-0000-4000-8000-000000000001','school_admin',current_date-10);

insert into public.learners(id,tenant_id,first_names,surname)
values ('ee720000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Current','School Report');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,admission_number,enrolled_from,status)
values ('ee730000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ee710000-0000-4000-8000-000000000001','ee720000-0000-4000-8000-000000000001',2026,'RPT-CURRENT-001','2026-01-01','current');

insert into public.report_card_snapshots(
  id,tenant_id,school_id,learner_id,enrolment_id,academic_year,term_number,
  template_version,snapshot_version,data_snapshot,status,generated_by_user_id
) values (
  'ee740000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ee710000-0000-4000-8000-000000000001',
  'ee720000-0000-4000-8000-000000000001','ee730000-0000-4000-8000-000000000001',2026,1,
  'CURRENT_SCHOOL_QA_V1',9701,'{}'::jsonb,'draft','ee700000-0000-4000-8000-000000000001'
);

select ok(
  app_private.user_can_manage_report_cards('ee700000-0000-4000-8000-000000000001','ee710000-0000-4000-8000-000000000001'),
  'single-school report administrator can manage the active school'
);

-- A later active membership becomes the deterministic current school under #411.
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values ('11111111-1111-4111-8111-111111111111','ee710000-0000-4000-8000-000000000002','ee700000-0000-4000-8000-000000000001','school_admin',current_date);

select is(
  app_private.user_can_manage_report_cards('ee700000-0000-4000-8000-000000000001','ee710000-0000-4000-8000-000000000001'),
  false,
  'report management authority cannot be borrowed from a non-current active school membership'
);
select is(
  app_private.user_can_manage_report_cards('ee700000-0000-4000-8000-000000000001','ee710000-0000-4000-8000-000000000002'),
  true,
  'report management authority follows the deterministic current school'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ee700000-0000-4000-8000-000000000001',true);
set local role authenticated;
select throws_ok(
  $$select public.certify_report_card_snapshot('ee740000-0000-4000-8000-000000000001')$$,
  'Report-card snapshot certifier is not authorized for school',
  'direct SECURITY DEFINER certification cannot operate on a non-current school snapshot'
);
reset role;

select is(
  (select status from public.report_card_snapshots where id='ee740000-0000-4000-8000-000000000001'),
  'draft',
  'denied non-current-school certification leaves immutable snapshot state unchanged'
);

select * from finish();
rollback;
