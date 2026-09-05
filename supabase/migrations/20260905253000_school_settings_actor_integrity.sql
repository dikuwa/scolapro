-- Make school-setting provenance physical rather than advisory.
-- Every future write is bound to a real, currently-authorized actor and the
-- setting cannot be moved to another school/tenant or rewritten under a
-- different identity.

create or replace function app_private.user_can_manage_school_settings(
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

revoke all on function app_private.user_can_manage_school_settings(uuid,uuid)
  from public, anon, authenticated;

comment on function app_private.user_can_manage_school_settings(uuid,uuid) is
'Arbitrary-user authority mirror for physical school-settings provenance checks; includes the governed report-card settings role set.';

create or replace function app_private.enforce_school_settings_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_school_tenant uuid;
  v_actor uuid;
begin
  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id = new.school_id;

  if v_school_tenant is null then
    raise exception 'School setting school does not exist';
  end if;
  if new.tenant_id is distinct from v_school_tenant then
    raise exception 'School setting tenant must match school tenant';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.school_id is distinct from old.school_id
       or new.setting_key is distinct from old.setting_key
       or new.created_at is distinct from old.created_at then
      raise exception 'School setting identity and creation provenance are immutable';
    end if;

    if new.tenant_id is distinct from old.tenant_id then
      raise exception 'School setting tenant is immutable';
    end if;
  end if;

  if auth.uid() is not null then
    if new.updated_by_user_id is not null
       and new.updated_by_user_id is distinct from auth.uid() then
      raise exception 'School setting actor must match authenticated actor';
    end if;
    new.updated_by_user_id := auth.uid();
  end if;

  v_actor := new.updated_by_user_id;
  if v_actor is null then
    raise exception 'School setting actor is required';
  end if;

  if not app_private.user_can_manage_school_settings(v_actor,new.school_id) then
    raise exception 'School setting actor is not authorized for school';
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_school_settings_actor_integrity()
  from public, anon, authenticated;

comment on function app_private.enforce_school_settings_actor_integrity() is
'Binds school-setting changes to an active authorized actor, validates tenant/school scope, and freezes setting identity.';

drop trigger if exists school_settings_actor_integrity_trg on public.school_settings;
create trigger school_settings_actor_integrity_trg
before insert or update
on public.school_settings
for each row execute function app_private.enforce_school_settings_actor_integrity();
