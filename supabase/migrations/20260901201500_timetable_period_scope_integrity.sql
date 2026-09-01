create or replace function app_private.enforce_timetable_period_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_school_tenant uuid;
begin
  select tenant_id
    into v_school_tenant
    from public.schools
   where id = new.school_id;

  if v_school_tenant is null or new.tenant_id is distinct from v_school_tenant then
    raise exception 'Timetable period scope mismatch: school does not belong to tenant';
  end if;

  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.academic_year is distinct from old.academic_year
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Timetable period root scope and provenance are immutable';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_timetable_period_scope_integrity() from public, anon, authenticated;

drop trigger if exists timetable_period_scope_integrity_trg on public.timetable_periods;
create trigger timetable_period_scope_integrity_trg
before insert or update on public.timetable_periods
for each row execute function app_private.enforce_timetable_period_scope_integrity();
