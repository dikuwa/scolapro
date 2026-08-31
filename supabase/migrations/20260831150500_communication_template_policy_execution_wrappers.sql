-- Communication template policies must not directly invoke private authorization helpers
-- whose EXECUTE privilege is intentionally withheld from authenticated clients.
-- Expose only narrow SECURITY DEFINER wrappers for RLS evaluation, matching the
-- established storage-policy wrapper pattern.

create or replace function app_private.can_read_communication_template_school(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.can_author_communications(p_school_id);
$$;

revoke all on function app_private.can_read_communication_template_school(uuid) from public,anon;
grant execute on function app_private.can_read_communication_template_school(uuid) to authenticated;

create or replace function app_private.can_read_communication_provider_template_binding(p_template_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select exists(
    select 1
    from public.communication_template_versions v
    join public.communication_templates t on t.id=v.template_id
    where v.id=p_template_version_id
      and (
        app_private.has_platform_role(array['platform_admin'])
        or app_private.has_school_role(t.school_id,array['school_admin','principal','deputy_principal'])
      )
  );
$$;

revoke all on function app_private.can_read_communication_provider_template_binding(uuid) from public,anon;
grant execute on function app_private.can_read_communication_provider_template_binding(uuid) to authenticated;

drop policy if exists "communication authors read school templates" on public.communication_templates;
create policy "communication authors read school templates"
on public.communication_templates for select to authenticated
using (app_private.can_read_communication_template_school(school_id));

drop policy if exists "communication authors read school template versions" on public.communication_template_versions;
create policy "communication authors read school template versions"
on public.communication_template_versions for select to authenticated
using (exists(
  select 1 from public.communication_templates t
  where t.id=communication_template_versions.template_id
    and app_private.can_read_communication_template_school(t.school_id)
));

drop policy if exists "communication leaders read provider template bindings" on public.communication_provider_template_bindings;
create policy "communication leaders read provider template bindings"
on public.communication_provider_template_bindings for select to authenticated
using (app_private.can_read_communication_provider_template_binding(template_version_id));

comment on function app_private.can_read_communication_template_school(uuid) is
'RLS-only wrapper. Evaluates communication-template school read scope through the private communication-author authorization helper without granting clients direct access to that helper.';

comment on function app_private.can_read_communication_provider_template_binding(uuid) is
'RLS-only wrapper. Allows only platform administration or school leadership to read provider-template binding metadata without exposing private role helpers directly.';
