create or replace function app_private.enforce_finance_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_parent_tenant uuid;
  v_parent_school uuid;
begin
  if tg_table_name in ('finance_invoices', 'finance_payments') then
    select s.tenant_id
      into v_parent_tenant
      from public.schools s
     where s.id = new.school_id;

    if v_parent_tenant is null or v_parent_tenant <> new.tenant_id then
      raise exception 'Finance scope mismatch: school does not belong to tenant';
    end if;

    if new.learner_id is not null and not exists (
      select 1
        from public.enrolments e
       where e.tenant_id = new.tenant_id
         and e.school_id = new.school_id
         and e.learner_id = new.learner_id
    ) then
      raise exception 'Finance scope mismatch: learner is not enrolled at school';
    end if;

    return new;
  end if;

  if tg_table_name = 'finance_invoice_lines' then
    select i.tenant_id, i.school_id
      into v_parent_tenant, v_parent_school
      from public.finance_invoices i
     where i.id = new.invoice_id;

    if v_parent_tenant is null then
      raise exception 'Finance scope mismatch: invoice not found';
    end if;

    if v_parent_tenant <> new.tenant_id or v_parent_school <> new.school_id then
      raise exception 'Finance scope mismatch: invoice line must match invoice school';
    end if;

    if new.charge_type_id is not null and not exists (
      select 1
        from public.finance_charge_types c
       where c.id = new.charge_type_id
         and c.tenant_id = new.tenant_id
         and c.school_id = new.school_id
    ) then
      raise exception 'Finance scope mismatch: charge type must match invoice school';
    end if;

    return new;
  end if;

  if tg_table_name = 'finance_payment_allocations' then
    select p.tenant_id, p.school_id
      into v_parent_tenant, v_parent_school
      from public.finance_payments p
     where p.id = new.payment_id;

    if v_parent_tenant is null then
      raise exception 'Finance scope mismatch: payment not found';
    end if;

    if v_parent_tenant <> new.tenant_id or v_parent_school <> new.school_id then
      raise exception 'Finance scope mismatch: allocation must match payment school';
    end if;

    select i.tenant_id, i.school_id
      into v_parent_tenant, v_parent_school
      from public.finance_invoices i
     where i.id = new.invoice_id;

    if v_parent_tenant is null then
      raise exception 'Finance scope mismatch: invoice not found';
    end if;

    if v_parent_tenant <> new.tenant_id or v_parent_school <> new.school_id then
      raise exception 'Finance scope mismatch: allocation must match invoice school';
    end if;

    return new;
  end if;

  raise exception 'Finance scope integrity trigger attached to unexpected table: %', tg_table_name;
end;
$$;

revoke all on function app_private.enforce_finance_scope_integrity() from public, anon, authenticated;

drop trigger if exists enforce_finance_invoice_scope on public.finance_invoices;
create trigger enforce_finance_invoice_scope
before insert or update of tenant_id, school_id, learner_id
on public.finance_invoices
for each row execute function app_private.enforce_finance_scope_integrity();

drop trigger if exists enforce_finance_payment_scope on public.finance_payments;
create trigger enforce_finance_payment_scope
before insert or update of tenant_id, school_id, learner_id
on public.finance_payments
for each row execute function app_private.enforce_finance_scope_integrity();

drop trigger if exists enforce_finance_invoice_line_scope on public.finance_invoice_lines;
create trigger enforce_finance_invoice_line_scope
before insert or update of tenant_id, school_id, invoice_id, charge_type_id
on public.finance_invoice_lines
for each row execute function app_private.enforce_finance_scope_integrity();

drop trigger if exists enforce_finance_payment_allocation_scope on public.finance_payment_allocations;
create trigger enforce_finance_payment_allocation_scope
before insert or update of tenant_id, school_id, payment_id, invoice_id
on public.finance_payment_allocations
for each row execute function app_private.enforce_finance_scope_integrity();
