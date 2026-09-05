-- Bind durable report-card batch ownership to real management authority.
-- The worker may mutate operational counters/outcomes, but it must never be
-- able to manufacture or rewrite who initiated the batch.

create or replace function app_private.user_can_manage_report_cards(
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
        and sm.role_key in ('school_admin','principal','deputy_principal')
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
    );
$$;

revoke all on function app_private.user_can_manage_report_cards(uuid,uuid)
  from public, anon, authenticated;

create or replace function app_private.enforce_report_card_batch_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.tenant_id is distinct from old.tenant_id
       or new.school_id is distinct from old.school_id
       or new.academic_year is distinct from old.academic_year
       or new.term_number is distinct from old.term_number
       or new.scope_type is distinct from old.scope_type
       or new.scope_label is distinct from old.scope_label
       or new.operation is distinct from old.operation
       or new.created_by_user_id is distinct from old.created_by_user_id
       or new.created_at is distinct from old.created_at then
      raise exception 'Report-card batch identity and creator provenance are immutable';
    end if;
    return new;
  end if;

  if new.created_by_user_id is null then
    raise exception 'Report-card batch creator is required';
  end if;

  if auth.uid() is not null
     and new.created_by_user_id is distinct from auth.uid() then
    raise exception 'Report-card batch creator must match authenticated actor';
  end if;

  if not app_private.user_can_manage_report_cards(new.created_by_user_id,new.school_id) then
    raise exception 'Report-card batch creator is not authorized for school';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_report_card_batch_actor_integrity()
  from public, anon, authenticated;

comment on function app_private.user_can_manage_report_cards(uuid,uuid) is
'Arbitrary-user mirror of report-card management authority for physical provenance checks.';
comment on function app_private.enforce_report_card_batch_actor_integrity() is
'Prevents forged report-card batch creators and freezes the durable batch identity while leaving worker-owned operational state mutable.';

drop trigger if exists report_card_batch_actor_integrity_trg on public.report_card_batches;
create trigger report_card_batch_actor_integrity_trg
before insert or update
on public.report_card_batches
for each row execute function app_private.enforce_report_card_batch_actor_integrity();
