create or replace function app_private.enforce_communication_message_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
  v_template_tenant uuid;
  v_template_school uuid;
  v_template_channel text;
  v_on_date date := coalesce(new.created_at::date, current_date);
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.created_by_user_id is distinct from old.created_by_user_id
  ) then
    raise exception 'Communication message scope and author are immutable';
  end if;

  select s.tenant_id
    into v_school_tenant
    from public.schools s
   where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Communication scope mismatch: school does not belong to tenant';
  end if;

  if not (
    exists (
      select 1
      from public.platform_memberships pm
      where pm.user_id = new.created_by_user_id
        and pm.role_key = 'platform_admin'
        and pm.active_from <= v_on_date
        and (pm.active_to is null or pm.active_to >= v_on_date)
    )
    or exists (
      select 1
      from public.school_memberships sm
      where sm.tenant_id = new.tenant_id
        and sm.school_id = new.school_id
        and sm.user_id = new.created_by_user_id
        and sm.role_key = any(array['school_admin','principal','deputy_principal','hod','teacher','class_teacher','counsellor'])
        and sm.active_from <= v_on_date
        and (sm.active_to is null or sm.active_to >= v_on_date)
    )
  ) then
    raise exception 'Communication scope mismatch: author is not authorized for school';
  end if;

  if new.template_version_id is not null then
    select t.tenant_id, t.school_id, t.channel
      into v_template_tenant, v_template_school, v_template_channel
      from public.communication_template_versions v
      join public.communication_templates t on t.id = v.template_id
     where v.id = new.template_version_id;

    if v_template_tenant is null then
      raise exception 'Communication template version not found';
    end if;

    if v_template_tenant <> new.tenant_id
       or v_template_school <> new.school_id
       or v_template_channel <> new.channel then
      raise exception 'Communication template version does not match message scope/channel';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_communication_message_scope_integrity() from public, anon, authenticated;

comment on function app_private.enforce_communication_message_scope_integrity() is
'Keeps communication scope and author immutable, binds school-scoped message authors to an effective authorized school role or platform administrator, and preserves template scope/channel integrity.';
