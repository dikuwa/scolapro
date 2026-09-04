begin;

select plan(10);

select ok(
  not has_function_privilege('authenticated','app_private.user_can_manage_finance(uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.user_can_manage_finance(uuid,uuid)','EXECUTE'),
  'arbitrary-user finance authority helper remains private'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_finance_invoice_creator_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_finance_invoice_creator_integrity()','EXECUTE'),
  'finance-invoice creator helper remains private'
);

select trigger_is(
  'public','finance_invoices','finance_invoice_creator_integrity_trg',
  'app_private','enforce_finance_invoice_creator_integrity',
  'finance-invoice creator trigger is installed'
);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('f7000000-0000-4000-8000-000000000001','invoice-finance@example.test','authenticated','authenticated',now(),now()),
('f7000000-0000-4000-8000-000000000002','invoice-bursar@example.test','authenticated','authenticated',now(),now()),
('f7000000-0000-4000-8000-000000000003','invoice-unrelated@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f7000000-0000-4000-8000-000000000001','finance_officer',current_date),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f7000000-0000-4000-8000-000000000002','bursar',current_date);

select throws_ok(
  $$insert into public.finance_invoices(tenant_id,school_id,learner_id,academic_year,invoice_number,issued_on,status,currency,total_amount,balance_amount,created_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001',2026,'INV-CREATOR-FORGED',current_date,'draft','NAD',0,0,'f7000000-0000-4000-8000-000000000003')$$,
  'Finance invoice creator is not authorized for school',
  'trusted path cannot forge unrelated finance-invoice creator'
);

select lives_ok(
  $$insert into public.finance_invoices(id,tenant_id,school_id,learner_id,academic_year,invoice_number,issued_on,status,currency,total_amount,balance_amount,created_by_user_id)
    values('f7010000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001',2026,'INV-CREATOR-VALID',current_date,'draft','NAD',0,0,'f7000000-0000-4000-8000-000000000001')$$,
  'trusted path can record authorized finance-invoice creator'
);

select lives_ok(
  $$update public.finance_invoices set invoice_number='INV-CREATOR-VALID-REV' where id='f7010000-0000-4000-8000-000000000001'$$,
  'ordinary finance-invoice edits remain allowed'
);

select throws_ok(
  $$update public.finance_invoices set created_by_user_id='f7000000-0000-4000-8000-000000000002' where id='f7010000-0000-4000-8000-000000000001'$$,
  'Finance invoice creator provenance is immutable',
  'invoice creator cannot be rewritten to another authorized finance manager'
);

select set_config('request.jwt.claim.sub','f7000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select throws_ok(
  $$insert into public.finance_invoices(tenant_id,school_id,learner_id,academic_year,invoice_number,issued_on,status,currency,total_amount,balance_amount,created_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000002',2026,'INV-CLIENT-FORGED',current_date,'draft','NAD',0,0,'f7000000-0000-4000-8000-000000000002')$$,
  'Finance invoice creator must match authenticated actor',
  'authenticated finance manager cannot claim another manager as creator'
);

select lives_ok(
  $$insert into public.finance_invoices(tenant_id,school_id,learner_id,academic_year,invoice_number,issued_on,status,currency,total_amount,balance_amount,created_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000002',2026,'INV-CLIENT-OWN',current_date,'draft','NAD',0,0,'f7000000-0000-4000-8000-000000000001')$$,
  'authenticated finance manager can create invoice under own identity'
);

reset role;

select ok(
  (select with_check from pg_policies where schemaname='public' and tablename='finance_invoices' and policyname='finance staff can manage invoices [insert]') ilike '%created_by_user_id%auth.uid%',
  'finance-invoice insert RLS binds creator to authenticated actor'
);

select * from finish();
rollback;