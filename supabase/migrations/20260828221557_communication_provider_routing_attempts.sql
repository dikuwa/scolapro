-- Provider routing metadata is deliberately secret-free. API keys/tokens remain in
-- worker/Edge Function environments. Each delivery attempt is append-oriented so
-- provider troubleshooting never rewrites the canonical communication record.

create table public.communication_provider_routes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  channel text not null check (channel in ('email','sms','whatsapp','letter','other')),
  provider_key text not null,
  priority smallint not null default 100 check (priority between 1 and 1000),
  active boolean not null default true,
  effective_from date not null default current_date,
  effective_to date,
  config jsonb not null default '{}'::jsonb,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  check (jsonb_typeof(config)='object'),
  unique nulls not distinct (tenant_id,school_id,channel,provider_key,effective_from)
);
create index communication_provider_routes_lookup_idx
  on public.communication_provider_routes(tenant_id,school_id,channel,active,priority,effective_from,effective_to);

create table public.communication_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  delivery_job_id uuid not null references public.communication_delivery_jobs(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  provider_key text,
  provider_message_id text,
  outcome text not null check (outcome in ('processing','delivered','retry','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_code text,
  error_detail text,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(delivery_job_id,attempt_number),
  check (jsonb_typeof(provider_metadata)='object')
);
create index communication_delivery_attempts_job_idx
  on public.communication_delivery_attempts(delivery_job_id,attempt_number desc);
create index communication_delivery_attempts_school_idx
  on public.communication_delivery_attempts(school_id,started_at desc);

alter table public.communication_provider_routes enable row level security;
alter table public.communication_delivery_attempts enable row level security;

create policy "communication managers read provider routes"
on public.communication_provider_routes for select to authenticated
using (
  app_private.has_platform_role(array['platform_admin'])
  or (school_id is not null and app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal']))
  or (school_id is null and exists(
    select 1 from public.school_memberships sm
    where sm.tenant_id=communication_provider_routes.tenant_id
      and sm.user_id=(select auth.uid())
      and sm.role_key in ('school_admin','principal','deputy_principal')
      and sm.active_from<=current_date
      and (sm.active_to is null or sm.active_to>=current_date)
  ))
);

create policy "communication managers read delivery attempts"
on public.communication_delivery_attempts for select to authenticated
using (app_private.can_manage_communications(school_id));

revoke all on public.communication_provider_routes,public.communication_delivery_attempts from anon,authenticated;
grant select on public.communication_provider_routes,public.communication_delivery_attempts to authenticated;
grant select,insert,update,delete on public.communication_provider_routes,public.communication_delivery_attempts to service_role;

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

create or replace function public.resolve_communication_provider_route(
  p_tenant_id uuid,
  p_school_id uuid,
  p_channel text,
  p_on_date date default current_date
)
returns text
language sql
stable
security definer
set search_path=public
as $$
  select r.provider_key
  from public.communication_provider_routes r
  where r.tenant_id=p_tenant_id
    and r.channel=p_channel
    and r.active=true
    and r.effective_from<=p_on_date
    and (r.effective_to is null or r.effective_to>=p_on_date)
    and (r.school_id=p_school_id or r.school_id is null)
  order by case when r.school_id=p_school_id then 0 else 1 end,r.priority,r.effective_from desc
  limit 1;
$$;

create or replace function public.claim_communication_delivery_jobs(p_limit integer default 25)
returns setof public.communication_delivery_jobs
language plpgsql
security definer
set search_path=public
as $$
begin
  return query
  with candidates as (
    select id
    from public.communication_delivery_jobs
    where status in ('pending','retry') and available_at<=now()
    order by available_at,created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,25),100))
  ), claimed as (
    update public.communication_delivery_jobs j
    set status='processing',
        attempt_count=attempt_count+1,
        locked_at=now(),
        last_attempt_at=now(),
        provider_key=coalesce(j.provider_key,public.resolve_communication_provider_route(j.tenant_id,j.school_id,j.channel,current_date)),
        updated_at=now()
    from candidates c
    where j.id=c.id
    returning j.*
  ), attempts as (
    insert into public.communication_delivery_attempts(
      tenant_id,school_id,delivery_job_id,attempt_number,provider_key,outcome,started_at
    )
    select c.tenant_id,c.school_id,c.id,c.attempt_count,c.provider_key,'processing',coalesce(c.last_attempt_at,now())
    from claimed c
    on conflict(delivery_job_id,attempt_number) do nothing
    returning delivery_job_id
  )
  select c.* from claimed c;
