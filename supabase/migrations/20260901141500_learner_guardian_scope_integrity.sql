create or replace function app_private.enforce_learner_guardian_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_learner_tenant uuid;
  v_guardian_tenant uuid;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.learner_id is distinct from old.learner_id
    or new.guardian_id is distinct from old.guardian_id
  ) then
    raise exception 'Learner guardian tenant, learner, and guardian are immutable';
  end if;

  select l.tenant_id into v_learner_tenant
  from public.learners l
  where l.id = new.learner_id;

  if v_learner_tenant is null or v_learner_tenant <> new.tenant_id then
    raise exception 'Learner guardian scope mismatch: learner does not belong to tenant';
  end if;

  select g.tenant_id into v_guardian_tenant
  from public.guardian_profiles g
  where g.id = new.guardian_id;

  if v_guardian_tenant is null or v_guardian_tenant <> new.tenant_id then
    raise exception 'Learner guardian scope mismatch: guardian does not belong to tenant';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_learner_guardian_scope_integrity() from public, anon, authenticated;

drop trigger if exists learner_guardian_scope_integrity_trg on public.learner_guardians;
create trigger learner_guardian_scope_integrity_trg
before insert or update of tenant_id, learner_id, guardian_id
on public.learner_guardians
for each row execute function app_private.enforce_learner_guardian_scope_integrity();