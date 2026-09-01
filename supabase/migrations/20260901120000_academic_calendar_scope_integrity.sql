create or replace function app_private.enforce_academic_year_scope_integrity()
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
    or new.year is distinct from old.year
  ) then
    raise exception 'Academic year tenant, school, and year are immutable';
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Academic year scope mismatch: school does not belong to tenant';
  end if;

  return new;
end;
$$;

create or replace function app_private.enforce_academic_term_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
  v_year_tenant uuid;
  v_year_school uuid;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.academic_year_id is distinct from old.academic_year_id
    or new.term_number is distinct from old.term_number
  ) then
    raise exception 'Academic term tenant, school, year, and term number are immutable';
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Academic term scope mismatch: school does not belong to tenant';
  end if;

  select ay.tenant_id, ay.school_id
    into v_year_tenant, v_year_school
  from public.academic_years ay
  where ay.id = new.academic_year_id;

  if v_year_tenant is null
     or v_year_tenant <> new.tenant_id
     or v_year_school <> new.school_id then
    raise exception 'Academic term scope mismatch: academic year does not belong to school';
  end if;

  return new;
end;
$$;

create or replace function app_private.enforce_school_day_override_scope_integrity()
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
    or new.school_date is distinct from old.school_date
  ) then
    raise exception 'School-day override tenant, school, and date are immutable';
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'School-day override scope mismatch: school does not belong to tenant';
  end if;

  return new;
end;
$$;

create or replace function app_private.enforce_timetable_period_scope_integrity()
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
    or new.academic_year is distinct from old.academic_year
    or new.period_number is distinct from old.period_number
  ) then
    raise exception 'Timetable period tenant, school, academic year, and period number are immutable';
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Timetable period scope mismatch: school does not belong to tenant';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_academic_year_scope_integrity() from public, anon, authenticated;
revoke all on function app_private.enforce_academic_term_scope_integrity() from public, anon, authenticated;
revoke all on function app_private.enforce_school_day_override_scope_integrity() from public, anon, authenticated;
revoke all on function app_private.enforce_timetable_period_scope_integrity() from public, anon, authenticated;

drop trigger if exists academic_year_scope_integrity_trg on public.academic_years;
create trigger academic_year_scope_integrity_trg
before insert or update of tenant_id, school_id, year
on public.academic_years
for each row execute function app_private.enforce_academic_year_scope_integrity();

drop trigger if exists academic_term_scope_integrity_trg on public.academic_terms;
create trigger academic_term_scope_integrity_trg
before insert or update of tenant_id, school_id, academic_year_id, term_number
on public.academic_terms
for each row execute function app_private.enforce_academic_term_scope_integrity();

drop trigger if exists school_day_override_scope_integrity_trg on public.school_day_overrides;
create trigger school_day_override_scope_integrity_trg
before insert or update of tenant_id, school_id, school_date
on public.school_day_overrides
for each row execute function app_private.enforce_school_day_override_scope_integrity();

drop trigger if exists timetable_period_scope_integrity_trg on public.timetable_periods;
create trigger timetable_period_scope_integrity_trg
before insert or update of tenant_id, school_id, academic_year, period_number
on public.timetable_periods
for each row execute function app_private.enforce_timetable_period_scope_integrity();
