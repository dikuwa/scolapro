-- Finance data includes parent payments and proof references. Do not inherit platform
-- support access through the generic school-role helper, and do not allow payment status
-- or allocations to be rewritten outside governed workflows.

create or replace function app_private.can_manage_finance(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or exists(
      select 1 from public.school_memberships sm
      where sm.school_id=target_school_id
        and sm.user_id=(select auth.uid())
        and sm.role_key in ('school_admin','principal','finance_officer','bursar')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    );
$$;
revoke all on function app_private.can_manage_finance(uuid) from public,anon;
grant execute on function app_private.can_manage_finance(uuid) to authenticated;

create or replace function public.record_finance_payment(
  p_school_id uuid,
  p_learner_id uuid,
  p_payment_reference text,
  p_payment_method text,
  p_amount numeric,
  p_currency text default 'NAD',
  p_paid_on date default current_date,
  p_bank_reference text default null,
  p_proof_path text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_school public.schools%rowtype;
  v_id uuid;
  v_currency text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_finance(p_school_id) then raise exception 'Permission denied'; end if;

  select * into v_school from public.schools where id=p_school_id and status='active';
  if not found then raise exception 'School not found or inactive'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Payment amount must be positive'; end if;
  if p_payment_method not in ('bank_transfer','cash','card','mobile','other') then raise exception 'Payment method is invalid'; end if;
  if nullif(btrim(coalesce(p_payment_reference,'')),'') is null then raise exception 'Payment reference is required'; end if;
  v_currency:=upper(btrim(coalesce(p_currency,'NAD')));
  if char_length(v_currency)<>3 then raise exception 'Currency code must contain three characters'; end if;

  if p_learner_id is not null and not exists(
    select 1 from public.enrolments e
    where e.school_id=v_school.id
      and e.tenant_id=v_school.tenant_id
      and e.learner_id=p_learner_id
  ) then raise exception 'Learner is outside this school'; end if;

  insert into public.finance_payments(
    tenant_id,school_id,learner_id,payment_reference,payment_method,amount,currency,
    paid_on,bank_reference,proof_path,status,note,recorded_by_user_id
  ) values(
    v_school.tenant_id,v_school.id,p_learner_id,btrim(p_payment_reference),p_payment_method,p_amount,v_currency,
    p_paid_on,nullif(btrim(coalesce(p_bank_reference,'')),''),nullif(btrim(coalesce(p_proof_path,'')),''),
    'received',nullif(btrim(coalesce(p_note,'')),''),auth.uid()
  ) returning id into v_id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_school.tenant_id,v_school.id,auth.uid(),'finance.payment.recorded','finance_payment',v_id,
    jsonb_build_object('amount',p_amount,'currency',v_currency,'payment_method',p_payment_method,'learner_id',p_learner_id)
  );

  return v_id;
end;
$$;

create or replace function public.review_finance_payment(
  p_payment_id uuid,
  p_status text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_payment public.finance_payments%rowtype;
  v_invoice_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_status not in ('verified','rejected') then raise exception 'Payment review status must be verified or rejected'; end if;

  select * into v_payment
  from public.finance_payments
  where id=p_payment_id
  for update;
  if not found then raise exception 'Payment not found'; end if;
  if not app_private.can_manage_finance(v_payment.school_id) then raise exception 'Permission denied'; end if;
  if v_payment.status not in ('received','rejected') then raise exception 'Payment is not awaiting review'; end if;

  update public.finance_payments
  set status=p_status,
      verified_by_user_id=case when p_status='verified' then auth.uid() else null end,
      verified_at=case when p_status='verified' then now() else null end,
      note=coalesce(nullif(btrim(coalesce(p_note,'')),''),note),
      updated_at=now()
  where id=v_payment.id;

  for v_invoice_id in
    select distinct invoice_id from public.finance_payment_allocations where payment_id=v_payment.id
  loop
    perform public.recalculate_finance_invoice(v_invoice_id);
  end loop;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_payment.tenant_id,v_payment.school_id,auth.uid(),'finance.payment.reviewed','finance_payment',v_payment.id,
    jsonb_build_object('previous_status',v_payment.status,'status',p_status)
  );

  return true;
end;
$$;

create or replace function public.reverse_finance_payment(
  p_payment_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_payment public.finance_payments%rowtype;
  v_reason text;
  v_invoice_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  v_reason:=nullif(btrim(coalesce(p_reason,'')),'');
  if v_reason is null then raise exception 'Payment reversal reason is required'; end if;

  select * into v_payment
  from public.finance_payments
  where id=p_payment_id
  for update;
  if not found then raise exception 'Payment not found'; end if;
  if not app_private.can_manage_finance(v_payment.school_id) then raise exception 'Permission denied'; end if;
  if v_payment.status='reversed' then raise exception 'Payment is already reversed'; end if;

  update public.finance_payments
  set status='reversed',
      note=case when note is null then v_reason else note || E'\nReversal: ' || v_reason end,
      updated_at=now()
  where id=v_payment.id;

  for v_invoice_id in
    select distinct invoice_id from public.finance_payment_allocations where payment_id=v_payment.id
  loop
    perform public.recalculate_finance_invoice(v_invoice_id);
  end loop;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_payment.tenant_id,v_payment.school_id,auth.uid(),'finance.payment.reversed','finance_payment',v_payment.id,
    jsonb_build_object('previous_status',v_payment.status,'reason',v_reason)
  );

  return true;
end;
$$;

revoke all on function public.record_finance_payment(uuid,uuid,text,text,numeric,text,date,text,text,text) from public,anon;
grant execute on function public.record_finance_payment(uuid,uuid,text,text,numeric,text,date,text,text,text) to authenticated;
revoke all on function public.review_finance_payment(uuid,text,text) from public,anon;
grant execute on function public.review_finance_payment(uuid,text,text) to authenticated;
revoke all on function public.reverse_finance_payment(uuid,text) from public,anon;
grant execute on function public.reverse_finance_payment(uuid,text) to authenticated;

-- Keep payment creation/review and allocation atomic through RPCs. Reading remains RLS governed.
revoke insert,update,delete on public.finance_payments from authenticated;
revoke insert,update,delete on public.finance_payment_allocations from authenticated;

comment on function public.review_finance_payment(uuid,text,text) is
'Governed payment verification/rejection transition with audit provenance. Allocation effects are recalculated when payment verification changes.';
comment on table public.finance_payment_allocations is
'Payment allocations are client read-only; allocation mutations occur through allocate_finance_payment so amount/balance rules cannot be bypassed.';