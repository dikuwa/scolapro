begin;

select plan(10);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fd800000-0000-4000-8000-000000000001','finance-lifecycle@example.test','authenticated','authenticated',now(),now()),
  ('fd800000-0000-4000-8000-000000000002','finance-lifecycle-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd800000-0000-4000-8000-000000000001','finance_officer',current_date-30),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd800000-0000-4000-8000-000000000002','teacher',current_date-30);

insert into public.learners(id,tenant_id,first_names,surname) values
  ('fd810000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Ended','Finance Learner'),
  ('fd810000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Current','Finance Learner');

insert into public.enrolments(
  id,tenant_id,school_id,learner_id,academic_year,admission_number,enrolled_from,enrolled_to,status
) values
  ('fd820000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd810000-0000-4000-8000-000000000001',extract(year from current_date)::integer,'FIN-END-001',current_date-90,current_date-30,'current'),
  ('fd820000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd810000-0000-4000-8000-000000000002',extract(year from current_date)::integer,'FIN-CUR-001',current_date-90,null,'current');

select throws_ok(
  $$insert into public.finance_invoices(
      tenant_id,school_id,learner_id,academic_year,invoice_number,issued_on,status,currency,total_amount,balance_amount,created_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd810000-0000-4000-8000-000000000001',
      extract(year from current_date)::integer,'FIN-END-CURRENT',current_date,'draft','NAD',0,0,'fd800000-0000-4000-8000-000000000001'
    )$$,
  'Finance invoice learner is not enrolled at this school on the invoice date and year',
  'ended enrolment cannot receive a new current learner-linked invoice'
);

select throws_ok(
  $$insert into public.finance_invoices(
      tenant_id,school_id,learner_id,academic_year,invoice_number,issued_on,status,currency,total_amount,balance_amount,created_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd810000-0000-4000-8000-000000000002',
      extract(year from current_date)::integer-1,'FIN-WRONG-YEAR',current_date,'draft','NAD',0,0,'fd800000-0000-4000-8000-000000000001'
    )$$,
  'Finance invoice learner is not enrolled at this school on the invoice date and year',
  'learner invoice year must match canonical enrolment year'
);

select lives_ok(
  $$insert into public.finance_invoices(
      id,tenant_id,school_id,learner_id,academic_year,invoice_number,issued_on,status,currency,total_amount,balance_amount,created_by_user_id
    ) values(
      'fd830000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd810000-0000-4000-8000-000000000002',
      extract(year from current_date)::integer,'FIN-CURRENT-001',current_date,'draft','NAD',0,0,'fd800000-0000-4000-8000-000000000001'
    )$$,
  'effective current enrolment can receive learner-linked invoice'
);

update public.finance_invoices set status='issued' where id='fd830000-0000-4000-8000-000000000001';

select throws_ok(
  $$update public.finance_invoices
      set issued_on=current_date-120
    where id='fd830000-0000-4000-8000-000000000001'$$,
  'Issued finance invoice learner, school, year, and issue date are immutable',
  'issued invoice enrolment identity cannot be silently rewritten'
);

select throws_ok(
  $$update public.finance_invoices
      set status='cancelled'
    where id='fd830000-0000-4000-8000-000000000001'$$,
  'Finance invoice terminal status requires governed workflow',
  'direct finance invoice cancellation cannot bypass governed audit'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fd800000-0000-4000-8000-000000000002',true);

select throws_ok(
  $$select public.finalize_finance_invoice('fd830000-0000-4000-8000-000000000001','cancelled','teacher attempt')$$,
  'Permission denied',
  'teacher cannot perform finance-only invoice finalization'
);

select set_config('request.jwt.claim.sub','fd800000-0000-4000-8000-000000000001',true);

select is(
  public.finalize_finance_invoice('fd830000-0000-4000-8000-000000000001','cancelled','charge raised in error'),
  true,
  'finance officer can finalize eligible invoice through governed workflow'
);

select is(
  (select status from public.finance_invoices where id='fd830000-0000-4000-8000-000000000001'),
  'cancelled',
  'governed finalization persists terminal invoice state'
);

select throws_ok(
  $$update public.finance_invoices
      set status='issued'
    where id='fd830000-0000-4000-8000-000000000001'$$,
  'Terminal finance invoice status is immutable',
  'cancelled invoice cannot be silently reopened'
);

select ok(
  (select count(*)=1 from public.audit_events
   where event_type='finance.invoice.cancelled'
     and entity_type='finance_invoice'
     and entity_id='fd830000-0000-4000-8000-000000000001')
  and not has_function_privilege('anon','public.finalize_finance_invoice(uuid,text,text)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_finance_invoice_enrolment_period_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_finance_invoice_lifecycle_finality()','EXECUTE'),
  'terminal transition is audited and private integrity helpers are not client-executable'
);

select * from finish();
rollback;