end;
$$;

create or replace function public.complete_communication_delivery_job(
  p_job_id uuid,
  p_provider_key text default null,
  p_provider_message_id text default null
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare v_job public.communication_delivery_jobs%rowtype; v_provider text;
begin
  select * into v_job from public.communication_delivery_jobs where id=p_job_id for update;
  if not found then raise exception 'Delivery job not found'; end if;
  if v_job.status<>'processing' then raise exception 'Delivery job is not processing'; end if;
  v_provider:=coalesce(nullif(btrim(coalesce(p_provider_key,'')),''),v_job.provider_key);
  update public.communication_delivery_jobs
  set status='completed',provider_key=v_provider,completed_at=now(),locked_at=null,last_error=null,updated_at=now()
  where id=v_job.id;
  update public.communication_delivery_attempts
  set provider_key=coalesce(v_provider,provider_key),provider_message_id=nullif(btrim(coalesce(p_provider_message_id,'')),''),outcome='delivered',finished_at=now(),error_code=null,error_detail=null
  where delivery_job_id=v_job.id and attempt_number=v_job.attempt_count;
  update public.communication_recipients
  set delivery_status='delivered',provider_message_id=nullif(btrim(coalesce(p_provider_message_id,'')),''),delivered_at=now(),failure_reason=null
  where id=v_job.recipient_id;
  if not exists(select 1 from public.communication_delivery_jobs where message_id=v_job.message_id and status not in ('completed','cancelled')) then
    update public.communication_messages set status='sent',sent_at=coalesce(sent_at,now()),updated_at=now() where id=v_job.message_id;
  end if;
  return true;
end;
$$;

create or replace function public.fail_communication_delivery_job(
  p_job_id uuid,
  p_error text,
  p_retry_after_seconds integer default 300,
  p_max_attempts integer default 5
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare v_job public.communication_delivery_jobs%rowtype; v_dead boolean;
begin
  select * into v_job from public.communication_delivery_jobs where id=p_job_id for update;
  if not found then raise exception 'Delivery job not found'; end if;
  if v_job.status<>'processing' then raise exception 'Delivery job is not processing'; end if;
  v_dead:=v_job.attempt_count>=greatest(1,coalesce(p_max_attempts,5));
  update public.communication_delivery_jobs
  set status=case when v_dead then 'dead' else 'retry' end,
      available_at=case when v_dead then available_at else now()+make_interval(secs=>greatest(30,coalesce(p_retry_after_seconds,300))) end,
      locked_at=null,last_error=left(coalesce(p_error,'Delivery failed'),2000),updated_at=now()
  where id=v_job.id;
  update public.communication_delivery_attempts
  set outcome=case when v_dead then 'failed' else 'retry' end,finished_at=now(),error_detail=left(coalesce(p_error,'Delivery failed'),2000)
  where delivery_job_id=v_job.id and attempt_number=v_job.attempt_count;
  update public.communication_recipients
  set delivery_status=case when v_dead then 'failed' else 'queued' end,failure_reason=left(coalesce(p_error,'Delivery failed'),2000)
  where id=v_job.recipient_id;
  if v_dead then
    update public.communication_messages
    set status=case when exists(select 1 from public.communication_delivery_jobs where message_id=v_job.message_id and status='completed') then 'partially_sent' else 'failed' end,updated_at=now()
    where id=v_job.message_id;
  end if;
  return true;
end;
$$;

revoke all on function public.set_communication_provider_route(uuid,uuid,text,text,smallint,boolean,date,date,jsonb) from public,anon;
grant execute on function public.set_communication_provider_route(uuid,uuid,text,text,smallint,boolean,date,date,jsonb) to authenticated;
revoke all on function public.resolve_communication_provider_route(uuid,uuid,text,date) from public,anon,authenticated;
grant execute on function public.resolve_communication_provider_route(uuid,uuid,text,date) to service_role;
-- claim/complete/fail privileges remain service-role only from the outbox migration.

comment on table public.communication_provider_routes is 'Secret-free tenant/school channel routing metadata. Credentials live only in provider worker environments.';
comment on table public.communication_delivery_attempts is 'Append-oriented provider delivery attempt history for diagnostics, reconciliation and retry audit.';
