create or replace function app_private.enforce_notification_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
begin
  if tg_op = 'UPDATE' and (
    new.recipient_user_id is distinct from old.recipient_user_id
    or new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.severity is distinct from old.severity
    or new.title is distinct from old.title
    or new.body is distinct from old.body
    or new.href is distinct from old.href
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Notification recipient, scope, content, and creation provenance are immutable';
  end if;

  if new.school_id is not null then
    if new.tenant_id is null then
      raise exception 'Notification scope mismatch: school-scoped notification requires tenant';
    end if;

    select s.tenant_id into v_school_tenant
    from public.schools s
    where s.id = new.school_id;

    if v_school_tenant is null or v_school_tenant <> new.tenant_id then
      raise exception 'Notification scope mismatch: school does not belong to tenant';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_notification_scope_integrity() from public, anon, authenticated;

drop trigger if exists notification_scope_integrity_trg on public.notifications;
create trigger notification_scope_integrity_trg
before insert or update
on public.notifications
for each row execute function app_private.enforce_notification_scope_integrity();