begin;

select plan(23);

select has_table('public','communication_delivery_receipts','provider delivery receipt history exists');
select ok((select relrowsecurity from pg_class where oid='public.communication_delivery_receipts'::regclass),'delivery receipt history uses RLS');
select ok(not has_function_privilege('authenticated','public.record_communication_delivery_receipt(text,text,text,text,timestamptz,text,text,jsonb)','EXECUTE'),'authenticated clients cannot project provider delivery receipts');
select ok(has_function_privilege('service_role','public.record_communication_delivery_receipt(text,text,text,text,timestamptz,text,text,jsonb)','EXECUTE'),'service role can project provider delivery receipts');
select ok(not has_table_privilege('service_role','public.communication_delivery_receipts','UPDATE'),'service role cannot rewrite append-only delivery receipts');
select ok(not has_table_privilege('service_role','public.communication_delivery_receipts','DELETE'),'service role cannot delete append-only delivery receipts');

insert into auth.users(id,email,aud,role,created_at,updated_at)
values ('fe500000-0000-4000-8000-000000000001','delivery-state-author@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe500000-0000-4000-8000-000000000001','teacher',current_date);

insert into public.communication_messages(
  id,tenant_id,school_id,channel,subject,body,audience_type,status,sensitive,created_by_user_id
) values (
  'fe510000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'sms','Delivery state test','Status semantics','individual','sending',false,
  'fe500000-0000-4000-8000-000000000001'
);

insert into public.communication_recipients(
  id,tenant_id,school_id,message_id,destination,delivery_status
) values (
  'fe520000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fe510000-0000-4000-8000-000000000001',
  '+264811234567','queued'
);

insert into public.communication_delivery_jobs(
  id,tenant_id,school_id,message_id,recipient_id,channel,provider_key,status,attempt_count,locked_at,last_attempt_at
) values (
  'fe530000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fe510000-0000-4000-8000-000000000001',
  'fe520000-0000-4000-8000-000000000001',
  'sms','mock_sms','processing',1,now(),now()
);

insert into public.communication_delivery_attempts(
  tenant_id,school_id,delivery_job_id,attempt_number,provider_key,outcome,started_at
) values (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fe530000-0000-4000-8000-000000000001',1,'mock_sms','processing',now()
);

select is(
  public.complete_communication_delivery_job('fe530000-0000-4000-8000-000000000001','mock_sms','provider-msg-1'),
  true,
  'provider API acceptance completes the worker transport task'
);
select is((select status from public.communication_delivery_jobs where id='fe530000-0000-4000-8000-000000000001'),'completed','accepted transport job is completed');
select is((select delivery_status from public.communication_recipients where id='fe520000-0000-4000-8000-000000000001'),'submitted','provider acceptance marks recipient submitted, not delivered');
select ok((select submitted_at is not null from public.communication_recipients where id='fe520000-0000-4000-8000-000000000001'),'provider acceptance records submitted timestamp');
select ok((select delivered_at is null from public.communication_recipients where id='fe520000-0000-4000-8000-000000000001'),'provider acceptance does not fabricate delivered timestamp');
select is((select outcome from public.communication_delivery_attempts where delivery_job_id='fe530000-0000-4000-8000-000000000001' and attempt_number=1),'accepted','delivery attempt records provider acceptance separately');
select is((select status from public.communication_messages where id='fe510000-0000-4000-8000-000000000001'),'sent','message is sent once all provider submissions finish');

select ok(
  public.record_communication_delivery_receipt(
    'mock_sms','provider-msg-1','delivered','evt-delivered-1',now(),null,null,'{"provider_status":"DELIVRD"}'::jsonb
  ) is not null,
  'provider delivered receipt is recorded'
);
select is((select count(*)::integer from public.communication_delivery_receipts where delivery_job_id='fe530000-0000-4000-8000-000000000001'),1,'delivered receipt is append-recorded once');
select is((select delivery_status from public.communication_recipients where id='fe520000-0000-4000-8000-000000000001'),'delivered','delivered receipt advances canonical recipient state');
select ok((select delivered_at is not null from public.communication_recipients where id='fe520000-0000-4000-8000-000000000001'),'delivered receipt records final delivery timestamp');
select is(
  public.record_communication_delivery_receipt(
    'mock_sms','provider-msg-1','delivered','evt-delivered-1',now(),null,null,'{"duplicate":true}'::jsonb
  ),
  (select id from public.communication_delivery_receipts where provider_key='mock_sms' and provider_event_id='evt-delivered-1'),
  'replayed provider event returns the original receipt id'
);
select is((select count(*)::integer from public.communication_delivery_receipts where delivery_job_id='fe530000-0000-4000-8000-000000000001'),1,'replayed provider event does not create duplicate receipt history');

select ok(
  public.record_communication_delivery_receipt(
    'mock_sms','provider-msg-1','failed','evt-late-failed-1',now(),'LATE_FAIL','late failure after delivery','{"provider_status":"FAILED"}'::jsonb
  ) is not null,
  'late distinct provider failure remains auditable'
);
select is((select count(*)::integer from public.communication_delivery_receipts where delivery_job_id='fe530000-0000-4000-8000-000000000001'),2,'distinct late provider event is append-recorded');
select is((select delivery_status from public.communication_recipients where id='fe520000-0000-4000-8000-000000000001'),'delivered','late failure cannot downgrade confirmed delivery');
select ok((select failure_reason is null from public.communication_recipients where id='fe520000-0000-4000-8000-000000000001'),'late failure cannot attach failure reason to confirmed delivery');

select * from finish();
rollback;
