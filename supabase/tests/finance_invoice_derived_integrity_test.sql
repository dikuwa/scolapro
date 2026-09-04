begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fe600000-0000-4000-8000-000000000001','invoice-derived@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe600000-0000-4000-8000-000000000001','finance_officer',current_date);

insert into public.finance_invoices(
  id,tenant_id,school_id,learner_id,academic_year,invoice_number,issued_on,status,currency,total_amount,balance_amount,created_by_user_id
) values(
  'fe610000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001',2026,'FIN-DERIVED-001',current_date,'draft','NAD',0,0,'fe600000-0000-4000-8000-000000000001'
);

insert into public.finance_invoice_lines(
  id,tenant_id,school_id,invoice_id,description,quantity,unit_amount
) values(
  'fe620000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe610000-0000-4000-8000-000000000001','Derived line',2,25
);

select is((select total_amount from public.finance_invoices where id='fe610000-0000-4000-8000-000000000001'),50::numeric,'adding invoice line refreshes materialized total');
select is((select balance_amount from public.finance_invoices where id='fe610000-0000-4000-8000-000000000001'),50::numeric,'adding invoice line refreshes materialized balance');
select is((select status from public.finance_invoices where id='fe610000-0000-4000-8000-000000000001'),'draft','line recalculation does not prematurely issue a draft invoice');

update public.finance_invoices
set status='issued',total_amount=999,balance_amount=999
where id='fe610000-0000-4000-8000-000000000001';

select is((select total_amount from public.finance_invoices where id='fe610000-0000-4000-8000-000000000001'),50::numeric,'manual invoice total spoof is replaced by line-derived amount');
select is((select balance_amount from public.finance_invoices where id='fe610000-0000-4000-8000-000000000001'),50::numeric,'manual invoice balance spoof is replaced by verified-allocation-derived balance');

update public.finance_invoice_lines
set quantity=3
where id='fe620000-0000-4000-8000-000000000001';
select is((select total_amount from public.finance_invoices where id='fe610000-0000-4000-8000-000000000001'),75::numeric,'editing invoice line refreshes invoice total automatically');

delete from public.finance_invoice_lines where id='fe620000-0000-4000-8000-000000000001';
select is((select total_amount from public.finance_invoices where id='fe610000-0000-4000-8000-000000000001'),0::numeric,'deleting invoice line safely refreshes invoice total to zero');

select * from finish();
rollback;