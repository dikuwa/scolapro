create or replace function app_private.enforce_detention_session_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
  v_staff_tenant uuid;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
  ) then
    raise exception 'Detention session tenant and school are immutable';
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Detention session scope mismatch: school does not belong to tenant';
  end if;

  if new.supervisor_staff_member_id is not null then
    select sm.tenant_id into v_staff_tenant
    from public.staff_members sm
    where sm.id = new.supervisor_staff_member_id;

    if v_staff_tenant is null or v_staff_tenant <> new.tenant_id then
      raise exception 'Detention session scope mismatch: supervisor does not belong to tenant';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_detention_session_scope_integrity() from public, anon, authenticated;

drop trigger if exists detention_session_scope_integrity_trg on public.detention_sessions;
create trigger detention_session_scope_integrity_trg
before insert or update of tenant_id, school_id, supervisor_staff_member_id
on public.detention_sessions
for each row execute function app_private.enforce_detention_session_scope_integrity();