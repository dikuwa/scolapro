begin;

select plan(19);

insert into public.tenants(id,name,slug) values
  ('51810000-0000-4000-8000-000000000001','Finance QA Other Tenant','finance-qa-other');

insert into public.schools(id,tenant_id,name,emis_number,status) values
  ('51820000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Finance QA Later School','FIN-QA-LATER','active'),
  ('51820000-0000-4000-8000-000000000002','51810000-0000-4000-8000-000000000001','Finance QA Cross Tenant School','FIN-QA-XTEN','active');

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('51830000-0000-4000-8000-000000000001','finance-qa-current@example.test','authenticated','authenticated',now(),now()),
  ('51830000-0000-4000-8000-000000000002','finance-qa-multischool@example.test','authenticated','authenticated',now(),now()),
  ('51830000-0000-4000-8000-000000000003','finance-qa-stale@example.test','authenticated','authenticated',now(),now()),
  ('51830000-0000-4000-8000-000000000004','finance-qa-support@example.test','authenticated','authenticated',now(),now()),
  ('51830000-0000-4000-8000-000000000005','finance-qa-parent@example.test','authenticated','authenticated',now(),now()),
  ('51830000-0000-4000-8000-000000000006','finance-qa-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values(
  '51840000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '51830000-0000-4000-8000-000000000003',
  'FIN-QA-STALE',
  'Stale',
  'Finance',
  'active'
);

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values(
  '51850000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '51840000-0000-4000-8000-000000000001',
  'staff',
  current_date-60,
  current_date-1,
  '51830000-0000-4000-8000-000000000001'
);

insert into public.school_memberships(
  tenant_id,school_id,user_id,staff_member_id,role_key,active_from
) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','51830000-0000-4000-8000-000000000001',null,'finance_officer',current_date-30),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','51830000-0000-4000-8000-000000000002',null,'bursar',current_date-60),
  ('11111111-1111-4111-8111-111111111111','51820000-0000-4000-8000-000000000001','51830000-0000-4000-8000-000000000002',null,'teacher',current_date-1),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','51830000-0000-4000-8000-000000000003','51840000-0000-4000-8000-000000000001','finance_officer',current_date-60),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','51830000-0000-4000-8000-000000000004',null,'finance_officer',current_date-30),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','51830000-0000-4000-8000-000000000006',null,'teacher',current_date-30);

insert into public.platform_memberships(user_id,role_key,active_from)
values('51830000-0000-4000-8000-000000000004','platform_support',current_date-30);

insert into public.learners(id,tenant_id,first_names,surname,date_of_birth,sex)
values(
  '51860000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Finance',
  'Learner',
  '2010-01-01',
  'unspecified'
);

insert into public.enrolments(
  id,tenant_id,school_id,learner_id,academic_year,admission_number,enrolled_from,status
) values(
  '51870000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '51860000-0000-4000-8000-000000000001',
  2026,
  'FIN-QA-001',
  current_date-60,
  'current'
);

insert into public.guardian_profiles(id,tenant_id,first_names,surname,identity_number)
values(
  '51880000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Finance',
  'Parent',
  'FIN-QA-PARENT'
);

insert into public.learner_guardians(
  id,tenant_id,learner_id,guardian_id,relationship_type,is_legal_guardian,effective_from
) values(
  '51890000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '51860000-0000-4000-8000-000000000001',
  '51880000-0000-4000-8000-000000000001',
  'parent',
  true,
  current_date-60
);

insert into public.guardian_user_links(id,tenant_id,guardian_id,user_id,linked_by_user_id)
values(
  '518a0000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '51880000-0000-4000-8000-000000000001',
  '51830000-0000-4000-8000-000000000005',
  '51830000-0000-4000-8000-000000000005'
);

insert into public.finance_invoices(
  id,tenant_id,school_id,learner_id,academic_year,invoice_number,issued_on,due_on,status,currency,total_amount,balance_amount,created_by_user_id
) values(
  '518b0000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '51860000-0000-4000-8000-000000000001',
  2026,
  'FIN-QA-INV-001',
  current_date-10,
  current_date+20,
  'issued',
  'NAD',
  100,
  100,
  '51830000-0000-4000-8000-000000000001'
);

insert into public.finance_payments(
  id,tenant_id,school_id,learner_id,payment_reference,payment_method,amount,currency,paid_on,status,recorded_by_user_id
) values(
  '518c0000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '51860000-0000-4000-8000-000000000001',
  'FIN-QA-PAY-001',
  'bank_transfer',
  50,
  'NAD',
  current_date-5,
  'received',
  '51830000-0000-4000-8000-000000000001'
);

