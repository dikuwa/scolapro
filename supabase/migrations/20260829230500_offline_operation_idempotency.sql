-- Offline clients may replay queued writes after reconnect. Preserve one server-side
-- receipt per user/operation key so retrying the same payload is safe while a reused
-- key with different data is rejected. Attendance already carries per-day
-- client_mutation_id; this foundation covers insert-style workflows such as contributions.

create table if not exists public.client_operation_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  operation_type text not null,
  client_operation_id uuid not null,
  payload_fingerprint text not null,
  result_payload jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(actor_user_id,operation_type,client_operation_id),
  check (nullif(btrim(operation_type),'') is not null),
  check (char_length(payload_fingerprint)=32),
  check (result_payload is null or jsonb_typeof(result_payload)='object')
);

create index if not exists client_operation_receipts_school_created_idx
  on public.client_operation_receipts(school_id,created_at desc);

alter table public.client_operation_receipts enable row level security;

create policy "actors and school leaders read operation receipts"
on public.client_operation_receipts for select to authenticated
using (
  actor_user_id=(select auth.uid())
  or app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal'])
  or app_private.has_platform_role(array['platform_admin'])
);

revoke insert,update,delete on public.client_operation_receipts from authenticated;

create or replace function public.record_learner_voluntary_contribution_idempotent(
  p_client_operation_id uuid,
  p_item_id uuid,
  p_learner_id uuid,
  p_contribution_date date,
  p_quantity numeric default null,
  p_amount numeric default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_campaign public.voluntary_contribution_campaigns%rowtype;
  v_existing public.client_operation_receipts%rowtype;
  v_fingerprint text;
  v_contribution_id uuid;
  v_payload jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_client_operation_id is null then raise exception 'Client operation ID is required'; end if;

  select c.* into v_campaign
  from public.voluntary_contribution_items i
  join public.voluntary_contribution_campaigns c on c.id=i.campaign_id
  where i.id=p_item_id;
  if not found then raise exception 'Contribution item not found'; end if;

  v_payload:=jsonb_build_object(
    'item_id',p_item_id,
    'learner_id',p_learner_id,
    'contribution_date',p_contribution_date,
    'quantity',p_quantity,
    'amount',p_amount,
    'note',nullif(btrim(coalesce(p_note,'')),'')
  );
  v_fingerprint:=md5(v_payload::text);

  select * into v_existing
  from public.client_operation_receipts
  where actor_user_id=auth.uid()
    and operation_type='voluntary_contribution.record'
    and client_operation_id=p_client_operation_id
  for update;

  if found then
    if v_existing.payload_fingerprint<>v_fingerprint then
      raise exception 'Client operation ID was already used with different contribution data';
    end if;
    if v_existing.completed_at is null or v_existing.result_payload is null then
      raise exception 'Client operation is already being processed';
    end if;
    return (v_existing.result_payload->>'contribution_id')::uuid;
  end if;

  insert into public.client_operation_receipts(
    tenant_id,school_id,actor_user_id,operation_type,client_operation_id,payload_fingerprint
  ) values(
    v_campaign.tenant_id,v_campaign.school_id,auth.uid(),'voluntary_contribution.record',p_client_operation_id,v_fingerprint
  );

  v_contribution_id:=public.record_learner_voluntary_contribution(
    p_learner_id,p_item_id,p_contribution_date,p_quantity,p_amount,p_note,null
  );

  update public.client_operation_receipts
  set result_payload=jsonb_build_object('contribution_id',v_contribution_id),completed_at=now()
  where actor_user_id=auth.uid()
    and operation_type='voluntary_contribution.record'
    and client_operation_id=p_client_operation_id;

  return v_contribution_id;
end;
$$;

revoke all on function public.record_learner_voluntary_contribution_idempotent(uuid,uuid,uuid,date,numeric,numeric,text) from public,anon;
grant execute on function public.record_learner_voluntary_contribution_idempotent(uuid,uuid,uuid,date,numeric,numeric,text) to authenticated;

comment on table public.client_operation_receipts is 'Server idempotency receipts for offline/retry-safe client mutations. A client operation UUID cannot be reused with a different payload.';
comment on function public.record_learner_voluntary_contribution_idempotent(uuid,uuid,uuid,date,numeric,numeric,text) is 'Offline-safe voluntary contribution recording. Replaying the same client operation returns the original contribution instead of inserting a duplicate.';