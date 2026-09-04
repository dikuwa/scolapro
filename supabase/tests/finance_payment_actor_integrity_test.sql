begin;

select plan(14);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fa500000-0000-4000-8000-000000000001','finance-actor@example.test','authenticated','authenticated',now(),now()),
  ('fa500000-0000-4000-8000-000000000002','finance-actor-peer@example.test','authenticated','authenticated',now(),now()),
  ('fa500000-0000-4000-8000-000000000003','finance-actor-outsider@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa500000-0000-4000-8000-000000000001','finance_officer',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa500000-0000-4000-8000-000000000002','bursar',current_date);

insert into public.finance_invoices(
  id,tenant_id,school_id,learner_id,academic_year,invoice_number,issued_on,due_on,status,currency,total_amount,balance_amount,created_by_user_id
) values (
  'fa510000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '50000000-0000-4000-8000-000000000001',2026,'FIN-ACTOR-001',current_date,current_date+30,'issued','NAD',100,100,
  'fa500000-0000-4000-8000-000000000001'
);

insert into public.finance_invoice_lines(tenant_id,school_id,invoice_id,description,quantity,unit_amount)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa510000-0000-4000-8000-000000000001','Actor integrity item',1,100);

select throws_ok(
  $$insert into public.finance_payments(tenant_id,school_id,learner_id,payment_reference,payment_method,amount,currency,paid_on,status,recorded_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','PAY-ACTOR-BAD-RECORDER','cash',100,'NAD',current_date,'received','fa500000-0000-4000-8000-000000000003')$$,
  'Finance payment recorder is not authorized for school',
  'trusted write cannot forge an unrelated payment recorder'
);

select throws_ok(
  $$insert into public.finance_payments(tenant_id,school_id,learner_id,payment_reference,payment_method,amount,currency,paid_on,status,recorded_by_user_id,verified_by_user_id,verified_at)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','PAY-ACTOR-PREVERIFIED','cash',100,'NAD',current_date,'verified','fa500000-0000-4000-8000-000000000001','fa500000-0000-4000-8000-000000000001',now())$$,
  'Finance payments must be created in received state without verification provenance',
  'trusted write cannot manufacture a pre-verified payment'
);

select lives_ok(
  $$insert into public.finance_payments(id,tenant_id,school_id,learner_id,payment_reference,payment_method,amount,currency,paid_on,status,recorded_by_user_id)
    values('fa520000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','PAY-ACTOR-OK','cash',100,'NAD',current_date,'received','fa500000-0000-4000-8000-000000000001')$$,
  'authorized trusted recorder can create canonical received payment'
);

select throws_ok(
  $$update public.finance_payments set recorded_by_user_id='fa500000-0000-4000-8000-000000000002' where id='fa520000-0000-4000-8000-000000000001'$$,
  'Finance payment recorder provenance is immutable',
  'payment recorder provenance cannot be rewritten'
);

select throws_ok(
  $$update public.finance_payments set status='verified',verified_by_user_id='fa500000-0000-4000-8000-000000000003',verified_at=now() where id='fa520000-0000-4000-8000-000000000001'$$,
  'Finance payment verifier is not authorized for school',
  'trusted write cannot forge unrelated verification provenance'
);

select throws_ok(
  $$update public.finance_payments set status='verified' where id='fa520000-0000-4000-8000-000000000001'$$,
  'Verified finance payment requires verification provenance',
  'verified status cannot exist without verifier and timestamp provenance'
);

select lives_ok(
  $$update public.finance_payments set status='verified',verified_by_user_id='fa500000-0000-4000-8000-000000000002',verified_at=now() where id='fa520000-0000-4000-8000-000000000001'$$,
  'authorized trusted verifier can advance received payment to verified'
);

select throws_ok(
  $$update public.finance_payments set verified_by_user_id='fa500000-0000-4000-8000-000000000001' where id='fa520000-0000-4000-8000-000000000001'$$,
  'Finance payment verification provenance is immutable',
  'verification actor cannot be rewritten after verification'
);

select throws_ok(
  $$insert into public.finance_payment_allocations(tenant_id,school_id,payment_id,invoice_id,amount,allocated_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa520000-0000-4000-8000-000000000001','fa510000-0000-4000-8000-000000000001',25,'fa500000-0000-4000-8000-000000000003')$$,
  'Finance payment allocator is not authorized for school',
  'trusted write cannot forge an unrelated allocation actor'
);

select lives_ok(
  $$insert into public.finance_payment_allocations(id,tenant_id,school_id,payment_id,invoice_id,amount,allocated_by_user_id)
    values('fa530000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa520000-0000-4000-8000-000000000001','fa510000-0000-4000-8000-000000000001',25,'fa500000-0000-4000-8000-000000000001')$$,
  'authorized trusted allocator remains valid'
);

select lives_ok(
  $$update public.finance_payment_allocations set amount=30,allocated_by_user_id='fa500000-0000-4000-8000-000000000002',allocated_at=now() where id='fa530000-0000-4000-8000-000000000001'$$,
  'allocation can record a different currently authorized manager on a later governed-style update'
);

select throws_ok(
  $$update public.finance_payment_allocations set allocated_by_user_id='fa500000-0000-4000-8000-000000000003' where id='fa530000-0000-4000-8000-000000000001'$$,
  'Finance payment allocator is not authorized for school',
  'allocation actor cannot be replaced with an unrelated account'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_finance_payment_actor_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_finance_payment_actor_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_finance_payment_allocation_actor_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_finance_payment_allocation_actor_integrity()','EXECUTE'),
  'finance payment actor trigger helpers remain private'
);

select is(
  (select count(*)::integer
   from pg_catalog.pg_trigger
   where tgrelid='public.finance_payments'::regclass
     and tgname='finance_payment_actor_integrity_trg'
     and not tgisinternal),
  1,
  'finance payment actor integrity trigger is installed exactly once'
);

select * from finish();
rollback;
