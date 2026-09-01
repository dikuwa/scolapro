create or replace function app_private.enforce_assessment_scheme_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_school_tenant uuid;
  v_offering_tenant uuid;
  v_offering_school uuid;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.subject_offering_id is distinct from old.subject_offering_id
  ) then
    raise exception 'Assessment scheme tenant, school, and subject offering are immutable';
  end if;

  select s.tenant_id
    into v_school_tenant
    from public.schools s
   where s.id = new.school_id;

  if v_school_tenant is null then
    raise exception 'Assessment scheme school does not exist';
  end if;

  if new.tenant_id is distinct from v_school_tenant then
    raise exception 'Assessment scheme scope mismatch: school does not belong to tenant';
  end if;

  select so.tenant_id, so.school_id
    into v_offering_tenant, v_offering_school
    from public.subject_offerings so
   where so.id = new.subject_offering_id;

  if v_offering_tenant is null then
    raise exception 'Assessment scheme subject offering does not exist';
  end if;

  if new.tenant_id is distinct from v_offering_tenant
     or new.school_id is distinct from v_offering_school then
    raise exception 'Assessment scheme scope mismatch: subject offering does not belong to school';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_assessment_scheme_scope_integrity() from public;
revoke all on function app_private.enforce_assessment_scheme_scope_integrity() from anon;
revoke all on function app_private.enforce_assessment_scheme_scope_integrity() from authenticated;

drop trigger if exists assessment_scheme_scope_integrity_trg on public.assessment_schemes;
create trigger assessment_scheme_scope_integrity_trg
before insert or update on public.assessment_schemes
for each row execute function app_private.enforce_assessment_scheme_scope_integrity();
