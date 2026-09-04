begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fc100000-0000-4000-8000-000000000001','finance-learner-integrity@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc100000-0000-4000-8000-000000000001','finance_officer',current_date);

insert into public.learners(id,tenant_id,first_names,surname)
values
  ('fc110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Finance','Learner A'),
  ('fc110000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Finance','Learner B');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values
  ('fc120000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc110000-0000-4000-8000-000000000001',2026,current_date-30,'current'),
  ('fc120000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc110000-0000-4000-8000-000000000002',2026,current_date-30,'current');

insert into public.finance_invoices(
  id,tenant_id,school_id,learner_id,academic_year,invoice_number,issued_on,due_on,status,currency,total_amount,balance_amount,created_by_user_id
) values
  ('fc130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc110000-0000-4000-8000-000000000001',2026,'FIN-LRN-A',current_date,current_date+30,'issued','NAD',100,100,'fc100000-0000-4000-8000-000000000001'),
  ('fc130000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc110000-0000-4000-8000-000000000002',2026,'FIN-LRN-B',current_date,current_date+30,'issued','NAD',100,100,'fc100000-0000-4000-8000-000000000001'),
  ('fc130000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',null,2026,'FIN-SCHOOL',current_date,current_date+30,'issued','NAD',100,100,'fc100000-0000-4000-8000-000000000001');

insert into public.finance_invoice_lines(tenant_id,school_id,invoice_id,description,quantity,unit_amount)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc130000-0000-4000-8000-000000000001','Learner A item',1,100),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc130000-0000-4000-8000-000000000002','Learner B item',1,100),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc130000-0000-4000-8000-000000000003','School-level item',1,100);

insert into public.finance_payments(
  id,tenant_id,school_id,learner_id,payment_reference,payment_method,amount,currency,paid_on,status,recorded_by_user_id
) values
  ('fc140000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc110000-0000-4000-8000-000000000001','PAY-LRN-A','cash',200,'NAD',current_date,'received','fc100000-0000-4000-8000-000000000001'),
  ('fc140000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',null,'PAY-SCHOOL','cash',100,'NAD',current_date,'received','fc100000-0000-4000-8000-000000000001');

update public.finance_payments
set status='verified', verified_by_user_id='fc100000-0000-4000-8000-000000000001', verified_at=now()
where id in ('fc140000-0000-4000-8000-000000000001','fc140000-0000-4000-8000-000000000002');

select set_config('request.jwt.claim.sub','fc100000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select throws_ok(
  $$select public.allocate_finance_payment('fc140000-0000-4000-8000-000000000001','fc130000-0000-4000-8000-000000000002',50)$$,
  'Finance allocation learner mismatch: payment and invoice belong to different learners',
  'learner-specific payment cannot be credited to another learner invoice in the same school'
);

select is(
  (select count(*)::integer from public.finance_payment_allocations where payment_id='fc140000-0000-4000-8000-000000000001' and invoice_id='fc130000-0000-4000-8000-000000000002'),
  0,
  'rejected cross-learner RPC allocation persists no row'
);

select lives_ok(
  $$select public.allocate_finance_payment('fc140000-0000-4000-8000-000000000001','fc130000-0000-4000-8000-000000000001',50)$$,
  'learner-specific payment can still credit the matching learner invoice'
);

select lives_ok(
  $$select public.allocate_finance_payment('fc140000-0000-4000-8000-000000000002','fc130000-0000-4000-8000-000000000002',50)$$,
  'school-level unassigned payment can still be allocated to a learner invoice'
);

select lives_ok(
  $$select public.allocate_finance_payment('fc140000-0000-4000-8000-000000000001','fc130000-0000-4000-8000-000000000003',50)$$,
  'learner-specific payment can still be applied to a genuinely school-level invoice under existing semantics'
);

reset role;

select throws_ok(
  $$insert into public.finance_payment_allocations(tenant_id,school_id,payment_id,invoice_id,amount,allocated_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc140000-0000-4000-8000-000000000001','fc130000-0000-4000-8000-000000000002',1,'fc100000-0000-4000-8000-000000000001')$$,
  'Finance allocation learner mismatch: payment and invoice belong to different learners',
  'physical allocation trigger blocks direct cross-learner writes as well'
);

select is(
  (select count(*)::integer from public.finance_payment_allocations where payment_id='fc140000-0000-4000-8000-000000000001' and invoice_id='fc130000-0000-4000-8000-000000000002'),
  0,
  'physical rejection leaves no cross-learner allocation behind'
);

select * from finish();
rollback;
