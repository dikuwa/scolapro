begin;

select plan(13);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('ed000000-0000-4000-8000-000000000001','direct-lifecycle-admin@example.test','authenticated','authenticated',now(),now()),
  ('ed000000-0000-4000-8000-000000000002','direct-lifecycle-teacher@example.test','authenticated','authenticated',now(),now()),
  ('ed000000-0000-4000-8000-000000000003','direct-lifecycle-other-admin@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,status) values
  ('ed100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Direct Lifecycle School','TST-RPT-DIRECT-001','active'),
  ('ed100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Other Direct Lifecycle School','TST-RPT-DIRECT-002','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','ed100000-0000-4000-8000-000000000001','ed000000-0000-4000-8000-000000000001','school_admin',current_date),
  ('11111111-1111-4111-8111-111111111111','ed100000-0000-4000-8000-000000000001','ed000000-0000-4000-8000-000000000002','teacher',current_date),
  ('11111111-1111-4111-8111-111111111111','ed100000-0000-4000-8000-000000000002','ed000000-0000-4000-8000-000000000003','school_admin',current_date);

insert into public.learners(id,tenant_id,first_names,surname) values
  ('ed200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Direct','Lifecycle');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,admission_number,enrolled_from,status) values
  ('ed300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ed100000-0000-4000-8000-000000000001','ed200000-0000-4000-8000-000000000001',2026,'DIRECT-LIFECYCLE-001','2026-01-01','current');

insert into public.report_card_snapshots(
  id,tenant_id,school_id,learner_id,enrolment_id,academic_year,term_number,
  template_version,snapshot_version,data_snapshot,status,generated_by_user_id,
  certified_by_user_id,certified_at
) values
  ('ed400000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ed100000-0000-4000-8000-000000000001','ed200000-0000-4000-8000-000000000001','ed300000-0000-4000-8000-000000000001',2026,1,'DIRECT_QA_V1',901,'{}'::jsonb,'draft','ed000000-0000-4000-8000-000000000001',null,null),
  ('ed400000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ed100000-0000-4000-8000-000000000001','ed200000-0000-4000-8000-000000000001','ed300000-0000-4000-8000-000000000001',2026,2,'DIRECT_QA_V1',902,'{}'::jsonb,'certified','ed000000-0000-4000-8000-000000000001','ed000000-0000-4000-8000-000000000001',now()),
  ('ed400000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','ed100000-0000-4000-8000-000000000001','ed200000-0000-4000-8000-000000000001','ed300000-0000-4000-8000-000000000001',2026,3,'DIRECT_QA_V1',903,'{}'::jsonb,'certified','ed000000-0000-4000-8000-000000000001','ed000000-0000-4000-8000-000000000001',now());

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','ed000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok(
  $$select public.certify_report_card_snapshot('ed400000-0000-4000-8000-000000000001')$$,
  'Permission denied',
  'teacher cannot directly certify a draft report-card snapshot'
);
reset role;
select is((select status from public.report_card_snapshots where id='ed400000-0000-4000-8000-000000000001'),'draft','denied teacher certification leaves the draft unchanged');

select set_config('request.jwt.claim.sub','ed000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok(
  $$select public.certify_report_card_snapshot('ed400000-0000-4000-8000-000000000001')$$,
  'Permission denied',
  'administrator from another school cannot directly certify the draft'
);
reset role;

select set_config('request.jwt.claim.sub','ed000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok(
  $$select public.certify_report_card_snapshot('ed400000-0000-4000-8000-000000000001')$$,
  'owning school administrator can directly certify the draft'
);
reset role;
select is((select status from public.report_card_snapshots where id='ed400000-0000-4000-8000-000000000001'),'certified','authorized direct certification advances the snapshot');

select set_config('request.jwt.claim.sub','ed000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok(
  $$select public.publish_report_card_snapshot('ed400000-0000-4000-8000-000000000002')$$,
  'Permission denied',
  'teacher cannot directly publish a certified report-card snapshot'
);
reset role;
select is((select status from public.report_card_snapshots where id='ed400000-0000-4000-8000-000000000002'),'certified','denied teacher publication leaves the certified snapshot unchanged');

select set_config('request.jwt.claim.sub','ed000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok(
  $$select public.publish_report_card_snapshot('ed400000-0000-4000-8000-000000000002')$$,
  'Permission denied',
  'administrator from another school cannot directly publish the snapshot'
);
reset role;

select set_config('request.jwt.claim.sub','ed000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok(
  $$select public.queue_report_card_render('ed400000-0000-4000-8000-000000000003','DIRECT_QA','1','pdf')$$,
  'Permission denied',
  'teacher cannot directly queue rendering of a certified historical snapshot'
);
reset role;
select is((select count(*)::integer from public.report_card_render_jobs where snapshot_id='ed400000-0000-4000-8000-000000000003'),0,'denied teacher render request creates no job');

select set_config('request.jwt.claim.sub','ed000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok(
  $$select public.queue_report_card_render('ed400000-0000-4000-8000-000000000003','DIRECT_QA','1','pdf')$$,
  'Permission denied',
  'administrator from another school cannot directly queue the render'
);
reset role;

select set_config('request.jwt.claim.sub','ed000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok(
  $$select public.queue_report_card_render('ed400000-0000-4000-8000-000000000003','DIRECT_QA','1','pdf')$$,
  'owning school administrator can directly queue the certified snapshot render'
);
reset role;
select is((select count(*)::integer from public.report_card_render_jobs where snapshot_id='ed400000-0000-4000-8000-000000000003'),1,'authorized direct render request creates exactly one job');

select * from finish();
rollback;
