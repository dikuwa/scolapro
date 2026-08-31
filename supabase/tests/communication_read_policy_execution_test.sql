begin;

select plan(27);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fc700000-0000-4000-8000-000000000001','ledger-admin@example.test','authenticated','authenticated',now(),now()),
  ('fc700000-0000-4000-8000-000000000002','ledger-author@example.test','authenticated','authenticated',now(),now()),
  ('fc700000-0000-4000-8000-000000000003','ledger-peer@example.test','authenticated','authenticated',now(),now()),
  ('fc700000-0000-4000-8000-000000000004','ledger-other-admin@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,status) values
  ('fc710000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Communication Other School','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc700000-0000-4000-8000-000000000001','school_admin',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc700000-0000-4000-8000-000000000002','teacher',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc700000-0000-4000-8000-000000000003','teacher',current_date),
  ('11111111-1111-4111-8111-111111111111','fc710000-0000-4000-8000-000000000001','fc700000-0000-4000-8000-000000000004','school_admin',current_date);

insert into public.communication_messages(
  id,tenant_id,school_id,channel,subject,body,audience_type,status,sensitive,created_by_user_id,sent_at
) values (
  'fc720000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'sms','Sensitive delivery','Private parent delivery','individual','sent',true,'fc700000-0000-4000-8000-000000000002',now()
);

insert into public.communication_recipients(
  id,tenant_id,school_id,message_id,destination,delivery_status,provider_message_id,submitted_at,delivered_at
) values (
  'fc730000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fc720000-0000-4000-8000-000000000001','+264811111111','delivered','bird-message-ledger-1',now(),now()
);

insert into public.communication_delivery_jobs(
  id,tenant_id,school_id,message_id,recipient_id,channel,provider_key,status,attempt_count,last_attempt_at,completed_at
) values (
  'fc740000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fc720000-0000-4000-8000-000000000001','fc730000-0000-4000-8000-000000000001','sms','bird_sms','completed',1,now(),now()
);

insert into public.communication_delivery_attempts(
  id,tenant_id,school_id,delivery_job_id,attempt_number,provider_key,provider_message_id,outcome,started_at,finished_at,provider_metadata
) values (
  'fc750000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fc740000-0000-4000-8000-000000000001',1,'bird_sms','bird-message-ledger-1','delivered',now(),now(),'{}'::jsonb
);

insert into public.communication_delivery_receipts(
  id,tenant_id,school_id,delivery_job_id,recipient_id,provider_key,provider_message_id,provider_event_id,outcome,occurred_at,provider_metadata
) values (
  'fc760000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fc740000-0000-4000-8000-000000000001','fc730000-0000-4000-8000-000000000001','bird_sms','bird-message-ledger-1','bird-event-ledger-1','delivered',now(),'{}'::jsonb
);

insert into public.communication_provider_routes(
  id,tenant_id,school_id,channel,provider_key,priority,active,effective_from,config,updated_by_user_id
) values (
  'fc770000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'sms','bird_sms',100,true,current_date,'{}'::jsonb,'fc700000-0000-4000-8000-000000000001'
);

select ok(
  not has_function_privilege('authenticated','app_private.can_read_communication(uuid)','EXECUTE'),
  'private communication read helper remains unavailable as a direct authenticated API'
);
select ok(
  has_function_privilege('authenticated','app_private.can_read_communication_for_rls(uuid)','EXECUTE'),
  'authenticated role can execute only the narrow communication RLS wrapper'
);
select ok(
  has_function_privilege('authenticated','app_private.can_read_communication_delivery_job_for_rls(uuid)','EXECUTE'),
  'authenticated role can execute the narrow delivery diagnostic RLS wrapper'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);

-- Owning school leadership can inspect the full governed ledger and provider route.
select set_config('request.jwt.claim.sub','fc700000-0000-4000-8000-000000000001',true);
select is((select count(*)::integer from public.communication_messages where id='fc720000-0000-4000-8000-000000000001'),1,'owning school administrator reads governed communication message');
select is((select count(*)::integer from public.communication_recipients where id='fc730000-0000-4000-8000-000000000001'),1,'owning school administrator reads governed recipient');
select is((select count(*)::integer from public.communication_delivery_jobs where id='fc740000-0000-4000-8000-000000000001'),1,'owning school administrator reads governed delivery job');
select is((select count(*)::integer from public.communication_delivery_attempts where id='fc750000-0000-4000-8000-000000000001'),1,'owning school administrator reads governed provider attempt');
select is((select count(*)::integer from public.communication_delivery_receipts where id='fc760000-0000-4000-8000-000000000001'),1,'owning school administrator reads governed final receipt');
select is((select count(*)::integer from public.communication_provider_routes where id='fc770000-0000-4000-8000-000000000001'),1,'owning school administrator reads school provider route');

-- The message author can inspect their own message delivery chain, but not provider routing configuration.
select set_config('request.jwt.claim.sub','fc700000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.communication_messages where id='fc720000-0000-4000-8000-000000000001'),1,'message author reads own sensitive message');
select is((select count(*)::integer from public.communication_recipients where id='fc730000-0000-4000-8000-000000000001'),1,'message author reads own recipient');
select is((select count(*)::integer from public.communication_delivery_jobs where id='fc740000-0000-4000-8000-000000000001'),1,'message author reads own delivery job');
select is((select count(*)::integer from public.communication_delivery_attempts where id='fc750000-0000-4000-8000-000000000001'),1,'message author reads own provider attempt');
select is((select count(*)::integer from public.communication_delivery_receipts where id='fc760000-0000-4000-8000-000000000001'),1,'message author reads own final receipt');
select is((select count(*)::integer from public.communication_provider_routes where id='fc770000-0000-4000-8000-000000000001'),0,'ordinary author cannot inspect provider routing configuration');

-- A peer teacher cannot browse another author's sensitive communication or diagnostics.
select set_config('request.jwt.claim.sub','fc700000-0000-4000-8000-000000000003',true);
select is((select count(*)::integer from public.communication_messages where id='fc720000-0000-4000-8000-000000000001'),0,'peer teacher cannot read another author sensitive message');
select is((select count(*)::integer from public.communication_recipients where id='fc730000-0000-4000-8000-000000000001'),0,'peer teacher cannot read another author recipient destination');
select is((select count(*)::integer from public.communication_delivery_jobs where id='fc740000-0000-4000-8000-000000000001'),0,'peer teacher cannot read another author delivery job');
select is((select count(*)::integer from public.communication_delivery_attempts where id='fc750000-0000-4000-8000-000000000001'),0,'peer teacher cannot read another author provider attempt');
select is((select count(*)::integer from public.communication_delivery_receipts where id='fc760000-0000-4000-8000-000000000001'),0,'peer teacher cannot read another author final receipt');
select is((select count(*)::integer from public.communication_provider_routes where id='fc770000-0000-4000-8000-000000000001'),0,'peer teacher cannot read provider route');

-- A legitimate administrator in School B receives empty results, never School A data.
select set_config('request.jwt.claim.sub','fc700000-0000-4000-8000-000000000004',true);
select is((select count(*)::integer from public.communication_messages where id='fc720000-0000-4000-8000-000000000001'),0,'other-school administrator cannot read School A message');
select is((select count(*)::integer from public.communication_recipients where id='fc730000-0000-4000-8000-000000000001'),0,'other-school administrator cannot read School A recipient');
select is((select count(*)::integer from public.communication_delivery_jobs where id='fc740000-0000-4000-8000-000000000001'),0,'other-school administrator cannot read School A delivery job');
select is((select count(*)::integer from public.communication_delivery_attempts where id='fc750000-0000-4000-8000-000000000001'),0,'other-school administrator cannot read School A provider attempt');
select is((select count(*)::integer from public.communication_delivery_receipts where id='fc760000-0000-4000-8000-000000000001'),0,'other-school administrator cannot read School A final receipt');
select is((select count(*)::integer from public.communication_provider_routes where id='fc770000-0000-4000-8000-000000000001'),0,'other-school administrator cannot read School A provider route');

reset role;
select * from finish();
rollback;
