create or replace function app_private.enforce_client_operation_receipt_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.actor_user_id is distinct from old.actor_user_id
    or new.operation_type is distinct from old.operation_type
    or new.client_operation_id is distinct from old.client_operation_id
    or new.payload_fingerprint is distinct from old.payload_fingerprint
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Client operation receipt scope and idempotency identity are immutable';
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Client operation receipt scope mismatch: school does not belong to tenant';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_client_operation_receipt_scope_integrity() from public, anon, authenticated;

drop trigger if exists client_operation_receipt_scope_integrity_trg on public.client_operation_receipts;
create trigger client_operation_receipt_scope_integrity_trg
before insert or update of tenant_id, school_id, actor_user_id, operation_type, client_operation_id, payload_fingerprint, created_at
on public.client_operation_receipts
for each row execute function app_private.enforce_client_operation_receipt_scope_integrity();