select ok(
  app_private.user_can_manage_finance(
    '51830000-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222'
  ),
  'current-school finance officer retains finance authority'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','51830000-0000-4000-8000-000000000002',true);
set local role authenticated;

select ok(
  not app_private.can_manage_finance('22222222-2222-4222-8222-222222222222'),
  'older finance membership does not retain authenticated authority after deterministic current school changes'
);

reset role;

select ok(
  not app_private.user_can_manage_finance(
    '51830000-0000-4000-8000-000000000003',
    '22222222-2222-4222-8222-222222222222'
  ),
  'ended authoritative staff placement removes finance authority'
);

select ok(
  not app_private.user_can_manage_finance(
    '51830000-0000-4000-8000-000000000004',
    '22222222-2222-4222-8222-222222222222'
  ),
  'Platform Support remains outside school finance even with a finance membership'
);

select ok(
  not app_private.user_can_manage_finance(
    '51830000-0000-4000-8000-000000000006',
    '22222222-2222-4222-8222-222222222222'
  ),
  'ordinary teacher does not gain finance-manager authority'
);

select ok(
  not app_private.user_can_manage_finance(
    '51830000-0000-4000-8000-000000000001',
    '51820000-0000-4000-8000-000000000002'
  ),
  'current finance officer cannot manage a cross-tenant school'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','51830000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.save_school_payment_settings(
    '22222222-2222-4222-8222-222222222222',
    'Finance QA Bank',
    'Finance QA Account',
    '123456789',
    'Main Branch',
    '001',
    'Current',
    'Use the learner admission number',
    'Pay using the published school account only',
    true
  )$$,
  'current finance officer can save own-school payment settings'
);

select is(
  (select count(*)::integer from public.school_payment_settings where school_id='22222222-2222-4222-8222-222222222222'),
  1,
  'current finance officer can read own-school raw payment settings'
);

select throws_ok(
  $$select public.save_school_payment_settings(
    '51820000-0000-4000-8000-000000000002',
    'Other Bank','Other Account','999',null,null,null,null,null,true
  )$$,
  'Permission denied',
  'finance settings mutation cannot cross tenant scope'
);

reset role;
select set_config('request.jwt.claim.sub','51830000-0000-4000-8000-000000000004',true);
set local role authenticated;

select is(
  (select count(*)::integer from public.school_payment_settings where school_id='22222222-2222-4222-8222-222222222222'),
  0,
  'Platform Support cannot read raw school payment settings'
);

select throws_ok(
  $$select public.save_school_payment_settings(
    '22222222-2222-4222-8222-222222222222',
    'Support Bank','Support Account','123',null,null,null,null,null,true
  )$$,
  'Permission denied',
  'Platform Support cannot mutate school payment settings through mixed membership'
);

reset role;
select set_config('request.jwt.claim.sub','51830000-0000-4000-8000-000000000005',true);
set local role authenticated;

select is(
  jsonb_array_length(public.get_parent_finance_overview()->'invoices'),
  1,
  'current guardian sees issued finance records for a currently enrolled linked learner'
);

select is(
  jsonb_array_length(public.get_parent_finance_overview()->'payments'),
  1,
  'current guardian sees payer-safe payment records for a currently enrolled linked learner'
);

reset role;

update public.enrolments
set enrolled_to=current_date-1,
    status='completed'
where id='51870000-0000-4000-8000-000000000001';

insert into public.enrolments(
  id,tenant_id,school_id,learner_id,academic_year,admission_number,enrolled_from,status
) values(
  '51870000-0000-4000-8000-000000000002',
  '11111111-1111-4111-8111-111111111111',
  '51820000-0000-4000-8000-000000000001',
  '51860000-0000-4000-8000-000000000001',
  2026,
  'FIN-QA-TRANSFER',
  current_date,
  'current'
);

set local role authenticated;

select is(
  jsonb_array_length(public.get_parent_finance_overview()->'invoices'),
  0,
  'former-school invoices are not exposed after the linked learner transfers to another current school'
);

select is(
  jsonb_array_length(public.get_parent_finance_overview()->'payments'),
  0,
  'former-school payment records are not exposed after the linked learner transfers to another current school'
);

reset role;

select ok(
  not has_function_privilege('authenticated','app_private.user_can_manage_finance(uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.user_can_manage_finance(uuid,uuid)','EXECUTE'),
  'arbitrary-user finance authority helper remains private'
);

select ok(
  has_function_privilege('authenticated','public.get_parent_finance_overview()','EXECUTE')
  and not has_function_privilege('anon','public.get_parent_finance_overview()','EXECUTE'),
  'parent finance read model remains authenticated-only'
);

select ok(
  not has_table_privilege('authenticated','public.finance_payments','INSERT')
  and not has_table_privilege('authenticated','public.finance_payments','UPDATE')
  and not has_table_privilege('authenticated','public.finance_payment_allocations','INSERT')
  and not has_table_privilege('authenticated','public.finance_payment_allocations','UPDATE'),
  'canonical payment/allocation ledger mutations remain governed RPC-only'
);

select ok(
  exists(
    select 1
    from public.finance_invoices
    where id='518b0000-0000-4000-8000-000000000001'
      and status='issued'
      and created_by_user_id='51830000-0000-4000-8000-000000000001'
  ),
  'parent visibility hardening does not rewrite historical invoice facts'
);

select * from finish();
rollback;
