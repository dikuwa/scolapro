create or replace function app_private.enforce_profile_change_request_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_school_tenant uuid;
  v_learner_tenant uuid;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.learner_id is distinct from old.learner_id
    or new.target_type is distinct from old.target_type
    or new.target_id is distinct from old.target_id
    or new.field_key is distinct from old.field_key
    or new.current_value is distinct from old.current_value
    or new.proposed_value is distinct from old.proposed_value
    or new.requested_by_user_id is distinct from old.requested_by_user_id
    or new.requested_at is distinct from old.requested_at
  ) then
    raise exception 'Profile change request scope and submitted proposal are immutable';
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Profile change request scope mismatch: school does not belong to tenant';
  end if;

  select l.tenant_id into v_learner_tenant
  from public.learners l
  where l.id = new.learner_id;

  if v_learner_tenant is null or v_learner_tenant <> new.tenant_id then
    raise exception 'Profile change request scope mismatch: learner does not belong to tenant';
  end if;

  if not app_private.profile_change_target_is_valid(new.learner_id, new.target_type, new.target_id) then
    raise exception 'Profile change request scope mismatch: target is not linked to learner';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_profile_change_request_scope_integrity() from public, anon, authenticated;

drop trigger if exists profile_change_request_scope_integrity_trg on public.profile_change_requests;
create trigger profile_change_request_scope_integrity_trg
before insert or update of tenant_id, school_id, learner_id, target_type, target_id, field_key, current_value, proposed_value, requested_by_user_id, requested_at
on public.profile_change_requests
for each row execute function app_private.enforce_profile_change_request_scope_integrity();