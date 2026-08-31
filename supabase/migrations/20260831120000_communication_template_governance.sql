-- Governed provider-neutral communication templates.
-- Provider credentials remain outside PostgreSQL. WhatsApp queueing requires an
-- approved ScolaPro template version and an approved binding for the resolved provider.

create table public.communication_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  template_key text not null,
  channel text not null check (channel in ('email','sms','whatsapp')),
  name text not null,
  description text,
  active boolean not null default true,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (template_key = lower(template_key)),
  check (template_key ~ '^[a-z0-9][a-z0-9_.-]{1,79}$'),
  unique(school_id,channel,template_key)
);

create table public.communication_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.communication_templates(id) on delete cascade,
  version integer not null check (version > 0),
  language text not null,
  body_preview text not null,
  variables jsonb not null default '[]'::jsonb check (jsonb_typeof(variables)='array'),
  status text not null default 'draft' check (status in ('draft','approved','rejected','retired')),
  approved_by_user_id uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(template_id,version,language),
  check ((status='approved' and approved_by_user_id is not null and approved_at is not null) or status<>'approved')
);

create table public.communication_provider_template_bindings (
  id uuid primary key default gen_random_uuid(),
  template_version_id uuid not null references public.communication_template_versions(id) on delete cascade,
  provider_key text not null,
  provider_template_key text not null,
  provider_language text,
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected','paused','disabled')),
  active boolean not null default true,
  provider_config jsonb not null default '{}'::jsonb check (jsonb_typeof(provider_config)='object'),
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(template_version_id,provider_key)
);

create index communication_templates_school_channel_idx
  on public.communication_templates(school_id,channel,active,template_key);
create index communication_template_versions_template_idx
  on public.communication_template_versions(template_id,status,version desc,language);
create index communication_provider_template_bindings_lookup_idx
  on public.communication_provider_template_bindings(template_version_id,provider_key,active,approval_status);

alter table public.communication_messages
  add column template_version_id uuid references public.communication_template_versions(id) on delete restrict,
  add column template_parameters jsonb not null default '{}'::jsonb check (jsonb_typeof(template_parameters)='object');

alter table public.communication_templates enable row level security;
alter table public.communication_template_versions enable row level security;
alter table public.communication_provider_template_bindings enable row level security;

create policy "communication authors read school templates"
on public.communication_templates for select to authenticated
using (app_private.can_author_communications(school_id));

create policy "communication authors read school template versions"
on public.communication_template_versions for select to authenticated
using (exists(
  select 1 from public.communication_templates t
  where t.id=communication_template_versions.template_id
    and app_private.can_author_communications(t.school_id)
));

create policy "communication leaders read provider template bindings"
on public.communication_provider_template_bindings for select to authenticated
using (exists(
  select 1
  from public.communication_template_versions v
  join public.communication_templates t on t.id=v.template_id
  where v.id=communication_provider_template_bindings.template_version_id
    and (
      app_private.has_platform_role(array['platform_admin'])
      or app_private.has_school_role(t.school_id,array['school_admin','principal','deputy_principal'])
    )
));

revoke all on public.communication_templates,public.communication_template_versions,public.communication_provider_template_bindings from anon,authenticated;
grant select on public.communication_templates,public.communication_template_versions to authenticated;
grant select on public.communication_provider_template_bindings to authenticated;
grant select,insert,update,delete on public.communication_templates,public.communication_template_versions,public.communication_provider_template_bindings to service_role;

create or replace function app_private.validate_communication_template_variables(p_variables jsonb)
returns boolean
language plpgsql
immutable
set search_path=public,app_private
as $$
declare
  v_item jsonb;
  v_key text;
  v_count integer:=0;
  v_distinct integer:=0;
begin
  if jsonb_typeof(coalesce(p_variables,'[]'::jsonb))<>'array' then
    raise exception 'Template variables must be a JSON array';
  end if;
  for v_item in select value from jsonb_array_elements(coalesce(p_variables,'[]'::jsonb))
  loop
    if jsonb_typeof(v_item)<>'object' then raise exception 'Each template variable must be a JSON object'; end if;
    v_key:=nullif(btrim(coalesce(v_item->>'key','')),'');
    if v_key is null then raise exception 'Each template variable requires a key'; end if;
    if length(v_key)>80 then raise exception 'Template variable keys must be 80 characters or fewer'; end if;
    if v_item ? 'required' and jsonb_typeof(v_item->'required')<>'boolean' then
      raise exception 'Template variable required must be boolean';
    end if;
    if v_item ? 'sensitive' and jsonb_typeof(v_item->'sensitive')<>'boolean' then
      raise exception 'Template variable sensitive must be boolean';
    end if;
    v_count:=v_count+1;
  end loop;
  select count(distinct btrim(value->>'key')) into v_distinct
  from jsonb_array_elements(coalesce(p_variables,'[]'::jsonb));
  if v_distinct<>v_count then raise exception 'Template variable keys must be unique'; end if;
  return true;
