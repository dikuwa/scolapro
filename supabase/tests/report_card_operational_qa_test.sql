begin;

select plan(11);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('f9100000-0000-4000-8000-000000000001','ops-admin@example.test','authenticated','authenticated',now(),now()),
  ('f9100000-0000-4000-8000-000000000002','ops-teacher@example.test','authenticated','authenticated',now(),now()),
  ('f9100000-0000-4000-8000-000000000003','ops-other-admin@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,status)
values ('f9110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Operational QA School','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f9100000-0000-4000-8000-000000000001','school_admin',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f9100000-0000-4000-8000-000000000002','teacher',current_date),
  ('11111111-1111-4111-8111-111111111111','f9110000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000003','school_admin',current_date);

insert into public.report_card_snapshots(
  id,tenant_id,school_id,learner_id,enrolment_id,academic_year,term_number,
  template_version,snapshot_version,data_snapshot,status,generated_by_user_id,
  certified_by_user_id,certified_at
) values (
  'f9170000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
  2026,6,'OPS_TEST',990,'{}'::jsonb,'certified',
  'f9100000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001',now()
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f9100000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok(
  $$select public.create_report_card_batch('22222222-2222-4222-8222-222222222222',2026,6,'custom','Operational QA publish','publish',array['60000000-0000-4000-8000-000000000001'::uuid])$$,
  'owning school administrator can create a publication batch'
);
reset role;

select set_config('request.jwt.claim.sub','f9100000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok(
  $$select public.create_report_card_batch('22222222-2222-4222-8222-222222222222',2026,6,'custom','Teacher publish','publish',array['60000000-0000-4000-8000-000000000001'::uuid])$$,
  'Permission denied',
  'teacher cannot create a publication batch'
);
reset role;

select set_config('request.jwt.claim.sub','f9100000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok(
  $$select public.create_report_card_batch('22222222-2222-4222-8222-222222222222',2026,6,'custom','Other school publish','publish',array['60000000-0000-4000-8000-000000000001'::uuid])$$,
  'Permission denied',
  'administrator from another school cannot create the batch'
);
reset role;

select lives_ok($$select public.process_report_card_batch_items(10)$$,'service worker processes the publication batch');
select is((select status from public.report_card_snapshots where id='f9170000-0000-4000-8000-000000000001'),'published','eligible certified snapshot is published');

select set_config('request.jwt.claim.sub','f9100000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((select count(*)::integer from public.report_card_batches where scope_label='Operational QA publish'),1,'owning administrator can read the batch');
reset role;

select set_config('request.jwt.claim.sub','f9100000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is((select count(*)::integer from public.report_card_batches where scope_label='Operational QA publish'),0,'other-school administrator cannot read the batch');
reset role;

insert into public.report_card_batches(
  id,tenant_id,school_id,academic_year,term_number,scope_type,scope_label,operation,status,
  total_items,created_by_user_id,export_status,export_error
) values (
  'f9180000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',2026,6,'custom','Operational failed export','pdf',
  'completed',1,'f9100000-0000-4000-8000-000000000001','failed','fixture failure'
);

select set_config('request.jwt.claim.sub','f9100000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok($$select public.retry_report_card_batch_export('f9180000-0000-4000-8000-000000000001')$$,'Permission denied','teacher cannot retry a failed combined export');
reset role;

select set_config('request.jwt.claim.sub','f9100000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok($$select public.retry_report_card_batch_export('f9180000-0000-4000-8000-000000000001')$$,'Permission denied','other-school administrator cannot retry the failed export');
reset role;

select set_config('request.jwt.claim.sub','f9100000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select public.retry_report_card_batch_export('f9180000-0000-4000-8000-000000000001')$$,'owning administrator can retry the failed export');
reset role;
select is((select export_status from public.report_card_batches where id='f9180000-0000-4000-8000-000000000001'),'waiting','authorized retry returns export to waiting');

select * from finish();
rollback;
