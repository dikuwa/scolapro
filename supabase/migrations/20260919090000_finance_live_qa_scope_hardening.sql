-- Issue #518: finance live/source QA hardening.
--
-- Preserve the canonical finance/payment ledger. Tighten current-school/current-placement
-- authority and parent current-enrolment visibility without introducing accounting ERP state.

create or replace function app_private.user_can_manage_finance(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  with today as (
    select (now() at time zone 'Africa/Windhoek')::date as value
  )
  select p_user_id is not null
    and p_school_id is not null
    and not exists (
      select 1
      from public.platform_memberships pm, today t
      where pm.user_id = p_user_id
        and pm.role_key = 'platform_support'
        and pm.active_from <= t.value
        and (pm.active_to is null or pm.active_to >= t.value)
    )
    and (
      exists (
        select 1
        from public.platform_memberships pm, today t
        where pm.user_id = p_user_id
          and pm.role_key = 'platform_admin'
          and pm.active_from <= t.value
          and (pm.active_to is null or pm.active_to >= t.value)
      )
      or exists (
        select 1
        from public.school_memberships sm, today t
        where sm.user_id = p_user_id
          and sm.school_id = p_school_id
          and sm.role_key in ('school_admin','principal','finance_officer','bursar')
          and sm.active_from <= t.value
          and (sm.active_to is null or sm.active_to >= t.value)
          and (
            sm.staff_member_id is null
            or app_private.staff_member_covers_school_period(
              sm.staff_member_id,
              p_school_id,
              t.value,
              t.value
            )
          )
      )
    );
$$;

revoke all on function app_private.user_can_manage_finance(uuid,uuid)
  from public, anon, authenticated;

create or replace function app_private.can_manage_finance(
  target_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  with today as (
    select (now() at time zone 'Africa/Windhoek')::date as value
  ),
  actor as (
    select (select auth.uid()) as user_id
  ),
  current_school as (
    select sm.school_id
    from public.school_memberships sm
    join actor a on a.user_id = sm.user_id
    cross join today t
    where sm.active_from <= t.value
      and (sm.active_to is null or sm.active_to >= t.value)
    order by sm.active_from desc, sm.id asc
    limit 1
  ),
  governed_platform_admin as (
    select exists (
      select 1
      from public.platform_memberships pm
      join actor a on a.user_id = pm.user_id
      cross join today t
      where pm.role_key = 'platform_admin'
        and pm.active_from <= t.value
        and (pm.active_to is null or pm.active_to >= t.value)
    ) as allowed
  )
  select (select user_id from actor) is not null
    and app_private.user_can_manage_finance((select user_id from actor), target_school_id)
    and (
      (select allowed from governed_platform_admin)
      or exists (
        select 1 from current_school cs where cs.school_id = target_school_id
      )
    );
$$;

revoke all on function app_private.can_manage_finance(uuid) from public, anon;
grant execute on function app_private.can_manage_finance(uuid) to authenticated;

create or replace function public.get_parent_finance_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := (now() at time zone 'Africa/Windhoek')::date;
  v_invoices jsonb;
  v_payments jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  with linked_current_school_learners as (
    select distinct lg.learner_id, e.school_id
    from public.guardian_user_links gul
    join public.learner_guardians lg
      on lg.guardian_id = gul.guardian_id
    join public.enrolments e
      on e.learner_id = lg.learner_id
     and e.status = 'current'
     and e.enrolled_from <= v_today
     and (e.enrolled_to is null or e.enrolled_to >= v_today)
    where gul.user_id = v_user_id
      and lg.effective_from <= v_today
      and (lg.effective_to is null or lg.effective_to >= v_today)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'invoice_id', fi.id,
    'learner_id', fi.learner_id,
    'academic_year', fi.academic_year,
    'invoice_number', fi.invoice_number,
    'issued_on', fi.issued_on,
    'due_on', fi.due_on,
    'status', fi.status,
    'currency', fi.currency,
    'total_amount', fi.total_amount,
    'balance_amount', fi.balance_amount
  ) order by fi.issued_on desc, fi.invoice_number desc), '[]'::jsonb)
  into v_invoices
  from public.finance_invoices fi
  join linked_current_school_learners ll
    on ll.learner_id = fi.learner_id
   and ll.school_id = fi.school_id
  where fi.status in ('issued','partially_paid','paid','written_off');

  with linked_current_school_learners as (
    select distinct lg.learner_id, e.school_id
    from public.guardian_user_links gul
    join public.learner_guardians lg
      on lg.guardian_id = gul.guardian_id
    join public.enrolments e
      on e.learner_id = lg.learner_id
     and e.status = 'current'
     and e.enrolled_from <= v_today
     and (e.enrolled_to is null or e.enrolled_to >= v_today)
    where gul.user_id = v_user_id
      and lg.effective_from <= v_today
      and (lg.effective_to is null or lg.effective_to >= v_today)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'payment_id', fp.id,
    'learner_id', fp.learner_id,
    'payment_reference', fp.payment_reference,
    'payment_method', fp.payment_method,
    'amount', fp.amount,
    'currency', fp.currency,
    'paid_on', fp.paid_on,
    'status', fp.status
  ) order by fp.paid_on desc, fp.created_at desc), '[]'::jsonb)
  into v_payments
  from public.finance_payments fp
  join linked_current_school_learners ll
    on ll.learner_id = fp.learner_id
   and ll.school_id = fp.school_id
  where fp.status in ('received','verified','rejected','reversed');

  return jsonb_build_object(
    'invoices', coalesce(v_invoices, '[]'::jsonb),
    'payments', coalesce(v_payments, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_parent_finance_overview() from public, anon;
grant execute on function public.get_parent_finance_overview() to authenticated;

comment on function app_private.user_can_manage_finance(uuid,uuid) is
'Finance authority mirror for physical provenance guards: Platform Support denied; governed Platform Admin retained; school actors require an effective finance role and effective linked staff placement when applicable. Deterministic current-school enforcement is applied by can_manage_finance().';
comment on function app_private.can_manage_finance(uuid) is
'Authenticated finance authority bound to the hardened current-school/current-placement finance predicate.';
comment on function public.get_parent_finance_overview() is
'Child-scoped parent finance read model limited to current effective guardian relationships and current effective enrolment at the finance-record school; exposes issued/derived invoice states and payer-safe payment fields only.';
