create or replace function app_private.enforce_finance_payment_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'received'
       or new.verified_by_user_id is not null
       or new.verified_at is not null then
      raise exception 'Finance payments must be created in received state without verification provenance';
    end if;

    if auth.uid() is not null
       and new.recorded_by_user_id is distinct from auth.uid() then
      raise exception 'Finance payment recorder must match authenticated actor';
    end if;

    if not app_private.user_can_manage_finance(new.recorded_by_user_id, new.school_id) then
      raise exception 'Finance payment recorder is not authorized for school';
    end if;

    return new;
  end if;

  if new.recorded_by_user_id is distinct from old.recorded_by_user_id then
    raise exception 'Finance payment recorder provenance is immutable';
  end if;

  if old.verified_by_user_id is not null then
    if new.verified_by_user_id is distinct from old.verified_by_user_id
       or new.verified_at is distinct from old.verified_at then
      raise exception 'Finance payment verification provenance is immutable';
    end if;
  elsif new.status = 'verified' and old.status is distinct from 'verified' then
    if new.verified_by_user_id is null or new.verified_at is null then
      raise exception 'Verified finance payment requires verification provenance';
    end if;

    if auth.uid() is not null
       and new.verified_by_user_id is distinct from auth.uid() then
      raise exception 'Finance payment verifier must match authenticated actor';
    end if;

    if not app_private.user_can_manage_finance(new.verified_by_user_id, new.school_id) then
      raise exception 'Finance payment verifier is not authorized for school';
    end if;
  elsif new.verified_by_user_id is not null or new.verified_at is not null then
    raise exception 'Finance payment verification provenance requires verified status';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_finance_payment_actor_integrity()
  from public, anon, authenticated;

comment on function app_private.enforce_finance_payment_actor_integrity() is
'Physically binds finance payment recorder and verifier provenance to current finance authority, requires canonical received-state creation, and prevents trusted/RLS-bypassing provenance forgery.';

drop trigger if exists finance_payment_actor_integrity_trg on public.finance_payments;
create trigger finance_payment_actor_integrity_trg
before insert or update of recorded_by_user_id, verified_by_user_id, verified_at, status, school_id
on public.finance_payments
for each row execute function app_private.enforce_finance_payment_actor_integrity();

create or replace function app_private.enforce_finance_payment_allocation_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if auth.uid() is not null
     and new.allocated_by_user_id is distinct from auth.uid() then
    raise exception 'Finance payment allocator must match authenticated actor';
  end if;

  if not app_private.user_can_manage_finance(new.allocated_by_user_id, new.school_id) then
    raise exception 'Finance payment allocator is not authorized for school';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_finance_payment_allocation_actor_integrity()
  from public, anon, authenticated;

comment on function app_private.enforce_finance_payment_allocation_actor_integrity() is
'Physically binds finance payment allocation provenance to a current finance manager while preserving the canonical upsert workflow where the latest allocator is recorded.';

drop trigger if exists finance_payment_allocation_actor_integrity_trg on public.finance_payment_allocations;
create trigger finance_payment_allocation_actor_integrity_trg
before insert or update of allocated_by_user_id, school_id
on public.finance_payment_allocations
for each row execute function app_private.enforce_finance_payment_allocation_actor_integrity();