begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fe700000-0000-4000-8000-000000000001','finance-scope@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug)
values('fe710000-0000-4000-8000-000000000001','Finance Scope Tenant B','finance-scope-tenant-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('fe720000-0000-4000-8000-000000000001','fe710000-0000-4000-8000-000000000001','Finance Scope School B','FIN-SCOPE-B','Khomas','Windhoek');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe700000-0000-4000-8000-000000000001','finance_officer',current_date),
('fe710000-0000-4000-8000-000000000001','fe720000-0000-4000-8000-000000000001','fe700000-0000-4000-8000-000000000001','finance_officer',current_date);

insert into public.learners(id,tenant_id,first_names,surname,date_of_birth,sex)
values
  ('fe730000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Finance','Learner A','2010-01-01','unspecified'),
  ('fe730000-0000-4000-8000-000000000002','fe710000-0000-4000-8000-000000000001','Finance','Learner B','2010-01-01','unspecified');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values
  ('fe740000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe730000-0000-4000-8000-000000000001',2026,current_date,'current'),
  ('fe740000-0000-4000-8000-000000000002','fe710000-0000-4000-8000-000000000001','fe720000-0000-4000-8000-000000000001','fe730000-0000-4000-8000-000000000002',2026,current_date,'current');

insert into public.finance_charge_types(id,tenant_id,school_id,charge_code,display_name)
values('fe750000-0000-4000-8000-000000000001','fe710000-0000-4000-8000-000000000001','fe720000-0000-4000-8000-000000000001','SCOPE-B','Scope B charge');

select throws_ok(
  $$insert into public.finance_invoices(tenant_id,school_id,learner_id,academic_year,invoice_number,issued_on,status,currency,total_amount,balance_amount,created_by_user_id)
    values('fe710000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222',null,2026,'FIN-SCOPE-BAD-TENANT',current_date,'draft','NAD',0,0,'fe700000-0000-4000-8000-000000000001')$$,
  'Finance scope mismatch: school does not belong to tenant',
  'invoice tenant must match its school tenant'
);

select throws_ok(
  $$insert into public.finance_invoices(tenant_id,school_id,learner_id,academic_year,invoice_number,issued_on,status,currency,total_amount,balance_amount,created_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe730000-0000-4000-8000-000000000002',2026,'FIN-SCOPE-BAD-LEARNER',current_date,'draft','NAD',0,0,'fe700000-0000-4000-8000-000000000001')$$,
  'Finance scope mismatch: learner is not enrolled at school',
  'invoice learner must belong to the same school scope'
);

select lives_ok(
  $$insert into public.finance_invoices(id,tenant_id,school_id,learner_id,academic_year,invoice_number,issued_on,status,currency,total_amount,balance_amount,created_by_user_id)
    values('fe760000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe730000-0000-4000-8000-000000000001',2026,'FIN-SCOPE-A',current_date,'draft','NAD',0,0,'fe700000-0000-4000-8000-000000000001')$$,
  'valid same-school invoice remains allowed'
);

select throws_ok(
  $$insert into public.finance_invoice_lines(tenant_id,school_id,invoice_id,description,quantity,unit_amount)
    values('fe710000-0000-4000-8000-000000000001','fe720000-0000-4000-8000-000000000001','fe760000-0000-4000-8000-000000000001','Cross-school line',1,10)$$,
  'Finance scope mismatch: invoice line must match invoice school',
  'invoice line cannot claim a different school than its invoice'
);

select throws_ok(
  $$insert into public.finance_invoice_lines(tenant_id,school_id,invoice_id,charge_type_id,description,quantity,unit_amount)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe760000-0000-4000-8000-000000000001','fe750000-0000-4000-8000-000000000001','Cross-school charge',1,10)$$,
  'Finance scope mismatch: charge type must match invoice school',
  'invoice line cannot attach a charge type from another school'
);

select lives_ok(
  $$insert into public.finance_invoices(id,tenant_id,school_id,learner_id,academic_year,invoice_number,issued_on,status,currency,total_amount,balance_amount,created_by_user_id)
    values('fe760000-0000-4000-8000-000000000002','fe710000-0000-4000-8000-000000000001','fe720000-0000-4000-8000-000000000001','fe730000-0000-4000-8000-000000000002',2026,'FIN-SCOPE-B',current_date,'issued','NAD',0,0,'fe700000-0000-4000-8000-000000000001')$$,
  'valid second-school invoice remains allowed'
);

select lives_ok(
  $$insert into public.finance_payments(id,tenant_id,school_id,learner_id,payment_reference,payment_method,amount,currency,paid_on,status,recorded_by_user_id)
    values('fe770000-0000-4000-8000-000000000001','fe710000-0000-4000-8000-000000000001','fe720000-0000-4000-8000-000000000001','fe730000-0000-4000-8000-000000000002','PAY-SCOPE-B','bank_transfer',10,'NAD',current_date,'verified','fe700000-0000-4000-8000-000000000001')$$,
  'valid same-school payment remains allowed'
);

select throws_ok(
  $$insert into public.finance_payment_allocations(tenant_id,school_id,payment_id,invoice_id,amount,allocated_by_user_id)
    values('fe710000-0000-4000-8000-000000000001','fe720000-0000-4000-8000-000000000001','fe770000-0000-4000-8000-000000000001','fe760000-0000-4000-8000-000000000001',10,'fe700000-0000-4000-8000-000000000001')$$,
  'Finance scope mismatch: allocation must match invoice school',
  'allocation cannot bridge a payment and invoice across schools'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_finance_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_finance_scope_integrity()','EXECUTE'),
  'finance scope trigger helper is not directly executable by client roles'
);

select * from finish();
rollback;
