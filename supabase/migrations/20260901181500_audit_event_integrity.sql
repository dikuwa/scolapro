create or replace function app_private.enforce_audit_event_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Audit events are immutable';
  end if;

  if new.school_id is not null then
    if new.tenant_id is null then
      raise exception 'Audit event scope mismatch: school-scoped event requires tenant';
    end if;

    select s.tenant_id into v_school_tenant
    from public.schools s
    where s.id = new.school_id;

    if v_school_tenant is null or v_school_tenant <> new.tenant_id then
      raise exception 'Audit event scope mismatch: school does not belong to tenant';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_audit_event_integrity() from public, anon, authenticated;

drop trigger if exists audit_event_integrity_trg on public.audit_events;
create trigger audit_event_integrity_trg
before insert or update
on public.audit_events
for each row execute function app_private.enforce_audit_event_integrity();