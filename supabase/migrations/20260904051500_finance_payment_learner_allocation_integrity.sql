-- Learner-specific finance records must not cross-credit another learner inside the
-- same school. School-level/unassigned payments remain valid and may still be
-- allocated under the existing finance workflow.

create or replace function app_private.enforce_finance_payment_allocation_learner_integrity()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_payment_learner_id uuid;
  v_invoice_learner_id uuid;
begin
  select learner_id into v_payment_learner_id
  from public.finance_payments
  where id=new.payment_id;

  select learner_id into v_invoice_learner_id
  from public.finance_invoices
  where id=new.invoice_id;

  if v_payment_learner_id is not null
    and v_invoice_learner_id is not null
    and v_payment_learner_id <> v_invoice_learner_id then
    raise exception 'Finance allocation learner mismatch: payment and invoice belong to different learners';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_finance_payment_allocation_learner_integrity()
from public,anon,authenticated;

drop trigger if exists enforce_finance_payment_allocation_learner_integrity
on public.finance_payment_allocations;
create trigger enforce_finance_payment_allocation_learner_integrity
before insert or update of payment_id,invoice_id
on public.finance_payment_allocations
for each row execute function app_private.enforce_finance_payment_allocation_learner_integrity();

create or replace function public.allocate_finance_payment(
  p_payment_id uuid,
  p_invoice_id uuid,
  p_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_payment public.finance_payments%rowtype;
  v_invoice public.finance_invoices%rowtype;
  v_existing_allocated numeric(12,2);
  v_allocation_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Allocation amount must be positive'; end if;

  select * into v_payment from public.finance_payments where id=p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;

  select * into v_invoice from public.finance_invoices where id=p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;

  if v_payment.school_id <> v_invoice.school_id or v_payment.tenant_id <> v_invoice.tenant_id then
    raise exception 'Payment and invoice must belong to the same school';
  end if;
  if not app_private.can_manage_finance(v_invoice.school_id) then raise exception 'Permission denied'; end if;
  if v_payment.status <> 'verified' then raise exception 'Only verified payments can be allocated'; end if;
  if v_invoice.status in ('cancelled','written_off') then raise exception 'Invoice cannot receive allocations'; end if;
  if v_payment.currency <> v_invoice.currency then raise exception 'Payment and invoice currency must match'; end if;

  if v_payment.learner_id is not null
    and v_invoice.learner_id is not null
    and v_payment.learner_id <> v_invoice.learner_id then
    raise exception 'Finance allocation learner mismatch: payment and invoice belong to different learners';
  end if;

  select coalesce(sum(amount),0)::numeric(12,2)
  into v_existing_allocated
  from public.finance_payment_allocations
  where payment_id=v_payment.id;

  if v_existing_allocated + p_amount > v_payment.amount then
    raise exception 'Allocation exceeds unallocated payment amount';
  end if;
  if p_amount > v_invoice.balance_amount then raise exception 'Allocation exceeds invoice balance'; end if;

  insert into public.finance_payment_allocations(
    tenant_id,school_id,payment_id,invoice_id,amount,allocated_by_user_id
  ) values(
    v_invoice.tenant_id,v_invoice.school_id,v_payment.id,v_invoice.id,p_amount,auth.uid()
  )
  on conflict(payment_id,invoice_id) do update
    set amount=public.finance_payment_allocations.amount+excluded.amount,
        allocated_by_user_id=auth.uid(),
        allocated_at=now()
  returning id into v_allocation_id;

  perform public.recalculate_finance_invoice(v_invoice.id);

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_invoice.tenant_id,v_invoice.school_id,auth.uid(),'finance.payment.allocated',
    'finance_payment_allocation',v_allocation_id,
    jsonb_build_object('payment_id',v_payment.id,'invoice_id',v_invoice.id,'amount',p_amount)
  );

  return v_allocation_id;
end;
$$;

revoke all on function public.allocate_finance_payment(uuid,uuid,numeric) from public,anon;
grant execute on function public.allocate_finance_payment(uuid,uuid,numeric) to authenticated;

comment on function app_private.enforce_finance_payment_allocation_learner_integrity() is
'Physically prevents a learner-specific payment from being allocated to an invoice for a different learner within the same school. Null learner scope remains available for school-level/unassigned finance records.';
comment on function public.allocate_finance_payment(uuid,uuid,numeric) is
'Allocates a verified payment to an eligible same-school invoice while enforcing currency, balance and learner-relationship integrity for learner-specific finance records.';
