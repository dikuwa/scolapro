create or replace function app_private.user_can_manage_communication_templates(
  p_user_id uuid,
  p_school_id uuid,
  p_on_date date default current_date
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    exists (
      select 1
      from public.platform_memberships pm
      where pm.user_id = p_user_id
        and pm.role_key = 'platform_admin'
        and pm.active_from <= p_on_date
        and (pm.active_to is null or pm.active_to >= p_on_date)
    )
    or exists (
      select 1
      from public.school_memberships sm
      where sm.school_id = p_school_id
        and sm.user_id = p_user_id
        and sm.role_key = any(array['school_admin','principal','deputy_principal'])
        and sm.active_from <= p_on_date
        and (sm.active_to is null or sm.active_to >= p_on_date)
    ),
    false
  );
$$;

revoke all on function app_private.user_can_manage_communication_templates(uuid,uuid,date)
  from public, anon, authenticated;

create or replace function app_private.enforce_communication_template_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_school_tenant uuid;
  v_on_date date := coalesce(new.created_at::date,current_date);
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.template_key is distinct from old.template_key
    or new.channel is distinct from old.channel
    or new.created_by_user_id is distinct from old.created_by_user_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Communication template scope and identity are immutable';
  end if;

  select s.tenant_id
    into v_school_tenant
    from public.schools s
   where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Communication template scope mismatch: school does not belong to tenant';
  end if;

  if not app_private.user_can_manage_communication_templates(
    new.created_by_user_id,
    new.school_id,
    v_on_date
  ) then
    raise exception 'Communication template creator is not authorized for school';
  end if;

  if tg_op = 'INSERT'
     and auth.uid() is not null
     and new.created_by_user_id is distinct from auth.uid() then
    raise exception 'Communication template creator must match authenticated actor';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_communication_template_scope_integrity()
  from public, anon, authenticated;

create or replace function app_private.enforce_communication_template_version_provenance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_school_id uuid;
  v_created_on date := coalesce(new.created_at::date,current_date);
  v_approved_on date;
begin
  select t.school_id
    into v_school_id
    from public.communication_templates t
   where t.id = new.template_id;

  if v_school_id is null then
    raise exception 'Communication template version parent not found';
  end if;

  if tg_op = 'UPDATE' and (
    new.template_id is distinct from old.template_id
    or new.version is distinct from old.version
    or new.language is distinct from old.language
    or new.body_preview is distinct from old.body_preview
    or new.variables is distinct from old.variables
    or new.created_by_user_id is distinct from old.created_by_user_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Communication template version provenance is immutable';
  end if;

  if not app_private.user_can_manage_communication_templates(
    new.created_by_user_id,
    v_school_id,
    v_created_on
  ) then
    raise exception 'Communication template version creator is not authorized for school';
  end if;

  if tg_op = 'INSERT'
     and auth.uid() is not null
     and new.created_by_user_id is distinct from auth.uid() then
    raise exception 'Communication template version creator must match authenticated actor';
  end if;

  if tg_op = 'UPDATE' then
    if old.approved_by_user_id is not null
       and new.approved_by_user_id is distinct from old.approved_by_user_id then
      raise exception 'Communication template version approval provenance is immutable';
    end if;
    if old.approved_at is not null
       and new.approved_at is distinct from old.approved_at then
      raise exception 'Communication template version approval provenance is immutable';
    end if;
  end if;

  if new.status = 'approved' then
    if new.approved_by_user_id is null or new.approved_at is null then
      raise exception 'Approved communication template version requires approval provenance';
    end if;

    v_approved_on := new.approved_at::date;
    if not app_private.user_can_manage_communication_templates(
      new.approved_by_user_id,
      v_school_id,
      v_approved_on
    ) then
      raise exception 'Communication template version approver is not authorized for school';
    end if;

    if (tg_op = 'INSERT' or old.status is distinct from 'approved')
       and auth.uid() is not null
       and new.approved_by_user_id is distinct from auth.uid() then
      raise exception 'Communication template version approver must match authenticated actor';
    end if;
  elsif tg_op = 'INSERT' and (
    new.approved_by_user_id is not null or new.approved_at is not null
  ) then
    raise exception 'Communication template approval provenance requires approved status';
  elsif tg_op = 'UPDATE'
        and old.approved_by_user_id is null
        and (new.approved_by_user_id is not null or new.approved_at is not null)
        and new.status <> 'approved' then
    raise exception 'Communication template approval provenance requires approved status';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_communication_template_version_provenance()
  from public, anon, authenticated;

-- The earlier scope migration only fired this trigger for immutable content columns.
-- Approval provenance is part of this integrity boundary too, so include the lifecycle
-- fields that can introduce or rewrite approval identity.
drop trigger if exists communication_template_versions_provenance_trg on public.communication_template_versions;
create trigger communication_template_versions_provenance_trg
before insert or update of template_id, version, language, body_preview, variables,
  status, approved_by_user_id, approved_at, created_by_user_id, created_at
on public.communication_template_versions
for each row execute function app_private.enforce_communication_template_version_provenance();

comment on function app_private.user_can_manage_communication_templates(uuid,uuid,date) is
'Checks whether a user was an effective platform administrator or school template manager (school admin, principal, deputy principal) on a given date.';

comment on function app_private.enforce_communication_template_scope_integrity() is
'Keeps template scope/creator provenance immutable and requires the recorded creator to have effective communication-template management authority.';

comment on function app_private.enforce_communication_template_version_provenance() is
'Keeps template-version content/creator provenance immutable, validates creator authority, and binds approval provenance to an effective authorized manager without allowing later approver rewrites.';
