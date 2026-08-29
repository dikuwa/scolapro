-- Parent finance is exposed through a narrow child-scoped read model rather than by
-- broadening finance table RLS. Guardian access must be an active effective-dated
-- relationship linked to the authenticated user.

create or replace function public.get_parent_finance_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,app_private
as $$
declare
  v_user_id uuid := auth.uid();
  v_invoices jsonb;
  v_payments jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  with linked_learners as (
    select distinct lg.learner_id
    from public.guardian_user_links gul
    join public.learner_guardians lg on lg.guardian_id=gul.guardian_id
    where gul.user_id=v_user_id
      and lg.effective_from<=current_date
      and (lg.effective_to is null or lg.effective_to>=current_date)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'invoice_id',fi.id,
    'learner_id',fi.learner_id,
    'academic_year',fi.academic_year,
    'invoice_number',fi.invoice_number,
    'issued_on',fi.issued_on,
    'due_on',fi.due_on,
    'status',fi.status,
    'currency',fi.currency,
    'total_amount',fi.total_amount,
    'balance_amount',fi.balance_amount
  ) order by fi.issued_on desc,fi.invoice_number desc),'[]'::jsonb)
  into v_invoices
  from public.finance_invoices fi
  join linked_learners ll on ll.learner_id=fi.learner_id
  where fi.status in ('issued','partially_paid','paid','written_off');

  with linked_learners as (
    select distinct lg.learner_id
    from public.guardian_user_links gul
    join public.learner_guardians lg on lg.guardian_id=gul.guardian_id
    where gul.user_id=v_user_id
      and lg.effective_from<=current_date
      and (lg.effective_to is null or lg.effective_to>=current_date)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'payment_id',fp.id,
    'learner_id',fp.learner_id,
    'payment_reference',fp.payment_reference,
    'payment_method',fp.payment_method,
    'amount',fp.amount,
    'currency',fp.currency,
    'paid_on',fp.paid_on,
    'status',fp.status
  ) order by fp.paid_on desc,fp.created_at desc),'[]'::jsonb)
  into v_payments
  from public.finance_payments fp
  join linked_learners ll on ll.learner_id=fp.learner_id
  where fp.status in ('received','verified','rejected','reversed');

  return jsonb_build_object(
    'invoices',coalesce(v_invoices,'[]'::jsonb),
    'payments',coalesce(v_payments,'[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_parent_finance_overview() from public,anon;
grant execute on function public.get_parent_finance_overview() to authenticated;

comment on function public.get_parent_finance_overview() is
'Child-scoped parent finance read model. Excludes internal invoice/payment notes, proof paths, staff identities and finance access to unrelated learners.';
