create or replace function app_private.enforce_school_admission_sequence_scope_integrity()
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
    raise exception 'School admission sequence tenant and school are immutable';
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'School admission sequence scope mismatch: school does not belong to tenant';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_school_admission_sequence_scope_integrity() from public, anon, authenticated;

drop trigger if exists school_admission_sequence_scope_integrity_trg on public.school_admission_sequences;
create trigger school_admission_sequence_scope_integrity_trg
before insert or update of tenant_id, school_id
on public.school_admission_sequences
for each row execute function app_private.enforce_school_admission_sequence_scope_integrity();

create or replace function app_private.enforce_school_learner_identifier_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
  v_learner_tenant uuid;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.learner_id is distinct from old.learner_id
  ) then
    raise exception 'School learner identifier tenant, school, and learner are immutable';
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'School learner identifier scope mismatch: school does not belong to tenant';
  end if;

  select l.tenant_id into v_learner_tenant
  from public.learners l
  where l.id = new.learner_id;

  if v_learner_tenant is null or v_learner_tenant <> new.tenant_id then
    raise exception 'School learner identifier scope mismatch: learner does not belong to tenant';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_school_learner_identifier_scope_integrity() from public, anon, authenticated;

drop trigger if exists school_learner_identifier_scope_integrity_trg on public.school_learner_identifiers;
create trigger school_learner_identifier_scope_integrity_trg
before insert or update of tenant_id, school_id, learner_id
on public.school_learner_identifiers
for each row execute function app_private.enforce_school_learner_identifier_scope_integrity();
