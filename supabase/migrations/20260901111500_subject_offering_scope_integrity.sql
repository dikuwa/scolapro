create or replace function app_private.enforce_subject_offering_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
  v_subject_tenant uuid;
  v_subject_school uuid;
  v_grade_tenant uuid;
  v_grade_school uuid;
  v_grade_year integer;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.academic_year is distinct from old.academic_year
    or new.subject_id is distinct from old.subject_id
    or new.grade_id is distinct from old.grade_id
  ) then
    raise exception 'Subject offering tenant, school, academic year, subject, and grade are immutable';
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Subject offering scope mismatch: school does not belong to tenant';
  end if;

  select s.tenant_id, s.school_id
    into v_subject_tenant, v_subject_school
  from public.subjects s
  where s.id = new.subject_id;

  if v_subject_tenant is null
     or v_subject_tenant <> new.tenant_id
     or v_subject_school <> new.school_id then
    raise exception 'Subject offering scope mismatch: subject does not belong to tenant and school';
  end if;

  select g.tenant_id, g.school_id, g.academic_year
    into v_grade_tenant, v_grade_school, v_grade_year
  from public.grades g
  where g.id = new.grade_id;

  if v_grade_tenant is null
     or v_grade_tenant <> new.tenant_id
     or v_grade_school <> new.school_id
     or v_grade_year <> new.academic_year then
    raise exception 'Subject offering scope mismatch: grade does not belong to tenant, school, and academic year';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_subject_offering_scope_integrity() from public, anon, authenticated;

drop trigger if exists subject_offering_scope_integrity_trg on public.subject_offerings;
create trigger subject_offering_scope_integrity_trg
before insert or update of tenant_id, school_id, academic_year, subject_id, grade_id
on public.subject_offerings
for each row execute function app_private.enforce_subject_offering_scope_integrity();
