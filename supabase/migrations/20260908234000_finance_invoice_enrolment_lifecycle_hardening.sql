-- Learner-linked invoices must be anchored to the learner's effective enrolment for
-- the invoiced school/year/date. Historical invoices remain readable and payable after
-- enrolment ends, but new charges cannot silently attach to an unrelated/ended period.
-- Terminal invoice states are explicit audited finance decisions; paid state remains a
-- derived balance state and may reopen only when a governed payment reversal restores a balance.

create or replace function app_private.enforce_finance_invoice_enrolment_period_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE'
     and old.status <> 'draft'
     and (
       new.tenant_id is distinct from old.tenant_id
       or new.school_id is distinct from old.school_id
       or new.learner_id is distinct from old.learner_id
       or new.academic_year is distinct from old.academic_year
       or new.issued_on is distinct from old.issued_on
     ) then
    raise exception 'Issued finance invoice learner, school, year, and issue date are immutable';
  end if;

  if new.learner_id is not null and not exists (
    select 1
    from public.enrolments e
    where e.tenant_id = new.tenant_id
      and e.school_id = new.school_id
      and e.learner_id = new.learner_id
      and e.academic_year = new.academic_year
      and e.enrolled_from <= new.issued_on
      and (e.enrolled_to is null or e.enrolled_to >= new.issued_on)
  ) then
    raise exception 'Finance invoice learner is not enrolled at this school on the invoice date and year';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_finance_invoice_enrolment_period_integrity()
  from public, anon, authenticated;

drop trigger if exists finance_invoice_enrolment_period_integrity_trg
  on public.finance_invoices;
create trigger finance_invoice_enrolment_period_integrity_trg
before insert or update of tenant_id, school_id, learner_id, academic_year, issued_on
on public.finance_invoices
for each row execute function app_private.enforce_finance_invoice_enrolment_period_integrity();

create or replace function app_private.enforce_finance_invoice_lifecycle_finality()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_terminal_transition boolean :=
    coalesce(current_setting('app.finance_invoice_terminal_transition', true), '') = 'on';
begin
  if old.status in ('cancelled','written_off')
     and new.status is distinct from old.status then
    raise exception 'Terminal finance invoice status is immutable';
  end if;

  if old.status <> 'draft' and new.status = 'draft' then
    raise exception 'Issued finance invoice cannot return to draft';
  end if;

  if new.status in ('cancelled','written_off')
     and new.status is distinct from old.status
     and not v_terminal_transition then
    raise exception 'Finance invoice terminal status requires governed workflow';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_finance_invoice_lifecycle_finality()
  from public, anon, authenticated;

drop trigger if exists finance_invoice_lifecycle_finality_trg
  on public.finance_invoices;
create trigger finance_invoice_lifecycle_finality_trg
before update of status
on public.finance_invoices
for each row execute function app_private.enforce_finance_invoice_lifecycle_finality();

create or replace function public.finalize_finance_invoice(
  p_invoice_id uuid,
  p_status text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_invoice public.finance_invoices%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_status not in ('cancelled','written_off') then
    raise exception 'Invoice final status must be cancelled or written_off';
  end if;
  if v_reason is null then raise exception 'Invoice finalization reason is required'; end if;

  select * into v_invoice
  from public.finance_invoices
  where id = p_invoice_id
  for update;
  if not found then raise exception 'Invoice not found'; end if;
  if not app_private.can_manage_finance(v_invoice.school_id) then raise exception 'Permission denied'; end if;

  if v_invoice.status = p_status then return true; end if;
  if v_invoice.status in ('cancelled','written_off') then
    raise exception 'Terminal finance invoice status is immutable';
  end if;
  if v_invoice.status = 'paid' then
    raise exception 'Paid invoice must have credited payments reversed before finalization';
  end if;

  perform set_config('app.finance_invoice_terminal_transition', 'on', true);
  update public.finance_invoices
  set status = p_status,
      updated_at = now()
  where id = v_invoice.id;
  perform set_config('app.finance_invoice_terminal_transition', 'off', true);

  insert into public.audit_events(
    tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
  ) values (
    v_invoice.tenant_id,
    v_invoice.school_id,
    auth.uid(),
    case when p_status = 'cancelled' then 'finance.invoice.cancelled' else 'finance.invoice.written_off' end,
    'finance_invoice',
    v_invoice.id,
    jsonb_build_object('previous_status', v_invoice.status, 'status', p_status, 'reason', v_reason)
  );

  return true;
end;
$$;

revoke all on function public.finalize_finance_invoice(uuid,text,text) from public, anon;
grant execute on function public.finalize_finance_invoice(uuid,text,text) to authenticated;

comment on function public.finalize_finance_invoice(uuid,text,text) is
'Governed audited transition to cancelled/written_off. Paid invoices require payment reversal first; terminal states cannot be rewritten.';
