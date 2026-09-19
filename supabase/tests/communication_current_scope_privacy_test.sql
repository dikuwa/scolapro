begin;

select plan(20);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('51200000-0000-4000-8000-000000000001','comms-current@example.test','authenticated','authenticated',now(),now()),
  ('51200000-0000-4000-8000-000000000002','comms-support@example.test','authenticated','authenticated',now(),now()),
  ('51200000-0000-4000-8000-000000000003','comms-platform@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,status) values
  ('51210000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Comms Stale School','COMMS-512-A','active'),
  ('51210000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Comms Current School','COMMS-512-B','active');

insert into public.school_memberships(id,tenant_id,school_id,user_id,role_key,active_from) values
  ('51220000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','51210000-0000-4000-8000-000000000001','51200000-0000-4000-8000-000000000001','school_admin',current_date-10),
  ('51220000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','51210000-0000-4000-8000-000000000002','51200000-0000-4000-8000-000000000001','school_admin',current_date-1),
  ('51220000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','51210000-0000-4000-8000-000000000002','51200000-0000-4000-8000-000000000002','school_admin',current_date-1);

insert into public.platform_memberships(user_id,role_key,active_from) values
  ('51200000-0000-4000-8000-000000000002','platform_support',current_date-1),
  ('51200000-0000-4000-8000-000000000003','platform_admin',current_date-1);

insert into public.communication_messages(
  id,tenant_id,school_id,channel,subject,body,audience_type,status,sensitive,created_by_user_id
) values
  ('51230000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','51210000-0000-4000-8000-000000000001','sms','Historical school draft','Fixture body','individual','draft',false,'51200000-0000-4000-8000-000000000001'),
  ('51230000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','51210000-0000-4000-8000-000000000002','sms','Current school draft','Fixture body','individual','draft',false,'51200000-0000-4000-8000-000000000001'),
  ('51230000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','51210000-0000-4000-8000-000000000002','sms','Worker privacy fixture','Fixture body','individual','sending',false,'51200000-0000-4000-8000-000000000001'),
  ('51230000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','51210000-0000-4000-8000-000000000002','sms','Receipt privacy fixture','Fixture body','individual','sent',false,'51200000-0000-4000-8000-000000000001');

insert into public.communication_recipients(
  id,tenant_id,school_id,message_id,destination,delivery_status,provider_message_id
) values
  ('51240000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','51210000-0000-4000-8000-000000000001','51230000-0000-4000-8000-000000000001','+264811111111','pending',null),
  ('51240000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','51210000-0000-4000-8000-000000000002','51230000-0000-4000-8000-000000000002','+264822222222','pending',null),
  ('51240000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','51210000-0000-4000-8000-000000000002','51230000-0000-4000-8000-000000000003','+264833333333','queued',null),
  ('51240000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','51210000-0000-4000-8000-000000000002','51230000-0000-4000-8000-000000000004','+264844444444','submitted','provider-512-receipt');

insert into public.communication_delivery_jobs(
  id,tenant_id,school_id,message_id,recipient_id,channel,provider_key,status,attempt_count,locked_at,last_attempt_at,completed_at
) values
  ('51250000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','51210000-0000-4000-8000-000000000002','51230000-0000-4000-8000-000000000003','51240000-0000-4000-8000-000000000003','sms','mock','processing',5,now(),now(),null),
  ('51250000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','51210000-0000-4000-8000-000000000002','51230000-0000-4000-8000-000000000004','51240000-0000-4000-8000-000000000004','sms','mock','completed',1,null,now(),now());

insert into public.communication_delivery_attempts(
  id,tenant_id,school_id,delivery_job_id,attempt_number,provider_key,outcome,started_at
) values
  ('51260000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','51210000-0000-4000-8000-000000000002','51250000-0000-4000-8000-000000000001',5,'mock','processing',now()),
  ('51260000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','51210000-0000-4000-8000-000000000002','51250000-0000-4000-8000-000000000002',1,'mock','accepted',now());

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','51200000-0000-4000-8000-000000000001',true);

select is(app_private.is_current_school('51210000-0000-4000-8000-000000000002'),true,'latest active membership is deterministic current school');
select is(app_private.is_current_school('51210000-0000-4000-8000-000000000001'),false,'older still-active membership is not current-school authority');
select is(app_private.can_author_communications('51210000-0000-4000-8000-000000000001'),false,'stale active school cannot authorize communication authoring');
select is(app_private.can_author_communications('51210000-0000-4000-8000-000000000002'),true,'current school retains communication authoring authority');
select is(app_private.can_read_communication('51230000-0000-4000-8000-000000000001'),false,'message authorship does not preserve operational read access at a stale school');
select is(app_private.can_read_communication('51230000-0000-4000-8000-000000000002'),true,'message author can read current-school draft');

set local role authenticated;
select throws_ok(
  $$select public.queue_communication('51230000-0000-4000-8000-000000000001'::uuid)$$,
  'P0001','Permission denied: communication operation is outside the current school',
  'stale active school cannot queue communication'
);
select throws_ok(
  $$select public.set_communication_provider_route(
    '11111111-1111-4111-8111-111111111111'::uuid,
    '51210000-0000-4000-8000-000000000001'::uuid,
    'sms'::text,'mock'::text,100::smallint,true,current_date,null::date,'{}'::jsonb
  )$$,
  'P0001','Permission denied',
  'stale active school cannot configure provider route'
);
select throws_ok(
  $$select * from public.list_communication_delivery_diagnostics('51210000-0000-4000-8000-000000000001'::uuid,20)$$,
  'P0001','Permission denied',
  'stale active school cannot read delivery diagnostics'
);
reset role;

select set_config('request.jwt.claim.sub','51200000-0000-4000-8000-000000000002',true);
select is(app_private.can_author_communications('51210000-0000-4000-8000-000000000002'),false,'Platform Support cannot author even with a school membership');
set local role authenticated;
select throws_ok(
  'select * from public.list_communication_delivery_diagnostics(''51210000-0000-4000-8000-000000000002''::uuid,20)',
  'P0001','Permission denied',
  'Platform Support cannot read delivery diagnostics'
);
select throws_ok(
  'select public.set_communication_provider_route(''11111111-1111-4111-8111-111111111111''::uuid,''51210000-0000-4000-8000-000000000002''::uuid,''sms''::text,''mock-support''::text,100::smallint,true,current_date,null::date,''{}''::jsonb)',
  'P0001','Permission denied',
  'Platform Support cannot configure provider routes through a school membership'
);
reset role;

select set_config('request.jwt.claim.sub','51200000-0000-4000-8000-000000000003',true);
select is(app_private.can_author_communications('51210000-0000-4000-8000-000000000001'),true,'Platform Admin retains governed cross-school communications authoring authority');
set local role authenticated;
select lives_ok(
  $$select * from public.list_communication_delivery_diagnostics('51210000-0000-4000-8000-000000000002'::uuid,20)$$,
  'Platform Admin can inspect sanitized cross-school delivery diagnostics'
);
reset role;

select set_config('request.jwt.claim.sub','51200000-0000-4000-8000-000000000001',true);
select ok(
  public.fail_communication_delivery_job(
    '51250000-0000-4000-8000-000000000001',
    'Provider echoed guardian +264833333333 and private message body',
    300,5
  ),
  'dead-letter transition accepts worker-only raw diagnostic detail'
);
select is(
  (select failure_reason from public.communication_recipients where id='51240000-0000-4000-8000-000000000003'),
  'Provider delivery failed',
  'recipient-visible failure reason does not expose raw provider detail'
);
select is(
  (select last_error from public.communication_delivery_jobs where id='51250000-0000-4000-8000-000000000001'),
  'Provider echoed guardian +264833333333 and private message body',
  'raw worker detail remains available only in the protected delivery job'
);

select ok(
  public.record_communication_delivery_receipt(
    'mock','provider-512-receipt','failed','provider-event-512',now(),'FAILED',
    'Provider echoed guardian +264844444444 and confidential content',
    '{"event_type":"mock.failed"}'::jsonb
  ) is not null,
  'provider failure receipt remains append-recorded'
);
select is(
  (select failure_reason from public.communication_recipients where id='51240000-0000-4000-8000-000000000004'),
  'Provider reported delivery failure',
  'provider receipt does not copy raw provider error detail into recipient-visible state'
);
select is(
  (select error_detail from public.communication_delivery_receipts where provider_event_id='provider-event-512'),
  'Provider echoed guardian +264844444444 and confidential content',
  'raw provider receipt detail remains in service-role-only append history'
);

select * from finish();
rollback;
