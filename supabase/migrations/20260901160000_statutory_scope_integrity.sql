create or replace function app_private.enforce_statutory_reporting_cycle_scope_integrity()
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
    or new.form_version_id is distinct from old.form_version_id
    or new.academic_year is distinct from old.academic_year
    or new.cycle_key is distinct from old.cycle_key
  ) then
    raise exception 'Statutory reporting cycle tenant, school, form version, academic year, and cycle key are immutable';
  end if;

  select s.tenant_id into v_school_tenant from public.schools s where s.id = new.school_id;
  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Statutory reporting cycle scope mismatch: school does not belong to tenant';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_statutory_reporting_cycle_scope_integrity() from public, anon, authenticated;

drop trigger if exists statutory_reporting_cycle_scope_integrity_trg on public.statutory_reporting_cycles;
create trigger statutory_reporting_cycle_scope_integrity_trg
before insert or update of tenant_id, school_id, form_version_id, academic_year, cycle_key
on public.statutory_reporting_cycles
for each row execute function app_private.enforce_statutory_reporting_cycle_scope_integrity();

create or replace function app_private.enforce_statutory_mapping_run_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cycle public.statutory_reporting_cycles%rowtype;
  v_snapshot public.statutory_snapshots%rowtype;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.reporting_cycle_id is distinct from old.reporting_cycle_id
    or new.snapshot_id is distinct from old.snapshot_id
    or new.form_version_id is distinct from old.form_version_id
  ) then
    raise exception 'Statutory mapping run scope, snapshot, and form version are immutable';
  end if;

  select * into v_cycle from public.statutory_reporting_cycles where id = new.reporting_cycle_id;
  if not found
    or (v_cycle.tenant_id,v_cycle.school_id,v_cycle.form_version_id)
       is distinct from (new.tenant_id,new.school_id,new.form_version_id) then
    raise exception 'Statutory mapping run scope mismatch: reporting cycle does not match run scope and form version';
  end if;

  select * into v_snapshot from public.statutory_snapshots where id = new.snapshot_id;
  if not found
    or (v_snapshot.tenant_id,v_snapshot.school_id,v_snapshot.reporting_cycle_id)
       is distinct from (new.tenant_id,new.school_id,new.reporting_cycle_id) then
    raise exception 'Statutory mapping run scope mismatch: snapshot does not match reporting cycle';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_statutory_mapping_run_scope_integrity() from public, anon, authenticated;

drop trigger if exists statutory_mapping_run_scope_integrity_trg on public.statutory_mapping_runs;
create trigger statutory_mapping_run_scope_integrity_trg
before insert or update of tenant_id, school_id, reporting_cycle_id, snapshot_id, form_version_id
on public.statutory_mapping_runs
for each row execute function app_private.enforce_statutory_mapping_run_scope_integrity();