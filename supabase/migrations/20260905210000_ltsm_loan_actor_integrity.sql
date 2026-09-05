create or replace function app_private.user_can_manage_ltsm(
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
        and sm.role_key in ('school_admin','principal','deputy_principal','librarian','ltsm')
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
    );
$$;

revoke all on function app_private.user_can_manage_ltsm(uuid,uuid)
  from public, anon, authenticated;

comment on function app_private.user_can_manage_ltsm(uuid,uuid) is
'Arbitrary-user mirror of existing LTSM management authority for physical loan actor provenance guards.';

create or replace function app_private.enforce_learning_resource_loan_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'open'
       or new.returned_on is not null
       or new.returned_condition is not null
       or new.returned_by_user_id is not null then
      raise exception 'Learning resource loans must be created open without return provenance';
    end if;

    if auth.uid() is not null
       and new.issued_by_user_id is distinct from auth.uid() then
      raise exception 'Learning resource loan issuer must match authenticated actor';
    end if;

    if not app_private.user_can_manage_ltsm(new.issued_by_user_id, new.school_id) then
      raise exception 'Learning resource loan issuer is not authorized for school';
    end if;

    return new;
  end if;

  if new.issued_by_user_id is distinct from old.issued_by_user_id then
    raise exception 'Learning resource loan issuer provenance is immutable';
  end if;

  if old.returned_by_user_id is not null then
    if new.returned_by_user_id is distinct from old.returned_by_user_id
       or new.returned_on is distinct from old.returned_on
       or new.returned_condition is distinct from old.returned_condition then
      raise exception 'Learning resource loan return provenance is immutable';
    end if;
  elsif new.status in ('returned','lost') and old.status not in ('returned','lost') then
    if old.status not in ('open','overdue') then
      raise exception 'Only an open or overdue learning resource loan can be returned';
    end if;

    if new.returned_by_user_id is null
       or new.returned_on is null
       or nullif(btrim(coalesce(new.returned_condition,'')), '') is null then
      raise exception 'Returned learning resource loan requires return provenance';
    end if;

    if auth.uid() is not null
       and new.returned_by_user_id is distinct from auth.uid() then
      raise exception 'Learning resource loan returner must match authenticated actor';
    end if;

    if not app_private.user_can_manage_ltsm(new.returned_by_user_id, new.school_id) then
      raise exception 'Learning resource loan returner is not authorized for school';
    end if;
  elsif new.returned_by_user_id is not null
     or new.returned_on is not null
     or new.returned_condition is not null then
    raise exception 'Learning resource loan return provenance requires returned or lost status';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_learning_resource_loan_actor_integrity()
  from public, anon, authenticated;

comment on function app_private.enforce_learning_resource_loan_actor_integrity() is
'Physically binds loan issue/return provenance to current authorized LTSM actors, requires canonical open creation, and freezes completed return provenance.';

drop trigger if exists learning_resource_loan_actor_integrity_trg
  on public.learning_resource_loans;
create trigger learning_resource_loan_actor_integrity_trg
before insert or update of issued_by_user_id, returned_by_user_id, returned_on,
  returned_condition, status, school_id
on public.learning_resource_loans
for each row execute function app_private.enforce_learning_resource_loan_actor_integrity();
