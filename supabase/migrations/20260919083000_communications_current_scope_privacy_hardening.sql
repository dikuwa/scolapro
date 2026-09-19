-- Communications live-QA hardening.
-- Existing current-school mutation/diagnostic boundaries are owned by
-- 20260912103100_communication_current_school_boundary.sql.
-- This migration closes the remaining provider-route and delivery-error privacy gaps
-- without replacing the canonical communications engine.

create or replace function app_private.can_author_communications(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or (
      not app_private.has_platform_role(array['platform_support'])
      and app_private.is_current_school(target_school_id)
      and exists(
        select 1
        from public.school_memberships sm
        where sm.school_id=target_school_id
          and sm.user_id=(select auth.uid())
          and sm.role_key in ('school_admin','principal','deputy_principal','hod','teacher','class_teacher','counsellor')
          and sm.active_from<=current_date
          and (sm.active_to is null or sm.active_to>=current_date)
      )
    );
$$;
revoke all on function app_private.can_author_communications(uuid) from public,anon,authenticated;

create or replace function app_private.can_read_communication(p_message_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select exists(
    select 1
    from public.communication_messages cm
    where cm.id=p_message_id
      and (
        app_private.has_platform_role(array['platform_admin'])
        or (
          not app_private.has_platform_role(array['platform_support'])
          and app_private.is_current_school(cm.school_id)
          and (
            cm.created_by_user_id=(select auth.uid())
            or exists(
              select 1
              from public.school_memberships sm
              where sm.school_id=cm.school_id
                and sm.user_id=(select auth.uid())
                and sm.role_key in ('school_admin','principal','deputy_principal')
                and sm.active_from<=current_date
                and (sm.active_to is null or sm.active_to>=current_date)
            )
            or (
              cm.sensitive=false
              and exists(
                select 1
                from public.school_memberships sm
                where sm.school_id=cm.school_id
                  and sm.user_id=(select auth.uid())
                  and sm.role_key='counsellor'
                  and sm.active_from<=current_date
                  and (sm.active_to is null or sm.active_to>=current_date)
              )
            )
          )
        )
      )
  );
$$;
revoke all on function app_private.can_read_communication(uuid) from public,anon,authenticated;

create or replace function app_private.can_manage_communications(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.can_author_communications(target_school_id);
$$;
revoke all on function app_private.can_manage_communications(uuid) from public,anon;
grant execute on function app_private.can_manage_communications(uuid) to authenticated;

create or replace function app_private.can_read_communication_provider_route_for_rls(
  p_tenant_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or (
      not app_private.has_platform_role(array['platform_support'])
      and (
        (
          p_school_id is not null
          and app_private.is_current_school(p_school_id)
          and app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])
        )
        or (
          p_school_id is null
          and exists(
            select 1
            from public.school_memberships sm
            join public.schools s on s.id=sm.school_id
            where s.tenant_id=p_tenant_id
              and sm.user_id=(select auth.uid())
              and app_private.is_current_school(sm.school_id)
              and sm.role_key in ('school_admin','principal','deputy_principal')
              and sm.active_from<=current_date
              and (sm.active_to is null or sm.active_to>=current_date)
          )
        )
      )
    );
$$;
revoke all on function app_private.can_read_communication_provider_route_for_rls(uuid,uuid) from public,anon;
grant execute on function app_private.can_read_communication_provider_route_for_rls(uuid,uuid) to authenticated;

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
    not app_private.has_platform_role(array['platform_support'])
    and p_school_id is not null
    and app_private.is_current_school(p_school_id)
    and app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])
  ) then
    raise exception 'Permission denied';
  end if;

  insert into public.communication_provider_routes(
    tenant_id,school_id,channel,provider_key,priority,active,effective_from,effective_to,config,updated_by_user_id
  ) values(
    p_tenant_id,p_school_id,p_channel,btrim(p_provider_key),p_priority,p_active,p_effective_from,p_effective_to,coalesce(p_config,'{}'::jsonb),auth.uid()
  ) returning id into v_route_id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    p_tenant_id,p_school_id,auth.uid(),'communication.provider_route.created','communication_provider_route',v_route_id,
    jsonb_build_object('channel',p_channel,'provider_key',btrim(p_provider_key),'priority',p_priority,'active',p_active)
  );
  return v_route_id;
