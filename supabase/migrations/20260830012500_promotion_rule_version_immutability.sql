-- Promotion decisions record rule_set_key + version as provenance. That provenance is
-- meaningful only if an activated version cannot later be rewritten in place.
-- Draft versions remain editable; active versions may only move to a terminal status,
-- and their conditions are frozen from activation onward.

create or replace function app_private.guard_promotion_rule_set_version_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Activated promotion rule versions cannot be deleted';
    end if;
    return old;
  end if;

  if old.status in ('active','superseded','archived') then
    if new.tenant_id is distinct from old.tenant_id
       or new.school_id is distinct from old.school_id
       or new.academic_year is distinct from old.academic_year
       or new.grade_id is distinct from old.grade_id
       or new.rule_set_key is distinct from old.rule_set_key
       or new.version is distinct from old.version
       or new.result_term_number is distinct from old.result_term_number
       or new.pass_outcome is distinct from old.pass_outcome
       or new.fail_outcome is distinct from old.fail_outcome
       or new.source_reference is distinct from old.source_reference
       or new.effective_from is distinct from old.effective_from
       or new.effective_to is distinct from old.effective_to
       or new.created_by_user_id is distinct from old.created_by_user_id
       or new.created_at is distinct from old.created_at then
      raise exception 'Activated promotion rule version content is immutable';
    end if;
  end if;

  if old.status = 'active' and new.status not in ('active','superseded','archived') then
    raise exception 'Active promotion rule versions may only be superseded or archived';
  end if;
  if old.status in ('superseded','archived') and new.status <> old.status then
    raise exception 'Terminal promotion rule versions are immutable';
  end if;

  return new;
end;
$$;

create or replace function app_private.guard_promotion_rule_condition_version_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_old_status text;
  v_new_status text;
begin
  if tg_op in ('UPDATE','DELETE') then
    select status into v_old_status
    from public.promotion_rule_sets
    where id = old.promotion_rule_set_id;

    if v_old_status is distinct from 'draft' then
      raise exception 'Conditions of an activated promotion rule version are immutable';
    end if;
  end if;

  if tg_op in ('INSERT','UPDATE') then
    select status into v_new_status
    from public.promotion_rule_sets
    where id = new.promotion_rule_set_id;

    if v_new_status is null then
      raise exception 'Promotion rule set does not exist';
    end if;
    if v_new_status <> 'draft' then
      raise exception 'Conditions can only be edited while the promotion rule version is draft';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function app_private.guard_promotion_rule_set_version_immutability()
  from public, anon, authenticated;
revoke all on function app_private.guard_promotion_rule_condition_version_immutability()
  from public, anon, authenticated;

drop trigger if exists promotion_rule_set_version_immutability_guard on public.promotion_rule_sets;
create trigger promotion_rule_set_version_immutability_guard
before update or delete on public.promotion_rule_sets
for each row execute function app_private.guard_promotion_rule_set_version_immutability();

drop trigger if exists promotion_rule_condition_version_immutability_guard on public.promotion_rule_conditions;
create trigger promotion_rule_condition_version_immutability_guard
before insert or update or delete on public.promotion_rule_conditions
for each row execute function app_private.guard_promotion_rule_condition_version_immutability();

comment on function app_private.guard_promotion_rule_set_version_immutability() is
  'Preserves rule_set_key/version provenance by preventing activated promotion policy content from being rewritten or deleted.';
comment on function app_private.guard_promotion_rule_condition_version_immutability() is
  'Allows condition editing only while the parent promotion rule version is draft; activated conditions require a new version.';