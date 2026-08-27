create table if not exists public.finance_charge_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  charge_code text not null,
  display_name text not null,
  description text,
  default_amount numeric(12,2) check (default_amount is null or default_amount >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, charge_code)
);

create table if not exists public.finance_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  learner_id uuid references public.learners(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  invoice_number text not null,
  issued_on date not null default current_date,
  due_on date,
  status text not null default 'draft' check (status in ('draft','issued','partially_paid','paid','cancelled','written_off')),
  currency text not null default 'NAD' check (char_length(currency) = 3),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  balance_amount numeric(12,2) not null default 0 check (balance_amount >= 0),
  note text,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, invoice_number),
  check (due_on is null or due_on >= issued_on),
  check (balance_amount <= total_amount)
);

create table if not exists public.finance_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  invoice_id uuid not null references public.finance_invoices(id) on delete cascade,
  charge_type_id uuid references public.finance_charge_types(id) on delete restrict,
  description text not null,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit_amount numeric(12,2) not null check (unit_amount >= 0),
  line_total numeric(12,2) generated always as (quantity * unit_amount) stored,
  created_at timestamptz not null default now()
);

create table if not exists public.finance_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  learner_id uuid references public.learners(id) on delete restrict,
  payment_reference text not null,
  payment_method text not null check (payment_method in ('bank_transfer','cash','card','mobile','other')),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'NAD' check (char_length(currency) = 3),
  paid_on date not null,
  bank_reference text,
  proof_path text,
  status text not null default 'received' check (status in ('received','verified','rejected','reversed')),
  verified_by_user_id uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  note text,
  recorded_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, payment_reference)
);

create table if not exists public.finance_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  payment_id uuid not null references public.finance_payments(id) on delete restrict,
  invoice_id uuid not null references public.finance_invoices(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  allocated_by_user_id uuid not null references auth.users(id) on delete restrict,
  allocated_at timestamptz not null default now(),
  unique (payment_id, invoice_id)
);

create index if not exists finance_invoices_school_status_idx on public.finance_invoices(school_id, status, issued_on desc);
create index if not exists finance_invoices_learner_idx on public.finance_invoices(school_id, learner_id, academic_year) where learner_id is not null;
create index if not exists finance_payments_school_status_idx on public.finance_payments(school_id, status, paid_on desc);
create index if not exists finance_payment_allocations_invoice_idx on public.finance_payment_allocations(invoice_id);

alter table public.finance_charge_types enable row level security;
alter table public.finance_invoices enable row level security;
alter table public.finance_invoice_lines enable row level security;
alter table public.finance_payments enable row level security;
alter table public.finance_payment_allocations enable row level security;

