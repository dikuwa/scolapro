begin;

select plan(16);

-- Non-sensitive fixture users for operational role QA.
insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('f9100000-0000-4000-8000-000000000001','report-ops-admin@example.test','authenticated','authenticated',now(),now()),
  ('f9100000-0000-4000-8000-000000000002','report-ops-teacher@example.test','authenticated','authenticated',now(),now()),
  ('f9100000-0000-4000-8000-000000000003','report-ops-other-admin@example.test','authenticated','authenticated',now(),now()),
  ('f9100000-0000-4000-8000-000000000004','report-ops-parent@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,status)
values ('f9110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Report Ops Other School','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f9100000-0000-4000-8000-000000000001','school_admin',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f9100000-0000-4000-8000-000000000002','teacher',current_date),
  ('11111111-1111-4111-8111-111111111111','f9110000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000003','school_admin',current_date);

insert into public.learners(id,tenant_id,first_names,surname) values
  ('f9120000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Publish','Certified'),
  ('f9120000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Publish','Draft'),
  ('f9120000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','Publish','Already');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,admission_number,enrolled_from,status) values
  ('f9130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f9120000-0000-4000-8000-000000000001',2026,'OPS-RPT-1','2026-01-01','current'),
  ('f9130000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f9120000-0000-4000-8000-000000000002',2026,'OPS-RPT-2','2026-01-01','current'),
  ('f9130000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f9120000-0000-4000-8000-000000000003',2026,'OPS-RPT-3','2026-01-01','current');

insert into public.guardian_profiles(id,tenant_id,first_names,surname,identity_number)
values('f9140000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Report','Parent','OPS-PARENT-1');
insert into public.learner_guardians(id,tenant_id,learner_id,guardian_id,relationship_type,is_legal_guardian,effective_from)
values('f9150000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','f9120000-0000-4000-8000-000000000001','f9140000-0000-4000-8000-000000000001','parent',true,current_date-1);
insert into public.guardian_user_links(id,tenant_id,guardian_id,user_id,linked_by_user_id)
values('f9160000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','f9140000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000004','f9100000-0000-4000-8000-000000000004');

insert into public.report_card_snapshots(
  id,tenant_id,school_id,learner_id,enrolment_id,academic_year,term_number,template_version,snapshot_version,
  data_snapshot,status,generated_by_user_id,certified_by_user_id,certified_at,published_at
) values
  ('f9170000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f9120000-0000-4000-8000-000000000001','f9130000-0000-4000-8000-000000000001',2026,6,'OPS_TEST',1,'{}','certified','f9100000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001',now(),null),
  ('f9170000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f9120000-0000-4000-8000-000000000002','f9130000-0000-4000-8000-000000000002',2026,6,'OPS_TEST',1,'{}','draft','f9100000-0000-4000-8000-000000000001',null,null,null),
  ('f9170000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f9120000-0000-4000-8000-000000000003','f9130000-0000-4000-8000-000000000003',2026,6,'OPS_TEST',1,'{}','published','f9100000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001',now(),now());

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f9100000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok(
  $$select public.create_report_card_batch('22222222-2222-4222-8222-222222222222',2026,6,'custom','Operational publish mix','publish',array[
    'f9130000-0000-4000-8000-000000000001'::uuid,
    'f9130000-0000-4000-8000-000000000002'::uuid,
    'f9130000-0000-4000-8000-000000000003'::uuid
  ])$$,
  'management can create a mixed-outcome publication batch'
);
reset role;

select lives_ok($$select public.process_report_card_batch_items(10)$$,'service worker drains the mixed publication batch');
select is((select status from public.report_card_snapshots where id='f9170000-0000-4000-8000-000000000001'),'published','certified snapshot is published');
select is((select status from public.report_card_snapshots where id='f9170000-0000-4000-8000-000000000002'),'draft','draft snapshot is not published');
select is((select result_code from public.report_card_batch_items where enrolment_id='f9130000-0000-4000-8000-000000000002'),'not_certified','draft learner is explicitly skipped as not certified');
select is((select result_code from public.report_card_batch_items where enrolment_id='f9130000-0000-4000-8000-000000000003'),'already_published','already-published learner is idempotently completed');
select is((select completed_items from public.report_card_batches where scope_label='Operational publish mix'),2,'two publish items complete');
select is((select skipped_items from public.report_card_batches where scope_label='Operational publish mix'),1,'one ineligible publish item is skipped');
select is((select status from public.report_card_batches where scope_label='Operational publish mix'),'completed','expected skips do not turn the batch into a failure');
select is((select count(*)::integer from public.notifications where recipient_user_id='f9100000-0000-4000-8000-000000000004' and title='Report card available'),1,'newly published linked learner creates exactly one guardian notification');
select is((select actor_user_id from public.audit_events where entity_id='f9170000-0000-4000-8000-000000000001'::uuid and event_type='report_card.snapshot.published' limit 1),'f9100000-0000-4000-8000-000000000001'::uuid,'bulk publication preserves the initiating management actor');

-- Batch rows are visible only to report managers in the owning school.
select set_config('request.jwt.claim.sub','f9100000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((select count(*)::integer from public.report_card_batches where scope_label='Operational publish mix'),1,'owning-school report manager can read the batch');
reset role;
select set_config('request.jwt.claim.sub','f9100000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is((select count(*)::integer from public.report_card_batches where scope_label='Operational publish mix'),0,'other-school report manager cannot read the batch');
reset role;

-- Failed combined exports re-enter the queue only through the owning management role.
insert into public.report_card_batches(
  id,tenant_id,school_id,academic_year,term_number,scope_type,scope_label,operation,status,total_items,created_by_user_id,export_status,export_error
) values(
  'f9180000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,6,
  'custom','Operational failed export','pdf','completed',1,'f9100000-0000-4000-8000-000000000001','failed','fixture failure'
);

select set_config('request.jwt.claim.sub','f9100000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok($$select public.retry_report_card_batch_export('f9180000-0000-4000-8000-000000000001')$$,'Permission denied','teacher cannot retry a failed combined export');
reset role;
select set_config('request.jwt.claim.sub','f9100000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok($$select public.retry_report_card_batch_export('f9180000-0000-4000-8000-000000000001')$$,'Permission denied','other-school administrator cannot retry a failed combined export');
reset role;
select set_config('request.jwt.claim.sub','f9100000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select public.retry_report_card_batch_export('f9180000-0000-4000-8000-000000000001')$$,'owning-school administrator can retry a failed combined export');
reset role;
select is((select export_status from public.report_card_batches where id='f9180000-0000-4000-8000-000000000001'),'waiting','authorized retry returns the failed export to waiting');

select * from finish();
rollback;
