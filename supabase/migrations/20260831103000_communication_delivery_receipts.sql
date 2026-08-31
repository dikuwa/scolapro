-- Separate provider API acceptance from final delivery truth.
-- A completed outbox job means the worker finished its transport submission; it does
-- not mean the provider has delivered the message to the recipient. Final provider
-- delivery/failure receipts are append-recorded and then projected onto the canonical
-- recipient status. Provider credentials remain outside PostgreSQL.

alter table public.communication_recipients
  drop constraint if exists communication_recipients_delivery_status_check;
alter table public.communication_recipients
  add constraint communication_recipients_delivery_status_check
  check (delivery_status in ('pending','queued','submitted','delivered','failed','skipped','cancelled'));

alter table public.communication_recipients
  add column if not exists submitted_at timestamptz;

alter table public.communication_delivery_attempts
  drop constraint if exists communication_delivery_attempts_outcome_check;
alter table public.communication_delivery_attempts
  add constraint communication_delivery_attempts_outcome_check
  check (outcome in ('processing','accepted','delivered','retry','failed'));

create table public.communication_delivery_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  delivery_job_id uuid not null references public.communication_delivery_jobs(id) on delete cascade,
  recipient_id uuid not null references public.communication_recipients(id) on delete cascade,
  provider_key text not null,
  provider_message_id text not null,
  provider_event_id text,
  outcome text not null check (outcome in ('delivered','failed')),
  occurred_at timestamptz not null default now(),
  error_code text,
  error_detail text,
  provider_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(provider_metadata)='object'),
  created_at timestamptz not null default now()
);

create unique index communication_delivery_receipts_provider_event_uidx
  on public.communication_delivery_receipts(provider_key,provider_event_id)
  where provider_event_id is not null;
create index communication_delivery_receipts_message_lookup_idx
  on public.communication_delivery_receipts(provider_key,provider_message_id,occurred_at desc);
create index communication_delivery_receipts_job_idx
  on public.communication_delivery_receipts(delivery_job_id,occurred_at desc);

alter table public.communication_delivery_receipts enable row level security;
create policy "communication managers read delivery receipts"
on public.communication_delivery_receipts for select to authenticated
using (app_private.can_manage_communications(school_id));

revoke all on public.communication_delivery_receipts from anon,authenticated;
grant select on public.communication_delivery_receipts to authenticated;
grant select,insert on public.communication_delivery_receipts to service_role;

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
declare
  v_job public.communication_delivery_jobs%rowtype;
  v_provider text;
  v_provider_message_id text;
begin
  select * into v_job
  from public.communication_delivery_jobs
  where id=p_job_id
  for update;

  if not found then raise exception 'Delivery job not found'; end if;
  if v_job.status<>'processing' then raise exception 'Delivery job is not processing'; end if;

  v_provider:=coalesce(nullif(btrim(coalesce(p_provider_key,'')),''),v_job.provider_key);
  v_provider_message_id:=nullif(btrim(coalesce(p_provider_message_id,'')),'');

  update public.communication_delivery_jobs
  set status='completed',
      provider_key=v_provider,
      completed_at=now(),
      locked_at=null,
      last_error=null,
      updated_at=now()
  where id=v_job.id;

  update public.communication_delivery_attempts
  set provider_key=coalesce(v_provider,provider_key),
      provider_message_id=v_provider_message_id,
      outcome='accepted',
      finished_at=now(),
      error_code=null,
      error_detail=null
  where delivery_job_id=v_job.id
    and attempt_number=v_job.attempt_count;

  update public.communication_recipients
  set delivery_status='submitted',
      provider_message_id=v_provider_message_id,
      submitted_at=coalesce(submitted_at,now()),
      delivered_at=null,
      failure_reason=null
  where id=v_job.recipient_id;

  if not exists(
    select 1
    from public.communication_delivery_jobs
    where message_id=v_job.message_id
      and status not in ('completed','cancelled')
  ) then
    update public.communication_messages
    set status='sent',
        sent_at=coalesce(sent_at,now()),
        updated_at=now()
    where id=v_job.message_id;
  end if;

  return true;
end;
$$;

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
    if v_existing_id is not null then
      return v_existing_id;
    end if;
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
        else left(coalesce(nullif(btrim(coalesce(p_error_detail,'')),''),'Provider reported delivery failure'),2000)
      end
  where id=v_job.recipient_id;

  update public.communication_messages m
  set status=case
        when not exists(
          select 1 from public.communication_recipients r
          where r.message_id=m.id
            and r.delivery_status not in ('failed','cancelled','skipped')
        ) then 'failed'
        when exists(
          select 1 from public.communication_recipients r
          where r.message_id=m.id and r.delivery_status='failed'
        ) then 'partially_sent'
        else 'sent'
      end,
      updated_at=now()
  where m.id=v_job.message_id;

  return v_receipt_id;
end;
$$;

revoke all on function public.complete_communication_delivery_job(uuid,text,text) from public,anon,authenticated;
grant execute on function public.complete_communication_delivery_job(uuid,text,text) to service_role;
revoke all on function public.record_communication_delivery_receipt(text,text,text,text,timestamptz,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_communication_delivery_receipt(text,text,text,text,timestamptz,text,text,jsonb) to service_role;

comment on column public.communication_recipients.submitted_at is 'Timestamp when a provider accepted/submitted the message; not proof of final delivery.';
comment on table public.communication_delivery_receipts is 'Append-only provider delivery/failure receipts. Secrets are never stored here; provider metadata must be non-secret delivery evidence.';
comment on function public.record_communication_delivery_receipt(text,text,text,text,timestamptz,text,text,jsonb) is 'Service-role webhook/worker projection for final provider delivery truth. Idempotent when provider_event_id is supplied.';
