create or replace function app_private.enforce_communication_template_scope_integrity()
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

  return new;
end;
$$;

revoke all on function app_private.enforce_communication_template_scope_integrity() from public, anon, authenticated;

drop trigger if exists communication_templates_scope_integrity_trg on public.communication_templates;
create trigger communication_templates_scope_integrity_trg
before insert or update of tenant_id, school_id, template_key, channel, created_by_user_id, created_at
on public.communication_templates
for each row execute function app_private.enforce_communication_template_scope_integrity();

create or replace function app_private.enforce_communication_template_version_provenance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
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

  if not exists (
    select 1
      from public.communication_templates t
     where t.id = new.template_id
  ) then
    raise exception 'Communication template version parent not found';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_communication_template_version_provenance() from public, anon, authenticated;

drop trigger if exists communication_template_versions_provenance_trg on public.communication_template_versions;
create trigger communication_template_versions_provenance_trg
before insert or update of template_id, version, language, body_preview, variables, created_by_user_id, created_at
on public.communication_template_versions
for each row execute function app_private.enforce_communication_template_version_provenance();

create or replace function app_private.enforce_communication_provider_template_binding_provenance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' and (
    new.template_version_id is distinct from old.template_version_id
    or new.provider_key is distinct from old.provider_key
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Communication provider template binding provenance is immutable';
  end if;

  if not exists (
    select 1
      from public.communication_template_versions v
     where v.id = new.template_version_id
  ) then
    raise exception 'Communication provider template binding version not found';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_communication_provider_template_binding_provenance() from public, anon, authenticated;

drop trigger if exists communication_provider_template_bindings_provenance_trg on public.communication_provider_template_bindings;
create trigger communication_provider_template_bindings_provenance_trg
before insert or update of template_version_id, provider_key, created_at
on public.communication_provider_template_bindings
for each row execute function app_private.enforce_communication_provider_template_binding_provenance();