end;
$$;
revoke all on function public.set_communication_provider_route(uuid,uuid,text,text,smallint,boolean,date,date,jsonb) from public,anon;
grant execute on function public.set_communication_provider_route(uuid,uuid,text,text,smallint,boolean,date,date,jsonb) to authenticated;

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
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  if p_school_id is null
     or app_private.has_platform_role(array['platform_support'])
     or not (
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
  left join lateral(
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
declare
  v_job public.communication_delivery_jobs%rowtype;
  v_dead boolean;
begin
  select * into v_job
  from public.communication_delivery_jobs
  where id=p_job_id
  for update;
  if not found then raise exception 'Delivery job not found'; end if;
  if v_job.status<>'processing' then raise exception 'Delivery job is not processing'; end if;

  v_dead:=v_job.attempt_count>=greatest(1,coalesce(p_max_attempts,5));

  update public.communication_delivery_jobs
  set status=case when v_dead then 'dead' else 'retry' end,
      available_at=case when v_dead then available_at else now()+make_interval(secs=>greatest(30,coalesce(p_retry_after_seconds,300))) end,
      locked_at=null,
      last_error=left(coalesce(p_error,'Delivery failed'),2000),
      updated_at=now()
  where id=v_job.id;

  update public.communication_delivery_attempts
  set outcome=case when v_dead then 'failed' else 'retry' end,
      finished_at=now(),
      error_detail=left(coalesce(p_error,'Delivery failed'),2000)
  where delivery_job_id=v_job.id
    and attempt_number=v_job.attempt_count;

  update public.communication_recipients
  set delivery_status=case when v_dead then 'failed' else 'queued' end,
      failure_reason=case when v_dead then 'Provider delivery failed' else null end
  where id=v_job.recipient_id;

  if v_dead then
    update public.communication_messages
    set status=case
          when exists(
            select 1
            from public.communication_delivery_jobs
            where message_id=v_job.message_id and status='completed'
          ) then 'partially_sent'
          else 'failed'
        end,
        updated_at=now()
    where id=v_job.message_id;
  end if;

  return true;
end;
$$;
revoke all on function public.fail_communication_delivery_job(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.fail_communication_delivery_job(uuid,text,integer,integer) to service_role;

create or replace function public.record_communication_delivery_receipt(
  p_provider_key text,
  p_provider_message_id text,
  p_outcome text,
  p_provider_event_id text default null,
  p_occurred_at timestamptz default now(),
  p_error_code text default null,
  p_error_detail text default null,
  p_provider_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_job public.communication_delivery_jobs%rowtype;
  v_receipt_id uuid;
  v_existing_id uuid;
  v_provider text:=nullif(btrim(coalesce(p_provider_key,'')),'');
  v_message_id text:=nullif(btrim(coalesce(p_provider_message_id,'')),'');
  v_event_id text:=nullif(btrim(coalesce(p_provider_event_id,'')),'');
begin
  if v_provider is null then raise exception 'Provider key is required'; end if;
  if v_message_id is null then raise exception 'Provider message id is required'; end if;
  if p_outcome not in ('delivered','failed') then raise exception 'Unsupported delivery receipt outcome'; end if;
  if jsonb_typeof(coalesce(p_provider_metadata,'{}'::jsonb))<>'object' then
    raise exception 'Provider metadata must be a JSON object';
  end if;

  if v_event_id is not null then
    select id into v_existing_id
    from public.communication_delivery_receipts
    where provider_key=v_provider
      and provider_event_id=v_event_id;
    if v_existing_id is not null then return v_existing_id; end if;
  end if;

  select j.* into v_job
  from public.communication_delivery_jobs j
  join public.communication_recipients r on r.id=j.recipient_id
  where coalesce(j.provider_key,'')=v_provider
    and r.provider_message_id=v_message_id
    and j.status='completed'
  order by j.completed_at desc nulls last,j.created_at desc
  limit 1
  for update of j;

  if not found then raise exception 'Matching submitted delivery job not found'; end if;

  insert into public.communication_delivery_receipts(
    tenant_id,school_id,delivery_job_id,recipient_id,provider_key,provider_message_id,
    provider_event_id,outcome,occurred_at,error_code,error_detail,provider_metadata
  ) values(
    v_job.tenant_id,v_job.school_id,v_job.id,v_job.recipient_id,v_provider,v_message_id,
    v_event_id,p_outcome,coalesce(p_occurred_at,now()),nullif(btrim(coalesce(p_error_code,'')),''),
    left(nullif(btrim(coalesce(p_error_detail,'')),''),2000),coalesce(p_provider_metadata,'{}'::jsonb)
  ) returning id into v_receipt_id;

  update public.communication_recipients
  set delivery_status=case
        when delivery_status='delivered' then 'delivered'
        when p_outcome='delivered' then 'delivered'
        else 'failed'
      end,
      delivered_at=case
        when delivery_status='delivered' then delivered_at
        when p_outcome='delivered' then coalesce(p_occurred_at,now())
        else null
      end,
      failure_reason=case
        when delivery_status='delivered' or p_outcome='delivered' then null
        else 'Provider reported delivery failure'
      end
  where id=v_job.recipient_id;

  update public.communication_messages m
  set status=case
        when not exists(
          select 1
          from public.communication_recipients r
          where r.message_id=m.id
            and r.delivery_status not in ('failed','cancelled','skipped')
        ) then 'failed'
        when exists(
          select 1
          from public.communication_recipients r
          where r.message_id=m.id and r.delivery_status='failed'
        ) then 'partially_sent'
        else 'sent'
      end,
      updated_at=now()
  where m.id=v_job.message_id;

  return v_receipt_id;
end;
$$;
revoke all on function public.record_communication_delivery_receipt(text,text,text,text,timestamptz,text,text,jsonb)
from public,anon,authenticated;
grant execute on function public.record_communication_delivery_receipt(text,text,text,text,timestamptz,text,text,jsonb)
to service_role;

comment on function app_private.can_author_communications(uuid) is
'Current-school communication authoring authority. Platform Admin retains governed override; Platform Support has no operational communication authority.';
comment on function app_private.can_read_communication(uuid) is
'Current-school communication-ledger privacy. Platform Admin retains governed oversight; Platform Support has no operational communication read authority.';
comment on function app_private.can_read_communication_provider_route_for_rls(uuid,uuid) is
'Provider-route RLS wrapper restricted to Platform Admin or leadership in the deterministic current school. Platform Support is denied.';
comment on function public.list_communication_delivery_diagnostics(uuid,integer) is
'Sanitized delivery diagnostics for Platform Admin or deterministic current-school leadership. Platform Support is denied; raw provider detail remains worker-only.';
comment on function public.fail_communication_delivery_job(uuid,text,integer,integer) is
'Records retry/dead worker diagnostics while keeping raw transport error text out of recipient-visible failure_reason.';
comment on function public.record_communication_delivery_receipt(text,text,text,text,timestamptz,text,text,jsonb) is
'Append-only provider delivery projection. Raw provider error detail remains in service-role receipt history and is never copied into recipient-visible failure_reason.';
