drop policy if exists "payer safe school payment settings readable" on public.school_payment_settings;

drop function if exists public.get_school_payment_instructions(uuid);
create function public.get_school_payment_instructions(p_school_id uuid)
returns table (
  school_id uuid,
  bank_name text,
  account_name text,
  account_number text,
  branch_name text,
  branch_code text,
  account_type text,
  reference_instructions text,
  payment_instructions text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not app_private.can_view_school_payment_instructions(p_school_id) then
    raise exception 'Permission denied';
  end if;

  return query
  select
    s.school_id,
    s.bank_name,
    s.account_name,
    s.account_number,
    s.branch_name,
    s.branch_code,
    s.account_type,
    s.reference_instructions,
    s.payment_instructions
  from public.school_payment_settings s
  where s.school_id = p_school_id
    and s.active;
end;
$$;

revoke all on function public.get_school_payment_instructions(uuid) from public, anon;
grant execute on function public.get_school_payment_instructions(uuid) to authenticated;

comment on function public.get_school_payment_instructions(uuid) is
  'Returns only payer-safe school payment instructions for an authenticated current school member or current guardian relationship; raw school_payment_settings remains finance-manager scoped.';
