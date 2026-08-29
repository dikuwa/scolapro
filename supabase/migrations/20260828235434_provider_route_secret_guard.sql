-- Provider routing is domain configuration, not credential storage. Reject common
-- credential-bearing keys recursively so API keys/tokens/passwords cannot be casually
-- persisted in canonical communication tables.

create or replace function app_private.jsonb_has_credential_key(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path=public,app_private
as $$
declare
  v_key text;
  v_child jsonb;
begin
  if p_value is null then return false; end if;

  if jsonb_typeof(p_value)='object' then
    for v_key,v_child in select key,value from jsonb_each(p_value)
    loop
      if lower(regexp_replace(v_key,'[^a-zA-Z0-9]','','g')) in (
        'secret','clientsecret','apikey','accesstoken','refreshtoken','token',
        'password','passwd','credential','credentials','privatekey','signingkey'
      ) then
        return true;
      end if;
      if app_private.jsonb_has_credential_key(v_child) then return true; end if;
    end loop;
  elsif jsonb_typeof(p_value)='array' then
    for v_child in select value from jsonb_array_elements(p_value)
    loop
      if app_private.jsonb_has_credential_key(v_child) then return true; end if;
    end loop;
  end if;

  return false;
end;
$$;
revoke all on function app_private.jsonb_has_credential_key(jsonb) from public,anon,authenticated;

create or replace function app_private.enforce_provider_route_secret_free()
returns trigger
language plpgsql
security definer
set search_path=public,app_private
as $$
begin
  if app_private.jsonb_has_credential_key(new.config) then
    raise exception 'Provider route config must not contain credentials or secret-bearing keys';
  end if;
  return new;
end;
$$;
revoke all on function app_private.enforce_provider_route_secret_free() from public,anon,authenticated;

drop trigger if exists communication_provider_route_secret_guard_trg on public.communication_provider_routes;
create trigger communication_provider_route_secret_guard_trg
before insert or update of config on public.communication_provider_routes
for each row execute function app_private.enforce_provider_route_secret_free();

create or replace function public.set_communication_provider_route(
  p_tenant_id uuid,
  p_school_id uuid,
  p_channel text,
  p_provider_key text,
  p_priority smallint default 100,
  p_active boolean default true,
  p_effective_from date default current_date,
  p_effective_to date default null,
  p_config jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_route_id uuid;
  v_school_tenant uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_channel not in ('email','sms','whatsapp','letter','other') then raise exception 'Unsupported provider-routed channel'; end if;
  if btrim(coalesce(p_provider_key,''))='' then raise exception 'Provider key is required'; end if;
  if p_effective_to is not null and p_effective_to<p_effective_from then raise exception 'Effective end cannot precede start'; end if;
  if jsonb_typeof(coalesce(p_config,'{}'::jsonb))<>'object' then raise exception 'Provider route config must be a JSON object'; end if;
  if app_private.jsonb_has_credential_key(coalesce(p_config,'{}'::jsonb)) then
    raise exception 'Provider route config must not contain credentials or secret-bearing keys';
  end if;
  if p_school_id is not null then
    select tenant_id into v_school_tenant from public.schools where id=p_school_id;
    if v_school_tenant is null or v_school_tenant<>p_tenant_id then raise exception 'School does not belong to tenant'; end if;
  end if;
  if not app_private.has_platform_role(array['platform_admin']) and not (
    p_school_id is not null and app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])
  ) then raise exception 'Permission denied'; end if;

  insert into public.communication_provider_routes(
    tenant_id,school_id,channel,provider_key,priority,active,effective_from,effective_to,config,updated_by_user_id
  ) values(
    p_tenant_id,p_school_id,p_channel,btrim(p_provider_key),p_priority,p_active,p_effective_from,p_effective_to,coalesce(p_config,'{}'::jsonb),auth.uid()
  ) returning id into v_route_id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(p_tenant_id,p_school_id,auth.uid(),'communication.provider_route.created','communication_provider_route',v_route_id,
    jsonb_build_object('channel',p_channel,'provider_key',btrim(p_provider_key),'priority',p_priority,'active',p_active));
  return v_route_id;
end;
$$;

revoke all on function public.set_communication_provider_route(uuid,uuid,text,text,smallint,boolean,date,date,jsonb) from public,anon;
grant execute on function public.set_communication_provider_route(uuid,uuid,text,text,smallint,boolean,date,date,jsonb) to authenticated;

comment on function app_private.jsonb_has_credential_key(jsonb) is
'Conservative recursive guard against common credential-bearing JSON keys in canonical provider routing metadata.';
