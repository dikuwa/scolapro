create or replace function app_private.enforce_learning_resource_title_scope_integrity()
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
  ) then
    raise exception 'Learning resource title tenant and school scope are immutable';
  end if;

  select s.tenant_id
    into v_school_tenant
    from public.schools s
   where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Learning resource title scope mismatch: school does not belong to tenant';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_learning_resource_title_scope_integrity() from public, anon, authenticated;

drop trigger if exists learning_resource_title_scope_integrity_guard on public.learning_resource_titles;
create trigger learning_resource_title_scope_integrity_guard
before insert or update of tenant_id, school_id
on public.learning_resource_titles
for each row execute function app_private.enforce_learning_resource_title_scope_integrity();
