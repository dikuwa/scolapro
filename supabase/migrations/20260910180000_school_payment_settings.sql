create table if not exists public.school_payment_settings (
  school_id uuid primary key references public.schools(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  bank_name text,
  account_name text,
  account_number text,
  branch_name text,
  branch_code text,
  account_type text,
  reference_instructions text,
  payment_instructions text,
  active boolean not null default true,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function app_private.can_view_school_payment_instructions(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.has_school_access(target_school_id)
    or exists (
      select 1
      from public.guardian_user_links gul
      join public.learner_guardians lg on lg.guardian_id = gul.guardian_id
      join public.enrolments e on e.learner_id = lg.learner_id
      where gul.user_id = auth.uid()
        and e.school_id = target_school_id
        and lg.effective_from <= current_date
        and (lg.effective_to is null or lg.effective_to >= current_date)
        and e.enrolled_from <= current_date
        and (e.enrolled_to is null or e.enrolled_to >= current_date)
        and e.status = 'current'
    );
$$;
revoke all on function app_private.can_view_school_payment_instructions(uuid) from public, anon;
grant execute on function app_private.can_view_school_payment_instructions(uuid) to authenticated;

create or replace function app_private.enforce_school_payment_setting_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from public.schools where id = new.school_id;
  if v_tenant_id is null or v_tenant_id <> new.tenant_id then
    raise exception 'School payment setting scope mismatch';
  end if;
  if tg_op = 'UPDATE' and (new.school_id is distinct from old.school_id or new.tenant_id is distinct from old.tenant_id) then
    raise exception 'School payment setting scope is immutable';
  end if;
  return new;
end;
$$;
revoke all on function app_private.enforce_school_payment_setting_scope() from public, anon, authenticated;
create trigger school_payment_setting_scope_trg before insert or update of school_id, tenant_id
  on public.school_payment_settings for each row execute function app_private.enforce_school_payment_setting_scope();

alter table public.school_payment_settings enable row level security;
create policy "payer safe school payment settings readable" on public.school_payment_settings
  for select to authenticated using (active and app_private.can_view_school_payment_instructions(school_id));
create policy "finance managers can read all school payment settings" on public.school_payment_settings
  for select to authenticated using (app_private.can_manage_finance(school_id));
revoke insert, update, delete on public.school_payment_settings from authenticated;

create or replace function public.save_school_payment_settings(
  p_school_id uuid,
  p_bank_name text,
  p_account_name text,
  p_account_number text,
  p_branch_name text default null,
  p_branch_code text default null,
  p_account_type text default null,
  p_reference_instructions text default null,
  p_payment_instructions text default null,
  p_active boolean default true
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare v_tenant_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_finance(p_school_id) then raise exception 'Permission denied'; end if;
  select tenant_id into v_tenant_id from public.schools where id = p_school_id;
  if v_tenant_id is null then raise exception 'School not found'; end if;
  if btrim(coalesce(p_bank_name,''))='' or btrim(coalesce(p_account_name,''))='' or btrim(coalesce(p_account_number,''))='' then
    raise exception 'Bank name, account name and account number are required';
  end if;
  insert into public.school_payment_settings(school_id,tenant_id,bank_name,account_name,account_number,branch_name,branch_code,account_type,reference_instructions,payment_instructions,active,updated_by_user_id)
  values(p_school_id,v_tenant_id,btrim(p_bank_name),btrim(p_account_name),btrim(p_account_number),nullif(btrim(coalesce(p_branch_name,'')),''),nullif(btrim(coalesce(p_branch_code,'')),''),nullif(btrim(coalesce(p_account_type,'')),''),nullif(btrim(coalesce(p_reference_instructions,'')),''),nullif(btrim(coalesce(p_payment_instructions,'')),''),coalesce(p_active,true),auth.uid())
  on conflict(school_id) do update set bank_name=excluded.bank_name,account_name=excluded.account_name,account_number=excluded.account_number,branch_name=excluded.branch_name,branch_code=excluded.branch_code,account_type=excluded.account_type,reference_instructions=excluded.reference_instructions,payment_instructions=excluded.payment_instructions,active=excluded.active,updated_by_user_id=auth.uid(),updated_at=now();
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_tenant_id,p_school_id,auth.uid(),'finance.payment_settings.updated','school_payment_settings',p_school_id,jsonb_build_object('active',coalesce(p_active,true)));
  return true;
end;
$$;
revoke all on function public.save_school_payment_settings(uuid,text,text,text,text,text,text,text,text,boolean) from public, anon;
grant execute on function public.save_school_payment_settings(uuid,text,text,text,text,text,text,text,text,boolean) to authenticated;

create or replace function public.record_finance_payment(
  p_school_id uuid,
  p_learner_id uuid,
  p_payment_reference text,
  p_payment_method text,
  p_amount numeric,
  p_paid_on date,
  p_bank_reference text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare v_school public.schools%rowtype; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_finance(p_school_id) then raise exception 'Permission denied'; end if;
  select * into v_school from public.schools where id=p_school_id;
  if not found then raise exception 'School not found'; end if;
  if btrim(coalesce(p_payment_reference,''))='' then raise exception 'Payment reference is required'; end if;
  if p_payment_method not in ('bank_transfer','cash','card','mobile','other') then raise exception 'Invalid payment method'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Payment amount must be positive'; end if;
  if p_learner_id is not null and not exists (select 1 from public.enrolments e where e.school_id=p_school_id and e.learner_id=p_learner_id and e.enrolled_from<=p_paid_on and (e.enrolled_to is null or e.enrolled_to>=p_paid_on)) then
    raise exception 'Learner is not enrolled at this school on payment date';
  end if;
  insert into public.finance_payments(tenant_id,school_id,learner_id,payment_reference,payment_method,amount,currency,paid_on,bank_reference,status,note,recorded_by_user_id)
  values(v_school.tenant_id,p_school_id,p_learner_id,btrim(p_payment_reference),p_payment_method,p_amount,'NAD',p_paid_on,nullif(btrim(coalesce(p_bank_reference,'')),''),'received',nullif(btrim(coalesce(p_note,'')),''),auth.uid()) returning id into v_id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_school.tenant_id,p_school_id,auth.uid(),'finance.payment.recorded','finance_payment',v_id,jsonb_build_object('method',p_payment_method,'amount',p_amount,'learner_id',p_learner_id));
  return v_id;
end;
$$;
revoke all on function public.record_finance_payment(uuid,uuid,text,text,numeric,date,text,text) from public, anon;
grant execute on function public.record_finance_payment(uuid,uuid,text,text,numeric,date,text,text) to authenticated;

comment on table public.school_payment_settings is 'Payer-safe school bank and payment instructions. Never stores online banking credentials, PINs, passwords, or secrets.';
comment on function public.record_finance_payment(uuid,uuid,text,text,numeric,date,text,text) is 'Records a canonical received-state offline/manual payment while preserving finance actor-integrity and lifecycle triggers.';
