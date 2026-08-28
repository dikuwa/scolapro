-- Provider-neutral communication delivery outbox.
-- Canonical messages remain provider-independent; secrets belong in worker/Edge Function environments.

create table public.communication_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  message_id uuid not null references public.communication_messages(id) on delete cascade,
  recipient_id uuid not null references public.communication_recipients(id) on delete cascade,
  channel text not null check (channel in ('app','email','sms','whatsapp','letter','other')),
  provider_key text,
  status text not null default 'pending' check (status in ('pending','processing','retry','completed','dead','cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  last_attempt_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(recipient_id)
);
create index communication_delivery_jobs_ready_idx on public.communication_delivery_jobs(status,available_at,created_at) where status in ('pending','retry');
create index communication_delivery_jobs_message_idx on public.communication_delivery_jobs(message_id,status);
alter table public.communication_delivery_jobs enable row level security;

create policy "authorized staff read communication delivery jobs" on public.communication_delivery_jobs
for select to authenticated using (app_private.can_manage_communications(school_id));
revoke all on public.communication_delivery_jobs from anon, authenticated;
grant select on public.communication_delivery_jobs to authenticated;
grant select,insert,update,delete on public.communication_delivery_jobs to service_role;

create or replace function public.queue_communication(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_message public.communication_messages%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_message from public.communication_messages where id = p_message_id for update;
  if not found then raise exception 'Communication not found'; end if;
  if not (v_message.created_by_user_id = auth.uid() or app_private.has_school_role(v_message.school_id, array['school_admin','principal','deputy_principal'])) then raise exception 'Permission denied'; end if;
  if v_message.status <> 'draft' then raise exception 'Only draft communications can be queued'; end if;
  if not exists (select 1 from public.communication_recipients cr where cr.message_id = v_message.id) then raise exception 'Add at least one recipient before queueing'; end if;

  update public.communication_messages set status='queued',updated_at=now() where id=v_message.id;
  update public.communication_recipients set delivery_status='queued' where message_id=v_message.id and delivery_status='pending';
  insert into public.communication_delivery_jobs(tenant_id,school_id,message_id,recipient_id,channel,status,available_at)
  select cr.tenant_id,cr.school_id,cr.message_id,cr.id,v_message.channel,'pending',coalesce(v_message.scheduled_for,now()) from public.communication_recipients cr where cr.message_id=v_message.id
  on conflict(recipient_id) do nothing;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_message.tenant_id,v_message.school_id,auth.uid(),'communication.queued','communication_message',v_message.id,jsonb_build_object('channel',v_message.channel,'recipient_count',(select count(*) from public.communication_recipients where message_id=v_message.id)));
  return true;
end; $$;

create or replace function public.claim_communication_delivery_jobs(p_limit integer default 25)
returns setof public.communication_delivery_jobs language plpgsql security definer set search_path=public as $$
begin
  return query with candidates as (
    select id from public.communication_delivery_jobs where status in ('pending','retry') and available_at<=now() order by available_at,created_at for update skip locked limit greatest(1,least(coalesce(p_limit,25),100))
  ), claimed as (
    update public.communication_delivery_jobs j set status='processing',attempt_count=attempt_count+1,locked_at=now(),last_attempt_at=now(),updated_at=now() from candidates c where j.id=c.id returning j.*
  ) select * from claimed;
end; $$;

create or replace function public.complete_communication_delivery_job(p_job_id uuid,p_provider_key text default null,p_provider_message_id text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_job public.communication_delivery_jobs%rowtype;
begin
  select * into v_job from public.communication_delivery_jobs where id=p_job_id for update;
  if not found then raise exception 'Delivery job not found'; end if;
  update public.communication_delivery_jobs set status='completed',provider_key=nullif(btrim(coalesce(p_provider_key,'')),''),completed_at=now(),locked_at=null,last_error=null,updated_at=now() where id=v_job.id;
  update public.communication_recipients set delivery_status='delivered',provider_message_id=nullif(btrim(coalesce(p_provider_message_id,'')),''),delivered_at=now(),failure_reason=null where id=v_job.recipient_id;
  if not exists(select 1 from public.communication_delivery_jobs where message_id=v_job.message_id and status not in ('completed','cancelled')) then update public.communication_messages set status='sent',sent_at=coalesce(sent_at,now()),updated_at=now() where id=v_job.message_id; end if;
  return true;
end; $$;

create or replace function public.fail_communication_delivery_job(p_job_id uuid,p_error text,p_retry_after_seconds integer default 300,p_max_attempts integer default 5)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_job public.communication_delivery_jobs%rowtype; v_dead boolean;
begin
  select * into v_job from public.communication_delivery_jobs where id=p_job_id for update;
  if not found then raise exception 'Delivery job not found'; end if;
  v_dead:=v_job.attempt_count>=greatest(1,coalesce(p_max_attempts,5));
  update public.communication_delivery_jobs set status=case when v_dead then 'dead' else 'retry' end,available_at=case when v_dead then available_at else now()+make_interval(secs=>greatest(30,coalesce(p_retry_after_seconds,300))) end,locked_at=null,last_error=left(coalesce(p_error,'Delivery failed'),2000),updated_at=now() where id=v_job.id;
  update public.communication_recipients set delivery_status=case when v_dead then 'failed' else 'queued' end,failure_reason=left(coalesce(p_error,'Delivery failed'),2000) where id=v_job.recipient_id;
  if v_dead then update public.communication_messages set status=case when exists(select 1 from public.communication_delivery_jobs where message_id=v_job.message_id and status='completed') then 'partially_sent' else 'failed' end,updated_at=now() where id=v_job.message_id; end if;
  return true;
end; $$;

revoke all on function public.claim_communication_delivery_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_communication_delivery_jobs(integer) to service_role;
revoke all on function public.complete_communication_delivery_job(uuid,text,text) from public,anon,authenticated;
grant execute on function public.complete_communication_delivery_job(uuid,text,text) to service_role;
revoke all on function public.fail_communication_delivery_job(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.fail_communication_delivery_job(uuid,text,integer,integer) to service_role;

comment on table public.communication_delivery_jobs is 'Provider-neutral delivery outbox. Provider secrets stay in worker/Edge Function environment, never in canonical communication records.';