end;
$$;
revoke all on function app_private.validate_communication_template_variables(jsonb) from public,anon,authenticated;

create or replace function app_private.validate_communication_template_parameters(
  p_template_version_id uuid,
  p_parameters jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path=public,app_private
as $$
declare
  v_variables jsonb;
  v_required text;
  v_supplied text;
begin
  if jsonb_typeof(coalesce(p_parameters,'{}'::jsonb))<>'object' then
    raise exception 'Template parameters must be a JSON object';
  end if;
  select variables into v_variables
  from public.communication_template_versions
  where id=p_template_version_id;
  if v_variables is null then raise exception 'Communication template version not found'; end if;

  for v_required in
    select btrim(value->>'key')
    from jsonb_array_elements(v_variables)
    where coalesce((value->>'required')::boolean,true)=true
  loop
    if not (coalesce(p_parameters,'{}'::jsonb) ? v_required)
       or jsonb_typeof(coalesce(p_parameters,'{}'::jsonb)->v_required)='null' then
      raise exception 'Missing required template parameter: %',v_required;
    end if;
  end loop;

  for v_supplied in select jsonb_object_keys(coalesce(p_parameters,'{}'::jsonb))
  loop
    if not exists(
      select 1 from jsonb_array_elements(v_variables) item
      where btrim(item->>'key')=v_supplied
    ) then raise exception 'Unexpected template parameter: %',v_supplied; end if;
  end loop;
  return true;
end;
$$;
revoke all on function app_private.validate_communication_template_parameters(uuid,jsonb) from public,anon,authenticated;

create or replace function app_private.enforce_provider_template_secret_free()
returns trigger
language plpgsql
security definer
set search_path=public,app_private
as $$
begin
  if app_private.jsonb_has_credential_key(new.provider_config) then
    raise exception 'Provider template config must not contain credentials or secret-bearing keys';
  end if;
  return new;
end;
$$;
revoke all on function app_private.enforce_provider_template_secret_free() from public,anon,authenticated;

create trigger communication_provider_template_secret_guard_trg
before insert or update of provider_config on public.communication_provider_template_bindings
for each row execute function app_private.enforce_provider_template_secret_free();

create or replace function public.create_communication_template(
  p_school_id uuid,
  p_channel text,
  p_template_key text,
  p_name text,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_id uuid;
  v_tenant_id uuid;
  v_key text:=lower(btrim(coalesce(p_template_key,'')));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (
    app_private.has_platform_role(array['platform_admin'])
    or app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])
  ) then raise exception 'Permission denied'; end if;
  if p_channel not in ('email','sms','whatsapp') then raise exception 'Unsupported template channel'; end if;
  if btrim(coalesce(p_name,''))='' then raise exception 'Template name is required'; end if;
  select tenant_id into v_tenant_id from public.schools where id=p_school_id;
  if v_tenant_id is null then raise exception 'School not found'; end if;

  insert into public.communication_templates(
    tenant_id,school_id,template_key,channel,name,description,created_by_user_id
  ) values(
    v_tenant_id,p_school_id,v_key,p_channel,btrim(p_name),nullif(btrim(coalesce(p_description,'')),''),auth.uid()
  ) returning id into v_id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_tenant_id,p_school_id,auth.uid(),'communication.template.created','communication_template',v_id,
    jsonb_build_object('channel',p_channel,'template_key',v_key));
  return v_id;
end;
$$;

