-- Invoice total/balance are derived from invoice lines and verified allocations.
-- Keep them materialized for efficient reporting, but never trust client-supplied values.

create or replace function app_private.refresh_finance_invoice_derived(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_total numeric(12,2);
  v_allocated numeric(12,2);
  v_balance numeric(12,2);
begin
  select coalesce(sum(line_total),0)::numeric(12,2)
  into v_total
  from public.finance_invoice_lines
  where invoice_id=p_invoice_id;

  select coalesce(sum(fpa.amount),0)::numeric(12,2)
  into v_allocated
  from public.finance_payment_allocations fpa
  join public.finance_payments fp on fp.id=fpa.payment_id
  where fpa.invoice_id=p_invoice_id
    and fp.status='verified';

  v_balance:=greatest(v_total-v_allocated,0);

  update public.finance_invoices fi
  set total_amount=v_total,
      balance_amount=v_balance,
      status=case
        when fi.status in ('draft','cancelled','written_off') then fi.status
        when v_total>0 and v_balance=0 then 'paid'
        when v_allocated>0 then 'partially_paid'
        else 'issued'
      end,
      updated_at=now()
  where fi.id=p_invoice_id;
end;
$$;
revoke all on function app_private.refresh_finance_invoice_derived(uuid) from public,anon,authenticated;

create or replace function app_private.refresh_invoice_after_line_change()
returns trigger
language plpgsql
security definer
set search_path=public,app_private
as $$
begin
  perform app_private.refresh_finance_invoice_derived(coalesce(new.invoice_id,old.invoice_id));
  return coalesce(new,old);
end;
$$;
revoke all on function app_private.refresh_invoice_after_line_change() from public,anon,authenticated;

drop trigger if exists finance_invoice_lines_refresh_invoice on public.finance_invoice_lines;
create trigger finance_invoice_lines_refresh_invoice
after insert or update or delete on public.finance_invoice_lines
for each row execute function app_private.refresh_invoice_after_line_change();

create or replace function app_private.enforce_finance_invoice_derived_fields()
returns trigger
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_total numeric(12,2);
  v_allocated numeric(12,2);
begin
  if pg_trigger_depth()>1 then return new; end if;

  select coalesce(sum(line_total),0)::numeric(12,2)
  into v_total
  from public.finance_invoice_lines
  where invoice_id=new.id;

  select coalesce(sum(fpa.amount),0)::numeric(12,2)
  into v_allocated
  from public.finance_payment_allocations fpa
  join public.finance_payments fp on fp.id=fpa.payment_id
  where fpa.invoice_id=new.id and fp.status='verified';

  new.total_amount:=v_total;
  new.balance_amount:=greatest(v_total-v_allocated,0);
  if new.status not in ('draft','cancelled','written_off') then
    new.status:=case
      when v_total>0 and new.balance_amount=0 then 'paid'
      when v_allocated>0 then 'partially_paid'
      else 'issued'
    end;
  end if;
  return new;
end;
$$;
revoke all on function app_private.enforce_finance_invoice_derived_fields() from public,anon,authenticated;

drop trigger if exists finance_invoice_derived_fields_guard on public.finance_invoices;
create trigger finance_invoice_derived_fields_guard
before update of total_amount,balance_amount,status on public.finance_invoices
for each row execute function app_private.enforce_finance_invoice_derived_fields();

create or replace function public.recalculate_finance_invoice(p_invoice_id uuid)
returns numeric
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_school_id uuid;
  v_balance numeric(12,2);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select school_id into v_school_id from public.finance_invoices where id=p_invoice_id;
  if v_school_id is null then raise exception 'Invoice not found'; end if;
  if not app_private.can_manage_finance(v_school_id) then raise exception 'Permission denied'; end if;

  perform app_private.refresh_finance_invoice_derived(p_invoice_id);
  select balance_amount into v_balance from public.finance_invoices where id=p_invoice_id;
  return v_balance;
end;
$$;
revoke all on function public.recalculate_finance_invoice(uuid) from public,anon,authenticated;

comment on column public.finance_invoices.total_amount is
'Materialized derived value from invoice lines. Database guards recalculate it; client-supplied totals are not authoritative.';
comment on column public.finance_invoices.balance_amount is
'Materialized derived value from invoice lines minus verified payment allocations. Database guards recalculate it.';