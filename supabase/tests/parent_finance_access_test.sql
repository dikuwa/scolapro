begin;

select plan(11);

select ok(
  to_regprocedure('public.get_parent_finance_overview()') is not null,
  'child-scoped parent finance overview function exists'
);

select ok(
  not has_function_privilege('anon','public.get_parent_finance_overview()','EXECUTE'),
  'anonymous users cannot access parent finance overview'
);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fc000000-0000-4000-8000-000000000001','parent-finance-isolation@example.test','authenticated','authenticated',now(),now());

insert into public.guardian_profiles(id,tenant_id,first_names,surname,identity_number)
values('fc100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Finance','Guardian','PARENT-FIN-001');

insert into public.learner_guardians(id,tenant_id,learner_id,guardian_id,relationship_type,is_legal_guardian,effective_from)
values('fc200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001','parent',true,current_date-10);

insert into public.guardian_user_links(id,tenant_id,guardian_id,user_id,linked_by_user_id)
values('fc300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fc100000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000001');

insert into public.finance_invoices(
  id,tenant_id,school_id,learner_id,academic_year,invoice_number,issued_on,due_on,status,currency,total_amount,balance_amount,created_by_user_id
)
values
  ('fc400000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001',2026,'PFIN-LINKED-001',current_date-5,current_date+20,'issued','NAD',1200,1200,'fc000000-0000-4000-8000-000000000001'),
  ('fc400000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000002',2026,'PFIN-OTHER-001',current_date-4,current_date+20,'issued','NAD',2200,2200,'fc000000-0000-4000-8000-000000000001');

insert into public.finance_payments(
  id,tenant_id,school_id,learner_id,payment_reference,payment_method,amount,currency,paid_on,status,recorded_by_user_id
)
values
  ('fc500000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','PFIN-PAY-LINKED-001','bank_transfer',300,'NAD',current_date-2,'verified','fc000000-0000-4000-8000-000000000001'),
  ('fc500000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000002','PFIN-PAY-OTHER-001','bank_transfer',450,'NAD',current_date-1,'verified','fc000000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select is(
  jsonb_array_length(public.get_parent_finance_overview()->'invoices'),
  1,
  'parent finance overview returns invoices only for actively linked children'
);

select is(
  public.get_parent_finance_overview()->'invoices'->0->>'invoice_id',
  'fc400000-0000-4000-8000-000000000001',
  'parent finance overview exposes the linked child invoice'
);

select ok(
  not (public.get_parent_finance_overview()->'invoices' @> jsonb_build_array(jsonb_build_object('invoice_id','fc400000-0000-4000-8000-000000000002'))),
  'invoice for an unlinked learner is not exposed to the parent'
);

select is(
  jsonb_array_length(public.get_parent_finance_overview()->'payments'),
  1,
  'parent finance overview returns payments only for actively linked children'
);

select is(
  public.get_parent_finance_overview()->'payments'->0->>'payment_id',
  'fc500000-0000-4000-8000-000000000001',
  'parent finance overview exposes the linked child payment'
);

select ok(
  not (public.get_parent_finance_overview()->'payments' @> jsonb_build_array(jsonb_build_object('payment_id','fc500000-0000-4000-8000-000000000002'))),
  'payment for an unlinked learner is not exposed to the parent'
);

select results_eq(
  $$select id from public.finance_invoices where id='fc400000-0000-4000-8000-000000000001'$$,
  ARRAY[]::uuid[],
  'parent access remains RPC-scoped and does not grant direct finance table reads'
);

reset role;
update public.learner_guardians
set effective_to=current_date-1
where id='fc200000-0000-4000-8000-000000000001';
set local role authenticated;

select is(
  jsonb_array_length(public.get_parent_finance_overview()->'invoices'),
  0,
  'ending the guardian relationship immediately removes child invoices from parent finance access'
);

select is(
  jsonb_array_length(public.get_parent_finance_overview()->'payments'),
  0,
  'ending the guardian relationship immediately removes child payments from parent finance access'
);

reset role;
select * from finish();
rollback;
