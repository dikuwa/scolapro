begin;

select plan(16);

insert into public.tenants(id,name,slug)
values('63410000-0000-4000-8000-000000000001','Finance Lookup Tenant','finance-lookup-634');

insert into public.schools(id,tenant_id,name,emis_number,status)
values
  ('63420000-0000-4000-8000-000000000001','63410000-0000-4000-8000-000000000001','Finance Lookup School','FIN-634-A','active'),
  ('63420000-0000-4000-8000-000000000002','63410000-0000-4000-8000-000000000001','Finance Lookup Other School','FIN-634-B','active'),
  ('63420000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','Finance Lookup Other Tenant','FIN-634-C','active');

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('63430000-0000-4000-8000-000000000001','finance-634-admin@example.test','authenticated','authenticated',now(),now()),
  ('63430000-0000-4000-8000-000000000002','finance-634-principal@example.test','authenticated','authenticated',now(),now()),
  ('63430000-0000-4000-8000-000000000003','finance-634-officer@example.test','authenticated','authenticated',now(),now()),
  ('63430000-0000-4000-8000-000000000004','finance-634-bursar@example.test','authenticated','authenticated',now(),now()),
  ('63430000-0000-4000-8000-000000000005','finance-634-teacher@example.test','authenticated','authenticated',now(),now()),
  ('63430000-0000-4000-8000-000000000006','finance-634-other-school@example.test','authenticated','authenticated',now(),now()),
  ('63430000-0000-4000-8000-000000000007','finance-634-support@example.test','authenticated','authenticated',now(),now()),
  ('63430000-0000-4000-8000-000000000008','finance-634-platform-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values
  ('63410000-0000-4000-8000-000000000001','63420000-0000-4000-8000-000000000001','63430000-0000-4000-8000-000000000001','school_admin',current_date-30),
  ('63410000-0000-4000-8000-000000000001','63420000-0000-4000-8000-000000000001','63430000-0000-4000-8000-000000000002','principal',current_date-30),
  ('63410000-0000-4000-8000-000000000001','63420000-0000-4000-8000-000000000001','63430000-0000-4000-8000-000000000003','finance_officer',current_date-30),
  ('63410000-0000-4000-8000-000000000001','63420000-0000-4000-8000-000000000001','63430000-0000-4000-8000-000000000004','bursar',current_date-30),
  ('63410000-0000-4000-8000-000000000001','63420000-0000-4000-8000-000000000001','63430000-0000-4000-8000-000000000005','teacher',current_date-30),
  ('63410000-0000-4000-8000-000000000001','63420000-0000-4000-8000-000000000002','63430000-0000-4000-8000-000000000006','finance_officer',current_date-30),
  ('63410000-0000-4000-8000-000000000001','63420000-0000-4000-8000-000000000001','63430000-0000-4000-8000-000000000007','finance_officer',current_date-30);

insert into public.platform_memberships(user_id,role_key,active_from)
values
  ('63430000-0000-4000-8000-000000000007','platform_support',current_date-30),
  ('63430000-0000-4000-8000-000000000008','platform_admin',current_date-30);

insert into public.learners(id,tenant_id,first_names,surname,date_of_birth,sex)
select
  ('63460000-0000-4000-8000-' || lpad(gs::text,12,'0'))::uuid,
  '63410000-0000-4000-8000-000000000001',
  'Finance',
  format('Lookup %s', lpad(gs::text,2,'0')),
  '2010-01-01',
  'unspecified'
from generate_series(1,25) as series(gs);

insert into public.learners(id,tenant_id,first_names,surname,date_of_birth,sex)
values
  ('63460000-0000-4000-8000-000000000026','63410000-0000-4000-8000-000000000001','Ended','Lookup','2010-01-01','unspecified'),
  ('63460000-0000-4000-8000-000000000027','63410000-0000-4000-8000-000000000001','Future','Lookup','2010-01-01','unspecified');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,admission_number,enrolled_from,enrolled_to,status)
select
  ('63470000-0000-4000-8000-' || lpad(gs::text,12,'0'))::uuid,
  '63410000-0000-4000-8000-000000000001',
  '63420000-0000-4000-8000-000000000001',
  ('63460000-0000-4000-8000-' || lpad(gs::text,12,'0'))::uuid,
  2026,
  format('FIN-634-%s', lpad(gs::text,3,'0')),
  current_date-60,
  null,
  'current'
