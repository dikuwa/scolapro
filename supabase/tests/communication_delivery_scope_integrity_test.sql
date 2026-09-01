begin;

select plan(11);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('f8b00000-0000-4000-8000-000000000001','delivery-scope@example.test','authenticated','authenticated',now(),now());

insert into public.communication_messages(
  id,tenant_id,school_id,channel,subject,body,audience_type,status,sensitive,created_by_user_id
) values(
  'f8b10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'sms','Delivery scope','Body','individual','sending',false,'f8b00000-0000-4000-8000-000000000001'
);

insert into public.communication_recipients(
  id,tenant_id,school_id,message_id,destination,delivery_status
) values
('f8b20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f8b10000-0000-4000-8000-000000000001','+264811111111','queued'),
('f8b20000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f8b10000-0000-4000-8000-000000000001','+264822222222','queued');

select lives_ok(
  $$insert into public.communication_delivery_jobs(
      id,tenant_id,school_id,message_id,recipient_id,channel,provider_key,status
    ) values(
      'f8b30000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'f8b10000-0000-4000-8000-000000000001','f8b20000-0000-4000-8000-000000000001','sms','mock_sms','pending'
    )$$,
  'valid communication delivery job is accepted'
);

select lives_ok(
  $$insert into public.communication_delivery_attempts(
      id,tenant_id,school_id,delivery_job_id,attempt_number,provider_key,outcome
    ) values(
      'f8b40000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'f8b30000-0000-4000-8000-000000000001',1,'mock_sms','processing'
    )$$,
  'valid communication delivery attempt is accepted'
);

select lives_ok(
  $$insert into public.communication_delivery_receipts(
      id,tenant_id,school_id,delivery_job_id,recipient_id,provider_key,provider_message_id,provider_event_id,outcome
    ) values(
      'f8b50000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'f8b30000-0000-4000-8000-000000000001','f8b20000-0000-4000-8000-000000000001','mock_sms','provider-msg-1','provider-event-1','delivered'
    )$$,
  'valid communication delivery receipt is accepted'
);

select lives_ok(
  $$update public.communication_delivery_jobs set status='processing',attempt_count=1,last_attempt_at=now() where id='f8b30000-0000-4000-8000-000000000001'$$,
  'ordinary delivery job lifecycle updates remain allowed'
);

select throws_ok(
  $$insert into public.communication_delivery_jobs(
      tenant_id,school_id,message_id,recipient_id,channel,status
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'f8b10000-0000-4000-8000-000000000001','f8b20000-0000-4000-8000-000000000002','email','pending'
    )$$,
  'Communication delivery job channel does not match message channel',
  'delivery job channel must match the source message channel'
);

select throws_ok(
  $$insert into public.communication_delivery_receipts(
      tenant_id,school_id,delivery_job_id,recipient_id,provider_key,provider_message_id,outcome
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'f8b30000-0000-4000-8000-000000000001','f8b20000-0000-4000-8000-000000000002','mock_sms','provider-msg-wrong','delivered'
    )$$,
  'Communication delivery receipt scope mismatch: job or recipient does not match',
  'delivery receipt cannot be attached to another recipient'
);

select throws_ok(
  $$update public.communication_delivery_jobs set recipient_id='f8b20000-0000-4000-8000-000000000002' where id='f8b30000-0000-4000-8000-000000000001'$$,
  'Communication delivery job identity is immutable',
  'delivery job recipient provenance cannot be rebound'
);

select throws_ok(
  $$update public.communication_delivery_attempts set attempt_number=2 where id='f8b40000-0000-4000-8000-000000000001'$$,
  'Communication delivery attempt identity is immutable',
  'delivery attempt sequence provenance cannot be rewritten'
);

select throws_ok(
  $$update public.communication_delivery_receipts set provider_event_id='rewritten-event' where id='f8b50000-0000-4000-8000-000000000001'$$,
  'Communication delivery receipt provenance is immutable',
  'provider receipt provenance cannot be rewritten'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_communication_delivery_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_communication_delivery_scope_integrity()','EXECUTE'),
  'communication delivery integrity helper is private from client roles'
);

select is(
  (select count(*)::integer from pg_trigger
   where tgname in (
     'communication_delivery_jobs_scope_integrity_trg',
     'communication_delivery_attempts_scope_integrity_trg',
     'communication_delivery_receipts_scope_integrity_trg'
   ) and not tgisinternal),
  3,
  'all communication delivery tables have scope-integrity triggers'
);

select * from finish();
rollback;
