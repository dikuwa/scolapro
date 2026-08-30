begin;

select plan(14);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('a9100000-0000-4000-8000-000000000001','retry-admin@example.test','authenticated','authenticated',now(),now()),
  ('a9100000-0000-4000-8000-000000000002','retry-teacher@example.test','authenticated','authenticated',now(),now()),
  ('a9100000-0000-4000-8000-000000000003','retry-other-admin@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,status)
values ('a9110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Retry Isolation School','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','a9100000-0000-4000-8000-000000000001','school_admin',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','a9100000-0000-4000-8000-000000000002','teacher',current_date),
  ('11111111-1111-4111-8111-111111111111','a9110000-0000-4000-8000-000000000001','a9100000-0000-4000-8000-000000000003','school_admin',current_date);

insert into public.report_card_batches(
  id,tenant_id,school_id,academic_year,term_number,scope_type,scope_label,operation,status,
  total_items,processed_items,completed_items,skipped_items,failed_items,created_by_user_id
) values (
  'a9180000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',2026,6,'custom','Retry failed learner item','generate','partial',
  1,1,0,0,1,'a9100000-0000-4000-8000-000000000001'
);

insert into public.report_card_batch_items(
  id,batch_id,tenant_id,school_id,enrolment_id,learner_id,status,result_code,message,started_at,completed_at
) values (
  'a9190000-0000-4000-8000-000000000001','a9180000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',
  'failed','error','fixture failure',now(),now()
);

insert into public.report_card_batches(
  id,tenant_id,school_id,academic_year,term_number,scope_type,scope_label,operation,status,
  total_items,processed_items,completed_items,skipped_items,failed_items,created_by_user_id,
  export_status,export_error
) values (
  'a9180000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',2026,6,'custom','Retry failed combined export','pdf','completed',
  1,1,1,0,0,'a9100000-0000-4000-8000-000000000001','failed','fixture export failure'
);

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','a9100000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok(
  $$select public.retry_report_card_batch_failures('a9180000-0000-4000-8000-000000000001')$$,
  'Permission denied',
  'teacher cannot retry failed learner items'
);
reset role;
select is(
  (select count(*)::integer from public.audit_events where entity_id='a9180000-0000-4000-8000-000000000001' and event_type='report_card.batch.retry_requested'),
  0,
  'denied learner-item retry creates no audit event'
);

select set_config('request.jwt.claim.sub','a9100000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok(
  $$select public.retry_report_card_batch_failures('a9180000-0000-4000-8000-000000000001')$$,
  'Permission denied',
  'administrator from another school cannot retry failed learner items'
);
reset role;

select set_config('request.jwt.claim.sub','a9100000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(
  public.retry_report_card_batch_failures('a9180000-0000-4000-8000-000000000001'),
  1,
  'owning school administrator requeues the failed learner item'
);
reset role;
select is((select status from public.report_card_batch_items where id='a9190000-0000-4000-8000-000000000001'),'pending','authorized retry returns the learner item to pending');
select is((select result_code from public.report_card_batch_items where id='a9190000-0000-4000-8000-000000000001'),null,'authorized retry clears the previous result code');
select is((select status from public.report_card_batches where id='a9180000-0000-4000-8000-000000000001'),'processing','batch summary returns to processing while retried work is pending');
select is(
  (select count(*)::integer from public.audit_events where entity_id='a9180000-0000-4000-8000-000000000001' and event_type='report_card.batch.retry_requested'),
  1,
  'authorized learner-item retry records one audit event'
);
select is(
  (select actor_user_id from public.audit_events where entity_id='a9180000-0000-4000-8000-000000000001' and event_type='report_card.batch.retry_requested' order by occurred_at desc limit 1),
  'a9100000-0000-4000-8000-000000000001'::uuid,
  'learner-item retry audit records the acting administrator'
);

select set_config('request.jwt.claim.sub','a9100000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok(
  $$select public.retry_report_card_batch_export('a9180000-0000-4000-8000-000000000002')$$,
  'Permission denied',
  'teacher cannot retry the failed combined export'
);
reset role;

select set_config('request.jwt.claim.sub','a9100000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok(
  $$select public.retry_report_card_batch_export('a9180000-0000-4000-8000-000000000002')$$,
  'Permission denied',
  'administrator from another school cannot retry the failed combined export'
);
reset role;

select set_config('request.jwt.claim.sub','a9100000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok(
  $$select public.retry_report_card_batch_export('a9180000-0000-4000-8000-000000000002')$$,
  'owning school administrator can retry the failed combined export'
);
reset role;
select is((select export_status from public.report_card_batches where id='a9180000-0000-4000-8000-000000000002'),'waiting','authorized export retry returns the combined export to waiting');
select is(
  (select count(*)::integer from public.audit_events where entity_id='a9180000-0000-4000-8000-000000000002' and event_type='report_card.batch.export.retry_requested'),
  1,
  'authorized export retry records one audit event'
);
select is(
  (select actor_user_id from public.audit_events where entity_id='a9180000-0000-4000-8000-000000000002' and event_type='report_card.batch.export.retry_requested' order by occurred_at desc limit 1),
  'a9100000-0000-4000-8000-000000000001'::uuid,
  'export retry audit records the acting administrator'
);

select * from finish();
rollback;