create or replace function public.add_communication_template_version(
  p_template_id uuid,
  p_version integer,
  p_language text,
  p_body_preview text,
  p_variables jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_id uuid;
  v_template public.communication_templates%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_template from public.communication_templates where id=p_template_id;
  if not found then raise exception 'Communication template not found'; end if;
  if not (
    app_private.has_platform_role(array['platform_admin'])
    or app_private.has_school_role(v_template.school_id,array['school_admin','principal','deputy_principal'])
  ) then raise exception 'Permission denied'; end if;
  if btrim(coalesce(p_language,''))='' then raise exception 'Template language is required'; end if;
  if btrim(coalesce(p_body_preview,''))='' then raise exception 'Template body preview is required'; end if;
  perform app_private.validate_communication_template_variables(coalesce(p_variables,'[]'::jsonb));

  insert into public.communication_template_versions(
    template_id,version,language,body_preview,variables,created_by_user_id
  ) values(
    p_template_id,p_version,btrim(p_language),p_body_preview,coalesce(p_variables,'[]'::jsonb),auth.uid()
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.approve_communication_template_version(p_template_version_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_template public.communication_templates%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select t.* into v_template
  from public.communication_templates t
  join public.communication_template_versions v on v.template_id=t.id
  where v.id=p_template_version_id;
  if not found then raise exception 'Communication template version not found'; end if;
  if not (
    app_private.has_platform_role(array['platform_admin'])
    or app_private.has_school_role(v_template.school_id,array['school_admin','principal','deputy_principal'])
  ) then raise exception 'Permission denied'; end if;

  update public.communication_template_versions
  set status='approved',approved_by_user_id=auth.uid(),approved_at=now(),updated_at=now()
  where id=p_template_version_id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_template.tenant_id,v_template.school_id,auth.uid(),'communication.template_version.approved','communication_template_version',p_template_version_id,
    jsonb_build_object('template_id',v_template.id,'channel',v_template.channel));
  return true;
end;
$$;

create or replace function public.set_communication_provider_template_binding(
  p_template_version_id uuid,
  p_provider_key text,
  p_provider_template_key text,
  p_provider_language text default null,
  p_approval_status text default 'pending',
  p_active boolean default true,
  p_provider_config jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_id uuid;
  v_template public.communication_templates%rowtype;
  v_version_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select t.* into v_template
  from public.communication_templates t
  join public.communication_template_versions v on v.template_id=t.id
  where v.id=p_template_version_id;
  if not found then raise exception 'Communication template version not found'; end if;
  select status into v_version_status from public.communication_template_versions where id=p_template_version_id;

  if not (
    app_private.has_platform_role(array['platform_admin'])
    or app_private.has_school_role(v_template.school_id,array['school_admin','principal','deputy_principal'])
  ) then raise exception 'Permission denied'; end if;
  if btrim(coalesce(p_provider_key,''))='' then raise exception 'Provider key is required'; end if;
  if btrim(coalesce(p_provider_template_key,''))='' then raise exception 'Provider template key is required'; end if;
  if p_approval_status not in ('pending','approved','rejected','paused','disabled') then
    raise exception 'Unsupported provider template approval status';
  end if;
  if p_approval_status='approved' and v_version_status<>'approved' then
    raise exception 'Approve the ScolaPro template version before approving a provider binding';
  end if;
  if jsonb_typeof(coalesce(p_provider_config,'{}'::jsonb))<>'object' then
    raise exception 'Provider template config must be a JSON object';
  end if;
  if app_private.jsonb_has_credential_key(coalesce(p_provider_config,'{}'::jsonb)) then
    raise exception 'Provider template config must not contain credentials or secret-bearing keys';
  end if;

  insert into public.communication_provider_template_bindings(
    template_version_id,provider_key,provider_template_key,provider_language,approval_status,active,provider_config,updated_by_user_id
  ) values(
    p_template_version_id,btrim(p_provider_key),btrim(p_provider_template_key),nullif(btrim(coalesce(p_provider_language,'')),''),p_approval_status,p_active,coalesce(p_provider_config,'{}'::jsonb),auth.uid()
  )
  on conflict(template_version_id,provider_key) do update
  set provider_template_key=excluded.provider_template_key,
      provider_language=excluded.provider_language,
      approval_status=excluded.approval_status,
      active=excluded.active,
      provider_config=excluded.provider_config,
      updated_by_user_id=excluded.updated_by_user_id,
      updated_at=now()
  returning id into v_id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_template.tenant_id,v_template.school_id,auth.uid(),'communication.provider_template_binding.updated','communication_provider_template_binding',v_id,
    jsonb_build_object('template_version_id',p_template_version_id,'provider_key',btrim(p_provider_key),'approval_status',p_approval_status,'active',p_active));
  return v_id;
end;
$$;

create or replace function public.queue_communication(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_message public.communication_messages%rowtype;
  v_template public.communication_templates%rowtype;
  v_version_status text;
  v_provider_key text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_message from public.communication_messages where id=p_message_id for update;
  if not found then raise exception 'Communication not found'; end if;

  if not (
    v_message.created_by_user_id=(select auth.uid())
    or exists(
      select 1 from public.school_memberships sm
      where sm.school_id=v_message.school_id
        and sm.user_id=(select auth.uid())
        and sm.role_key in ('school_admin','principal','deputy_principal')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    )
    or app_private.has_platform_role(array['platform_admin'])
  ) then raise exception 'Permission denied'; end if;

  if v_message.status<>'draft' then raise exception 'Only draft communications can be queued'; end if;
  if not exists(select 1 from public.communication_recipients cr where cr.message_id=v_message.id) then
    raise exception 'Add at least one recipient before queueing';
  end if;

  if v_message.template_version_id is not null then
    select t.* into v_template
    from public.communication_templates t
    join public.communication_template_versions v on v.template_id=t.id
    where v.id=v_message.template_version_id;
    if not found then raise exception 'Communication template version not found'; end if;
    select status into v_version_status from public.communication_template_versions where id=v_message.template_version_id;
    if v_template.school_id<>v_message.school_id or v_template.tenant_id<>v_message.tenant_id or v_template.channel<>v_message.channel then
      raise exception 'Communication template version does not match message scope/channel';
    end if;
    if not v_template.active or v_version_status<>'approved' then
      raise exception 'Communication template version is not approved and active';
    end if;
    perform app_private.validate_communication_template_parameters(v_message.template_version_id,v_message.template_parameters);
  end if;

  if v_message.channel='whatsapp' then
    if v_message.template_version_id is null then
      raise exception 'WhatsApp communications require an approved template version';
    end if;
    v_provider_key:=public.resolve_communication_provider_route(v_message.tenant_id,v_message.school_id,'whatsapp',current_date);
    if v_provider_key is null then raise exception 'No active WhatsApp provider route is configured'; end if;
    if not exists(
      select 1 from public.communication_provider_template_bindings b
      where b.template_version_id=v_message.template_version_id
        and b.provider_key=v_provider_key
        and b.active=true
        and b.approval_status='approved'
    ) then raise exception 'WhatsApp template is not approved for the resolved provider'; end if;
  end if;

  update public.communication_messages set status='queued',updated_at=now() where id=v_message.id;
  update public.communication_recipients set delivery_status='queued'
  where message_id=v_message.id and delivery_status='pending';

  insert into public.communication_delivery_jobs(
    tenant_id,school_id,message_id,recipient_id,channel,status,available_at
  )
  select cr.tenant_id,cr.school_id,cr.message_id,cr.id,v_message.channel,'pending',coalesce(v_message.scheduled_for,now())
  from public.communication_recipients cr
  where cr.message_id=v_message.id
  on conflict(recipient_id) do nothing;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_message.tenant_id,v_message.school_id,auth.uid(),'communication.queued','communication_message',v_message.id,
    jsonb_build_object('channel',v_message.channel,'recipient_count',(select count(*) from public.communication_recipients where message_id=v_message.id),'template_version_id',v_message.template_version_id)
  );
  return true;
end;
$$;

revoke all on function public.create_communication_template(uuid,text,text,text,text) from public,anon;
grant execute on function public.create_communication_template(uuid,text,text,text,text) to authenticated;
revoke all on function public.add_communication_template_version(uuid,integer,text,text,jsonb) from public,anon;
grant execute on function public.add_communication_template_version(uuid,integer,text,text,jsonb) to authenticated;
revoke all on function public.approve_communication_template_version(uuid) from public,anon;
grant execute on function public.approve_communication_template_version(uuid) to authenticated;
revoke all on function public.set_communication_provider_template_binding(uuid,text,text,text,text,boolean,jsonb) from public,anon;
grant execute on function public.set_communication_provider_template_binding(uuid,text,text,text,text,boolean,jsonb) to authenticated;
revoke all on function public.queue_communication(uuid) from public,anon;
grant execute on function public.queue_communication(uuid) to authenticated;

comment on table public.communication_templates is 'Provider-neutral logical communication template registry scoped to a school and channel.';
comment on table public.communication_template_versions is 'Reviewed language/version definitions and declared variables for governed communications.';
comment on table public.communication_provider_template_bindings is 'Secret-free mapping from an approved ScolaPro template version to a provider template identifier/language/config.';
comment on column public.communication_messages.template_parameters is 'Per-message values for the selected reviewed template version; required keys are validated before queueing.';
