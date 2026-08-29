begin;

select plan(12);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fe500000-0000-4000-8000-000000000001','finance-governance@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe500000-0000-4000-8000-000000000001','finance_officer',current_date);

insert into public.finance_invoices(
  id,tenant_id,school_id,learner_id,academic_year,invoice_number,issued_on,due_on,status,currency,total_amount,balance_amount,created_by_user_id
) values(
  'fe510000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001',2026,'FIN-GOV-001',current_date,current_date+30,'issued','NAD',100,100,'fe500000-0000-4000-8000-000000000001'
);

insert into public.finance_invoice_lines(
  tenant_id,school_id,invoice_id,description,quantity,unit_amount
) values(
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe510000-0000-4000-8000-000000000001','Test invoice item',1,100
);

select set_config('request.jwt.claim.sub','fe500000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok(
  $$select public.record_finance_payment('22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','PAY-GOV-001','bank_transfer',100,'NAD',current_date,'BANK-001',null,'Payment received')$$,
  'finance officer can record a payment through governed workflow'
);

select is(
  (select status from public.finance_payments where payment_reference='PAY-GOV-001'),
  'received',
  'new payment enters received state before verification'
);

select throws_ok(
  $$select public.allocate_finance_payment((select id from public.finance_payments where payment_reference='PAY-GOV-001'),'fe510000-0000-4000-8000-000000000001',100)$$,
  'Only verified payments can be allocated',
  'unverified payment cannot reduce an invoice balance'
);

select is(
  public.review_finance_payment((select id from public.finance_payments where payment_reference='PAY-GOV-001'),'verified','Proof checked'),
  true,
  'finance officer can verify received payment'
);

select ok(
  (select status='verified' and verified_by_user_id='fe500000-0000-4000-8000-000000000001' and verified_at is not null from public.finance_payments where payment_reference='PAY-GOV-001'),
  'verification records reviewer and timestamp provenance'
);

select lives_ok(
  $$select public.allocate_finance_payment((select id from public.finance_payments where payment_reference='PAY-GOV-001'),'fe510000-0000-4000-8000-000000000001',100)$$,
  'verified payment can be allocated to invoice'
);

select is(
  (select balance_amount from public.finance_invoices where id='fe510000-0000-4000-8000-000000000001'),
  0::numeric,
  'verified allocation reduces invoice balance to zero'
);

select is(
  (select status from public.finance_invoices where id='fe510000-0000-4000-8000-000000000001'),
  'paid',
  'fully allocated verified payment marks issued invoice paid'
);

select throws_ok(
  $$select public.allocate_finance_payment((select id from public.finance_payments where payment_reference='PAY-GOV-001'),'fe510000-0000-4000-8000-000000000001',1)$$,
  'Allocation exceeds unallocated payment amount',
  'payment cannot be over-allocated'
);

select is(
  public.reverse_finance_payment((select id from public.finance_payments where payment_reference='PAY-GOV-001'),'Bank reversal received'),
  true,
  'verified payment can be explicitly reversed with reason'
);

select is(
  (select balance_amount from public.finance_invoices where id='fe510000-0000-4000-8000-000000000001'),
  100::numeric,
  'reversing payment restores invoice balance because reversed allocation is no longer credited'
);

select ok(
  not has_table_privilege('authenticated','public.finance_payments','INSERT')
  and not has_table_privilege('authenticated','public.finance_payments','UPDATE')
  and not has_table_privilege('authenticated','public.finance_payment_allocations','INSERT')
  and not has_table_privilege('authenticated','public.finance_payment_allocations','UPDATE'),
  'authenticated clients cannot bypass governed payment and allocation transitions'
);

select * from finish();
rollback;