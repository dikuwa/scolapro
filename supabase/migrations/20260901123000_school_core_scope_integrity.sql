create or replace function app_private.enforce_school_scoped_root_integrity()
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
    raise exception '% tenant and school are immutable', tg_table_name;
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

revoke all on function app_private.enforce_school_scoped_root_integrity() from public, anon, authenticated;

drop trigger if exists school_settings_scope_integrity_trg on public.school_settings;
create trigger school_settings_scope_integrity_trg
before insert or update of tenant_id, school_id on public.school_settings
for each row execute function app_private.enforce_school_scoped_root_integrity();

drop trigger if exists grading_scales_scope_integrity_trg on public.grading_scales;
create trigger grading_scales_scope_integrity_trg
before insert or update of tenant_id, school_id on public.grading_scales
for each row execute function app_private.enforce_school_scoped_root_integrity();

drop trigger if exists examination_cycles_scope_integrity_trg on public.examination_cycles;
create trigger examination_cycles_scope_integrity_trg
before insert or update of tenant_id, school_id on public.examination_cycles
for each row execute function app_private.enforce_school_scoped_root_integrity();

drop trigger if exists late_arrival_policy_scope_integrity_trg on public.school_late_arrival_policies;
create trigger late_arrival_policy_scope_integrity_trg
before insert or update of tenant_id, school_id on public.school_late_arrival_policies
for each row execute function app_private.enforce_school_scoped_root_integrity();

create or replace function app_private.enforce_detention_supervision_preference_scope_integrity()
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
    or new.staff_member_id is distinct from old.staff_member_id
  ) then
    raise exception 'Detention supervision preference tenant, school, and staff identity are immutable';
  end if;

  select s.tenant_id into v_school_tenant from public.schools s where s.id=new.school_id;
  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Detention supervision preference scope mismatch: school does not belong to tenant';
  end if;

  select sm.tenant_id into v_staff_tenant from public.staff_members sm where sm.id=new.staff_member_id;
  if v_staff_tenant is null or v_staff_tenant <> new.tenant_id then
    raise exception 'Detention supervision preference scope mismatch: staff member does not belong to tenant';
  end if;

  if not exists (
    select 1 from public.staff_school_assignments ssa
    where ssa.tenant_id=new.tenant_id
      and ssa.school_id=new.school_id
      and ssa.staff_member_id=new.staff_member_id
      and ssa.effective_from<=current_date
      and (ssa.effective_to is null or ssa.effective_to>=current_date)
  ) then
    raise exception 'Detention supervision preference scope mismatch: staff member has no current school assignment';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_detention_supervision_preference_scope_integrity() from public, anon, authenticated;

drop trigger if exists detention_supervision_preference_scope_integrity_trg on public.detention_supervision_preferences;
create trigger detention_supervision_preference_scope_integrity_trg
before insert or update of tenant_id, school_id, staff_member_id on public.detention_supervision_preferences
for each row execute function app_private.enforce_detention_supervision_preference_scope_integrity();
