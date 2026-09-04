create or replace function app_private.user_can_manage_finance(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists(
      select 1
      from public.platform_memberships pm
      where pm.user_id = p_user_id
        and pm.role_key = 'platform_admin'
        and pm.active_from <= current_date
        and (pm.active_to is null or pm.active_to >= current_date)
    )
    or exists(
      select 1
      from public.school_memberships sm
      where sm.school_id = p_school_id
        and sm.user_id = p_user_id
        and sm.role_key in ('school_admin','principal','finance_officer','bursar')
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
    );
$$;

revoke all on function app_private.user_can_manage_finance(uuid,uuid)
  from public, anon, authenticated;

comment on function app_private.user_can_manage_finance(uuid,uuid) is
'Arbitrary-user mirror of finance-management authority for physical creator-provenance guards.';

create or replace function app_private.enforce_finance_invoice_creator_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if tg_op = 'UPDATE'
     and new.created_by_user_id is distinct from old.created_by_user_id then
    raise exception 'Finance invoice creator provenance is immutable';
  end if;

  if auth.uid() is not null
     and tg_op = 'INSERT'
     and new.created_by_user_id is distinct from auth.uid() then
    raise exception 'Finance invoice creator must match authenticated actor';
  end if;

  if not app_private.user_can_manage_finance(
    new.created_by_user_id,
    new.school_id
  ) then
    raise exception 'Finance invoice creator is not authorized for school';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_finance_invoice_creator_integrity()
  from public, anon, authenticated;

comment on function app_private.enforce_finance_invoice_creator_integrity() is
'Prevents finance-invoice creator provenance from being forged by authenticated or trusted/RLS-bypassing writes and keeps the original creator immutable.';

drop trigger if exists finance_invoice_creator_integrity_trg on public.finance_invoices;
create trigger finance_invoice_creator_integrity_trg
before insert or update of created_by_user_id, school_id
on public.finance_invoices
for each row execute function app_private.enforce_finance_invoice_creator_integrity();

drop policy if exists "finance staff can manage invoices [insert]" on public.finance_invoices;
create policy "finance staff can manage invoices [insert]"
on public.finance_invoices
for insert
to authenticated
with check (
  created_by_user_id = (select auth.uid())
  and app_private.can_manage_finance(school_id)
);