create or replace function app_private.can_manage_finance(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or app_private.has_school_role(target_school_id, array['school_admin','principal','finance_officer','bursar']);
$$;

grant execute on function app_private.can_manage_finance(uuid) to authenticated;

create policy "finance staff can read charge types" on public.finance_charge_types for select to authenticated using (app_private.can_manage_finance(school_id));
create policy "finance staff can manage charge types" on public.finance_charge_types for all to authenticated using (app_private.can_manage_finance(school_id)) with check (app_private.can_manage_finance(school_id));
create policy "finance staff can read invoices" on public.finance_invoices for select to authenticated using (app_private.can_manage_finance(school_id));
create policy "finance staff can manage invoices" on public.finance_invoices for all to authenticated using (app_private.can_manage_finance(school_id)) with check (app_private.can_manage_finance(school_id));
create policy "finance staff can read invoice lines" on public.finance_invoice_lines for select to authenticated using (app_private.can_manage_finance(school_id));
create policy "finance staff can manage invoice lines" on public.finance_invoice_lines for all to authenticated using (app_private.can_manage_finance(school_id)) with check (app_private.can_manage_finance(school_id));
create policy "finance staff can read payments" on public.finance_payments for select to authenticated using (app_private.can_manage_finance(school_id));
create policy "finance staff can manage payments" on public.finance_payments for all to authenticated using (app_private.can_manage_finance(school_id)) with check (app_private.can_manage_finance(school_id));
create policy "finance staff can read allocations" on public.finance_payment_allocations for select to authenticated using (app_private.can_manage_finance(school_id));
create policy "finance staff can manage allocations" on public.finance_payment_allocations for all to authenticated using (app_private.can_manage_finance(school_id)) with check (app_private.can_manage_finance(school_id));

create or replace function public.recalculate_finance_invoice(p_invoice_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.finance_invoices%rowtype;
  v_total numeric(12,2);
  v_allocated numeric(12,2);
  v_balance numeric(12,2);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_invoice from public.finance_invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if not app_private.can_manage_finance(v_invoice.school_id) then raise exception 'Permission denied'; end if;

  select coalesce(sum(line_total),0)::numeric(12,2) into v_total from public.finance_invoice_lines where invoice_id = v_invoice.id;
  select coalesce(sum(fpa.amount),0)::numeric(12,2) into v_allocated
  from public.finance_payment_allocations fpa
  join public.finance_payments fp on fp.id = fpa.payment_id
  where fpa.invoice_id = v_invoice.id and fp.status = 'verified';
  v_balance := greatest(v_total - v_allocated, 0);

  update public.finance_invoices
  set total_amount = v_total,
      balance_amount = v_balance,
      status = case
        when status in ('cancelled','written_off','draft') then status
        when v_balance = 0 and v_total > 0 then 'paid'
        when v_allocated > 0 then 'partially_paid'
        else 'issued'
      end,
      updated_at = now()
  where id = v_invoice.id;

  return v_balance;
end;
$$;

create or replace function public.allocate_finance_payment(p_payment_id uuid,p_invoice_id uuid,p_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.finance_payments%rowtype;
  v_invoice public.finance_invoices%rowtype;
  v_existing_allocated numeric(12,2);
  v_allocation_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Allocation amount must be positive'; end if;
  select * into v_payment from public.finance_payments where id = p_payment_id for update;
  select * into v_invoice from public.finance_invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_payment.id is null then raise exception 'Payment not found'; end if;
  if v_payment.school_id <> v_invoice.school_id or v_payment.tenant_id <> v_invoice.tenant_id then raise exception 'Payment and invoice must belong to the same school'; end if;
  if not app_private.can_manage_finance(v_invoice.school_id) then raise exception 'Permission denied'; end if;
  if v_payment.status <> 'verified' then raise exception 'Only verified payments can be allocated'; end if;
  if v_invoice.status in ('cancelled','written_off') then raise exception 'Invoice cannot receive allocations'; end if;
  if v_payment.currency <> v_invoice.currency then raise exception 'Payment and invoice currency must match'; end if;

  select coalesce(sum(amount),0)::numeric(12,2) into v_existing_allocated from public.finance_payment_allocations where payment_id = v_payment.id;
  if v_existing_allocated + p_amount > v_payment.amount then raise exception 'Allocation exceeds unallocated payment amount'; end if;
  if p_amount > v_invoice.balance_amount then raise exception 'Allocation exceeds invoice balance'; end if;

  insert into public.finance_payment_allocations (tenant_id, school_id, payment_id, invoice_id, amount, allocated_by_user_id)
  values (v_invoice.tenant_id, v_invoice.school_id, v_payment.id, v_invoice.id, p_amount, auth.uid())
  on conflict (payment_id, invoice_id) do update set amount = public.finance_payment_allocations.amount + excluded.amount, allocated_by_user_id = auth.uid(), allocated_at = now()
  returning id into v_allocation_id;

  perform public.recalculate_finance_invoice(v_invoice.id);

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_invoice.tenant_id, v_invoice.school_id, auth.uid(), 'finance.payment.allocated', 'finance_payment_allocation', v_allocation_id,
    jsonb_build_object('payment_id', v_payment.id, 'invoice_id', v_invoice.id, 'amount', p_amount));

  return v_allocation_id;
end;
$$;

revoke all on function public.recalculate_finance_invoice(uuid) from public, anon;
grant execute on function public.recalculate_finance_invoice(uuid) to authenticated;
revoke all on function public.allocate_finance_payment(uuid,uuid,numeric) from public, anon;
grant execute on function public.allocate_finance_payment(uuid,uuid,numeric) to authenticated;

comment on table public.finance_invoices is 'Basic school billing document; intentionally not a general ledger or full ERP.';
comment on table public.finance_payments is 'Recorded payment/proof workflow supporting bank transfer and other school payment methods.';
comment on table public.finance_payment_allocations is 'Explicit allocation of verified payments to invoices so balances remain auditable.';