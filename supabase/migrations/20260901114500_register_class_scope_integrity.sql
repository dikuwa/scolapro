create or replace function app_private.enforce_register_class_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
  v_grade_tenant uuid;
  v_grade_school uuid;
  v_grade_year integer;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.grade_id is distinct from old.grade_id
    or new.academic_year is distinct from old.academic_year
  ) then
    raise exception 'Register class tenant, school, grade, and academic year are immutable';
  end if;

  select s.tenant_id into v_school_tenant from public.schools s where s.id=new.school_id;
  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Register class scope mismatch: school does not belong to tenant';
  end if;

  select g.tenant_id,g.school_id,g.academic_year into v_grade_tenant,v_grade_school,v_grade_year
  from public.grades g where g.id=new.grade_id;
  if v_grade_tenant is null or v_grade_tenant <> new.tenant_id or v_grade_school <> new.school_id or v_grade_year <> new.academic_year then
    raise exception 'Register class scope mismatch: grade does not belong to tenant, school, and academic year';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_register_class_scope_integrity() from public, anon, authenticated;

drop trigger if exists register_class_scope_integrity_trg on public.register_classes;
create trigger register_class_scope_integrity_trg
before insert or update of tenant_id, school_id, grade_id, academic_year
on public.register_classes
for each row execute function app_private.enforce_register_class_scope_integrity();