from generate_series(1,25) as series(gs);

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,admission_number,enrolled_from,enrolled_to,status)
values
  ('63470000-0000-4000-8000-000000000026','63410000-0000-4000-8000-000000000001','63420000-0000-4000-8000-000000000001','63460000-0000-4000-8000-000000000026',2026,'FIN-634-END',current_date-60,current_date-1,'current'),
  ('63470000-0000-4000-8000-000000000027','63410000-0000-4000-8000-000000000001','63420000-0000-4000-8000-000000000001','63460000-0000-4000-8000-000000000027',2026,'FIN-634-FUTURE',(now() at time zone 'Africa/Windhoek')::date+1,null,'current');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','63430000-0000-4000-8000-000000000001',true);
select is(
  (select count(*)::integer from public.search_finance_learners('63420000-0000-4000-8000-000000000001','Finance',100)),
  20,
  'school admin lookup is finance-authorized and capped at 20 results'
);

select set_config('request.jwt.claim.sub','63430000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.search_finance_learners('63420000-0000-4000-8000-000000000001','FIN-634-001',20)),1,'principal can search current finance learners');

select set_config('request.jwt.claim.sub','63430000-0000-4000-8000-000000000003',true);
select is((select count(*)::integer from public.search_finance_learners('63420000-0000-4000-8000-000000000001','FIN-634-010',20)),1,'finance officer can search by admission number');

select set_config('request.jwt.claim.sub','63430000-0000-4000-8000-000000000004',true);
select is((select count(*)::integer from public.search_finance_learners('63420000-0000-4000-8000-000000000001','Lookup',20)),20,'bursar receives bounded learner results');

select is((select count(*)::integer from public.search_finance_learners('63420000-0000-4000-8000-000000000001','FIN-634-END',20)),0,'ended current-status enrolments are excluded');
select is((select count(*)::integer from public.search_finance_learners('63420000-0000-4000-8000-000000000001','FIN-634-FUTURE',20)),0,'future current-status enrolments are excluded');

select set_config('request.jwt.claim.sub','63430000-0000-4000-8000-000000000005',true);
select throws_ok(
  $$select * from public.search_finance_learners('63420000-0000-4000-8000-000000000001','Finance',20)$$,
  'Permission denied',
  'unrelated school actor is denied finance learner search'
);

select set_config('request.jwt.claim.sub','63430000-0000-4000-8000-000000000006',true);
select throws_ok(
  $$select * from public.search_finance_learners('63420000-0000-4000-8000-000000000001','Finance',20)$$,
  'Permission denied',
  'finance membership at another school cannot cross school scope'
);

select set_config('request.jwt.claim.sub','63430000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$select * from public.search_finance_learners('63420000-0000-4000-8000-000000000003','Finance',20)$$,
  'Permission denied',
  'finance lookup cannot cross tenant scope'
);

select set_config('request.jwt.claim.sub','63430000-0000-4000-8000-000000000007',true);
select throws_ok(
  $$select * from public.search_finance_learners('63420000-0000-4000-8000-000000000001','Finance',20)$$,
  'Permission denied',
  'Platform Support cannot use finance learner search'
);

select set_config('request.jwt.claim.sub','63430000-0000-4000-8000-000000000008',true);
select lives_ok(
  $$select * from public.search_finance_learners('63420000-0000-4000-8000-000000000001','FIN-634-001',20)$$,
  'governed Platform Admin retains existing finance RPC authority'
);

select set_config('request.jwt.claim.sub','63430000-0000-4000-8000-000000000003',true);
select lives_ok(
  $$select public.record_finance_payment('63420000-0000-4000-8000-000000000001',null,'FIN-634-SCHOOL','cash',10,current_date,null,null)$$,
  'school-level payment without a learner remains valid'
);

select lives_ok(
  $$select public.record_finance_payment('63420000-0000-4000-8000-000000000001','63460000-0000-4000-8000-000000000001','FIN-634-LEARNER','bank_transfer',25,current_date,'BANK-634',null)$$,
  'learner-linked payment keeps the canonical mutation'
);

select is(
  (select display_name from public.get_finance_payment_learner_labels(
    '63420000-0000-4000-8000-000000000001',
    array['63460000-0000-4000-8000-000000000001']::uuid[]
  )),
  'Finance Lookup 01',
  'recent payment rows retain bounded learner labels'
);

select is(
  (select count(*)::integer from public.get_finance_payment_learner_labels(
    '63420000-0000-4000-8000-000000000001',
    array['63460000-0000-4000-8000-000000000026']::uuid[]
  )),
  0,
  'payment label lookup does not expose arbitrary learner IDs'
);

reset role;
select ok(
  has_function_privilege('authenticated','public.search_finance_learners(uuid,text,integer)','EXECUTE')
  and has_function_privilege('authenticated','public.get_finance_payment_learner_labels(uuid,uuid[])','EXECUTE')
  and not has_function_privilege('anon','public.search_finance_learners(uuid,text,integer)','EXECUTE'),
  'finance lookup RPCs are authenticated-only'
);

select * from finish();
rollback;
