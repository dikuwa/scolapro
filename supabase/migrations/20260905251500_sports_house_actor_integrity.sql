-- Bind Sports & Houses creator/assignment actor evidence to the existing school-management
-- authority model. Authenticated writes must name auth.uid(); trusted/RLS-bypassing writes
-- must still name an actor who actually holds active sports-management authority.

create or replace function app_private.user_can_manage_sports(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists(
      select 1
      from public.platform_memberships pm
      where pm.user_id = p_user_id
        and pm.role_key = 'platform_admin'
        and pm.active_from <= current_date
        and (pm.active_to is null or pm.active_to >= current_date)
    )
    or exists(
      select 1
      from public.school_memberships sm
      where sm.school_id = p_school_id
        and sm.user_id = p_user_id
        and sm.role_key in ('school_admin','principal','deputy_principal')
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
    );
$$;

revoke all on function app_private.user_can_manage_sports(uuid,uuid)
  from public, anon, authenticated;

comment on function app_private.user_can_manage_sports(uuid,uuid) is
'Arbitrary-user mirror of can_manage_sports(), used by physical provenance guards for trusted/RLS-bypassing Sports & Houses writes.';

create or replace function app_private.enforce_sports_configuration_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_actor uuid;
begin
  v_actor := new.created_by_user_id;

  if tg_op = 'UPDATE' then
    if new.tenant_id is distinct from old.tenant_id
       or new.school_id is distinct from old.school_id then
      raise exception 'Sports configuration tenant and school are immutable';
    end if;

    if new.created_by_user_id is distinct from old.created_by_user_id then
      raise exception 'Sports configuration creator provenance is immutable';
    end if;

    if tg_table_name = 'sports_year_settings'
       and new.academic_year is distinct from old.academic_year then
      raise exception 'Sports year settings academic year is immutable';
    end if;
  end if;

  if v_actor is null then
    raise exception 'Sports configuration creator is required';
  end if;

  if auth.uid() is not null
     and tg_op = 'INSERT'
     and v_actor is distinct from auth.uid() then
    raise exception 'Sports configuration creator must match authenticated actor';
  end if;

  if not app_private.user_can_manage_sports(v_actor,new.school_id) then
    raise exception 'Sports configuration creator is not authorized for school';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_sports_configuration_actor_integrity()
  from public, anon, authenticated;

comment on function app_private.enforce_sports_configuration_actor_integrity() is
'Prevents forged Sports & Houses configuration creators, freezes creator provenance and prevents configuration records from moving between school scopes.';

drop trigger if exists sports_house_creator_integrity_trg on public.sports_houses;
create trigger sports_house_creator_integrity_trg
before insert or update of tenant_id,school_id,created_by_user_id
on public.sports_houses
for each row execute function app_private.enforce_sports_configuration_actor_integrity();

drop trigger if exists sports_year_settings_creator_integrity_trg on public.sports_year_settings;
create trigger sports_year_settings_creator_integrity_trg
before insert or update of tenant_id,school_id,academic_year,created_by_user_id
on public.sports_year_settings
for each row execute function app_private.enforce_sports_configuration_actor_integrity();

drop trigger if exists sports_age_group_creator_integrity_trg on public.sports_age_groups;
create trigger sports_age_group_creator_integrity_trg
before insert or update of tenant_id,school_id,created_by_user_id
on public.sports_age_groups
for each row execute function app_private.enforce_sports_configuration_actor_integrity();

create or replace function app_private.enforce_sports_assignment_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_semantic_change boolean := false;
begin
  if new.assigned_by_user_id is null then
    raise exception 'Sports house assignment actor is required';
  end if;

  if tg_op = 'UPDATE' then
    if new.tenant_id is distinct from old.tenant_id
       or new.school_id is distinct from old.school_id
       or new.academic_year is distinct from old.academic_year then
      raise exception 'Sports house assignment scope is immutable';
    end if;

    if tg_table_name = 'sports_learner_house_assignments'
       and new.learner_id is distinct from old.learner_id then
      raise exception 'Sports learner assignment identity is immutable';
    end if;

    if tg_table_name = 'sports_staff_house_assignments'
       and new.staff_member_id is distinct from old.staff_member_id then
      raise exception 'Sports staff assignment identity is immutable';
    end if;

    if tg_table_name = 'sports_learner_house_assignments' then
      v_semantic_change := new.house_id is distinct from old.house_id
        or new.assignment_source is distinct from old.assignment_source
        or new.is_locked is distinct from old.is_locked;
    else
      v_semantic_change := new.house_id is distinct from old.house_id
        or new.role_key is distinct from old.role_key
        or new.assignment_source is distinct from old.assignment_source
        or new.is_locked is distinct from old.is_locked;
    end if;

    if not v_semantic_change
       and (new.assigned_by_user_id is distinct from old.assigned_by_user_id
            or new.assigned_at is distinct from old.assigned_at) then
      raise exception 'Sports house assignment actor evidence may change only with the assignment';
    end if;
  end if;

  if auth.uid() is not null
     and new.assigned_by_user_id is distinct from auth.uid() then
    raise exception 'Sports house assignment actor must match authenticated actor';
  end if;

  if not app_private.user_can_manage_sports(new.assigned_by_user_id,new.school_id) then
    raise exception 'Sports house assignment actor is not authorized for school';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_sports_assignment_actor_integrity()
  from public, anon, authenticated;

comment on function app_private.enforce_sports_assignment_actor_integrity() is
'Binds learner/staff house assignment actor evidence to active Sports & Houses authority, freezes assignment scope, and prevents actor-only provenance rewrites without a real assignment change.';

drop trigger if exists sports_learner_house_actor_integrity_trg on public.sports_learner_house_assignments;
create trigger sports_learner_house_actor_integrity_trg
before insert or update
on public.sports_learner_house_assignments
for each row execute function app_private.enforce_sports_assignment_actor_integrity();

drop trigger if exists sports_staff_house_actor_integrity_trg on public.sports_staff_house_assignments;
create trigger sports_staff_house_actor_integrity_trg
before insert or update
on public.sports_staff_house_assignments
for each row execute function app_private.enforce_sports_assignment_actor_integrity();
