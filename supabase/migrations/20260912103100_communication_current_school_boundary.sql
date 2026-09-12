-- Bind authenticated school-operational communication access to the same
-- deterministic current-school rule used by application auth context.
-- Service/worker execution remains unchanged; platform_admin retains its existing
-- explicit platform override. Platform Support is not granted an override.

create or replace function app_private.is_current_school(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_school_id is not null
     and p_school_id = (
       select sm.school_id
       from public.school_memberships sm
       where sm.user_id = auth.uid()
         and sm.active_from <= current_date
         and (sm.active_to is null or sm.active_to >= current_date)
       order by sm.active_from desc, sm.id asc
       limit 1
     );
$$;

revoke all on function app_private.is_current_school(uuid) from public, anon;
grant execute on function app_private.is_current_school(uuid) to authenticated;

create or replace function app_private.enforce_communication_current_school_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_school_id uuid;
  v_template_id uuid;
  v_template_version_id uuid;
begin
  -- Trusted worker/service execution has no end-user JWT and remains bounded by
  -- its existing queue claim/update functions and service-role privileges.
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if app_private.has_platform_role(array['platform_admin']) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_table_name in ('communication_templates','communication_messages','communication_recipients','communication_delivery_jobs') then
    if tg_op = 'DELETE' then
      v_school_id := old.school_id;
    else
      v_school_id := new.school_id;
    end if;
  elsif tg_table_name = 'communication_template_versions' then
    if tg_op = 'DELETE' then v_template_id := old.template_id; else v_template_id := new.template_id; end if;
    select t.school_id into v_school_id
    from public.communication_templates t
    where t.id = v_template_id;
  elsif tg_table_name = 'communication_provider_template_bindings' then
    if tg_op = 'DELETE' then v_template_version_id := old.template_version_id; else v_template_version_id := new.template_version_id; end if;
    select t.school_id into v_school_id
    from public.communication_template_versions v
    join public.communication_templates t on t.id = v.template_id
    where v.id = v_template_version_id;
  else
    raise exception 'Unsupported communication current-school guard table: %', tg_table_name;
  end if;

  if v_school_id is null or not app_private.is_current_school(v_school_id) then
    raise exception 'Permission denied: communication operation is outside the current school';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function app_private.enforce_communication_current_school_mutation() from public, anon, authenticated;

-- Physical guards are intentional: SECURITY DEFINER RPCs and future trusted write
-- paths cannot accidentally re-introduce the active-non-current-school bypass.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'communication_templates',
    'communication_template_versions',
    'communication_provider_template_bindings',
    'communication_messages',
    'communication_recipients',
    'communication_delivery_jobs'
  ]
  loop
    execute format('drop trigger if exists communication_current_school_guard on public.%I', v_table);
    execute format(
      'create trigger communication_current_school_guard before insert or update or delete on public.%I for each row execute function app_private.enforce_communication_current_school_mutation()',
      v_table
    );
  end loop;
end;
$$;

-- Keep private authorization helpers private. RLS calls only narrow SECURITY
-- DEFINER wrappers, matching the established communication policy-wrapper contract.
create or replace function app_private.can_read_communication_template_school(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or (
      app_private.is_current_school(p_school_id)
      and app_private.can_author_communications(p_school_id)
    );
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
        or (
          app_private.is_current_school(t.school_id)
          and app_private.has_school_role(t.school_id,array['school_admin','principal','deputy_principal'])
        )
      )
  );
$$;

revoke all on function app_private.can_read_communication_provider_template_binding(uuid) from public,anon;
grant execute on function app_private.can_read_communication_provider_template_binding(uuid) to authenticated;

-- School-template reads follow current-school context while retaining the private
-- helper execution boundary. Provider binding visibility remains leadership-only.
drop policy if exists "communication authors read school templates" on public.communication_templates;
create policy "communication authors read current school templates"
on public.communication_templates for select to authenticated
using (app_private.can_read_communication_template_school(school_id));

drop policy if exists "communication authors read school template versions" on public.communication_template_versions;
create policy "communication authors read current school template versions"
on public.communication_template_versions for select to authenticated
using (exists(
  select 1 from public.communication_templates t
  where t.id = communication_template_versions.template_id
    and app_private.can_read_communication_template_school(t.school_id)
));

drop policy if exists "communication leaders read provider template bindings" on public.communication_provider_template_bindings;
create policy "communication leaders read current school provider template bindings"
on public.communication_provider_template_bindings for select to authenticated
using (app_private.can_read_communication_provider_template_binding(template_version_id));

-- Preserve PR #414's privacy shape exactly; only tighten its school authorization.
create or replace function public.list_communication_delivery_diagnostics(
  p_school_id uuid,
  p_limit integer default 100
)
returns table(
  delivery_job_id uuid,
  message_id uuid,
  recipient_id uuid,
  channel text,
  provider_key text,
  status text,
  attempt_count integer,
  available_at timestamptz,
  last_attempt_at timestamptz,
  completed_at timestamptz,
  latest_attempt_number integer,
  latest_outcome text,
  latest_started_at timestamptz,
  latest_finished_at timestamptz,
  latest_error_code text
)
language plpgsql
stable
security definer
set search_path=public,app_private
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_school_id is null or not (
    app_private.has_platform_role(array['platform_admin'])
    or (
      app_private.is_current_school(p_school_id)
      and exists(
        select 1
        from public.school_memberships sm
        where sm.school_id=p_school_id
          and sm.user_id=auth.uid()
          and sm.role_key in ('school_admin','principal','deputy_principal')
          and sm.active_from<=current_date
          and (sm.active_to is null or sm.active_to>=current_date)
      )
    )
  ) then
    raise exception 'Permission denied';
  end if;

  return query
  select
    j.id,j.message_id,j.recipient_id,j.channel,j.provider_key,j.status,
    j.attempt_count,j.available_at,j.last_attempt_at,j.completed_at,
    a.attempt_number,a.outcome,a.started_at,a.finished_at,a.error_code
  from public.communication_delivery_jobs j
  left join lateral (
    select da.attempt_number,da.outcome,da.started_at,da.finished_at,da.error_code
    from public.communication_delivery_attempts da
    where da.delivery_job_id=j.id
    order by da.attempt_number desc
    limit 1
  ) a on true
  where j.school_id=p_school_id
  order by j.created_at desc
  limit greatest(1,least(coalesce(p_limit,100),500));
end;
$$;

revoke all on function public.list_communication_delivery_diagnostics(uuid,integer) from public,anon;
grant execute on function public.list_communication_delivery_diagnostics(uuid,integer) to authenticated;

comment on function app_private.is_current_school(uuid) is
'Checks the deterministic active school membership selected by active_from DESC, id ASC for the authenticated user.';
comment on function app_private.can_read_communication_template_school(uuid) is
'RLS-only wrapper around private communication author authorization, additionally bound to the authenticated user deterministic current school. Platform admin retains its explicit override.';
comment on function app_private.can_read_communication_provider_template_binding(uuid) is
'RLS-only wrapper for provider-template binding reads by platform administration or current-school leadership.';
comment on function public.list_communication_delivery_diagnostics(uuid,integer) is
'School-scoped communication delivery summary for platform admins or current-school administrators/principals/deputy principals. Raw last_error, error_detail, provider_message_id and provider_metadata remain service-role only.';
