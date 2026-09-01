create or replace function app_private.enforce_school_scoped_catalog_root()
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
    raise exception '% tenant and school scope are immutable', tg_table_name;
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception '% scope mismatch: school does not belong to tenant', tg_table_name;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_school_scoped_catalog_root() from public, anon, authenticated;

drop trigger if exists subjects_scope_integrity_trg on public.subjects;
create trigger subjects_scope_integrity_trg
before insert or update of tenant_id, school_id
on public.subjects
for each row execute function app_private.enforce_school_scoped_catalog_root();

drop trigger if exists grades_scope_integrity_trg on public.grades;
create trigger grades_scope_integrity_trg
before insert or update of tenant_id, school_id
on public.grades
for each row execute function app_private.enforce_school_scoped_catalog_root();
