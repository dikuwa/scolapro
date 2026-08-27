create table if not exists public.communication_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  channel text not null check (channel in ('app','email','sms','whatsapp','letter','other')),
  subject text,
  body text not null,
  domain_type text,
  domain_id uuid,
  audience_type text not null check (audience_type in ('individual','class','grade','staff','school','custom')),
  status text not null default 'draft' check (status in ('draft','queued','sending','sent','partially_sent','failed','cancelled')),
  sensitive boolean not null default false,
  scheduled_for timestamptz,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.communication_recipients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  message_id uuid not null references public.communication_messages(id) on delete cascade,
  learner_id uuid references public.learners(id) on delete restrict,
  staff_member_id uuid references public.staff_members(id) on delete restrict,
  user_id uuid references auth.users(id) on delete restrict,
  external_name text,
  destination text,
  delivery_status text not null default 'pending' check (delivery_status in ('pending','queued','delivered','failed','skipped','cancelled')),
  provider_message_id text,
  failure_reason text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (learner_id is not null)::integer +
    (staff_member_id is not null)::integer +
    (user_id is not null)::integer +
    (destination is not null)::integer >= 1
  )
);

create index if not exists communication_messages_school_status_idx on public.communication_messages(school_id, status, created_at desc);
create index if not exists communication_messages_domain_idx on public.communication_messages(school_id, domain_type, domain_id);
create index if not exists communication_recipients_message_idx on public.communication_recipients(message_id, delivery_status);
create index if not exists communication_recipients_user_idx on public.communication_recipients(user_id, created_at desc) where user_id is not null;

alter table public.communication_messages enable row level security;
alter table public.communication_recipients enable row level security;

create or replace function app_private.can_manage_communications(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or app_private.has_school_role(target_school_id, array['school_admin','principal','deputy_principal','hod','teacher','class_teacher','counsellor']);
$$;

grant execute on function app_private.can_manage_communications(uuid) to authenticated;

create policy "authorized staff can read school communications"
on public.communication_messages for select to authenticated
using (app_private.can_manage_communications(school_id));

create policy "authorized staff can create school communications"
on public.communication_messages for insert to authenticated
with check (created_by_user_id = auth.uid() and app_private.can_manage_communications(school_id));

create policy "authors and leaders can update school communications"
on public.communication_messages for update to authenticated
using (
  created_by_user_id = auth.uid()
  or app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal'])
)
with check (app_private.can_manage_communications(school_id));

create policy "authorized staff can read communication recipients"
on public.communication_recipients for select to authenticated
using (app_private.can_manage_communications(school_id));

create policy "message authors can manage communication recipients"
on public.communication_recipients for all to authenticated
using (
  exists (
    select 1 from public.communication_messages cm
    where cm.id = communication_recipients.message_id
      and cm.school_id = communication_recipients.school_id
      and (cm.created_by_user_id = auth.uid() or app_private.has_school_role(cm.school_id, array['school_admin','principal','deputy_principal']))
  )
)
with check (
  exists (
    select 1 from public.communication_messages cm
    where cm.id = communication_recipients.message_id
      and cm.school_id = communication_recipients.school_id
      and (cm.created_by_user_id = auth.uid() or app_private.has_school_role(cm.school_id, array['school_admin','principal','deputy_principal']))
  )
);

create or replace function public.queue_communication(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.communication_messages%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_message from public.communication_messages where id = p_message_id for update;
  if not found then raise exception 'Communication not found'; end if;
  if not (v_message.created_by_user_id = auth.uid() or app_private.has_school_role(v_message.school_id, array['school_admin','principal','deputy_principal'])) then
    raise exception 'Permission denied';
  end if;
  if v_message.status <> 'draft' then raise exception 'Only draft communications can be queued'; end if;
  if not exists (select 1 from public.communication_recipients cr where cr.message_id = v_message.id) then
    raise exception 'Add at least one recipient before queueing';
  end if;

  update public.communication_messages set status = 'queued', updated_at = now() where id = v_message.id;
  update public.communication_recipients set delivery_status = 'queued' where message_id = v_message.id and delivery_status = 'pending';

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_message.tenant_id, v_message.school_id, auth.uid(), 'communication.queued', 'communication_message', v_message.id,
    jsonb_build_object('channel', v_message.channel, 'recipient_count', (select count(*) from public.communication_recipients where message_id = v_message.id)));

  return true;
end;
$$;

revoke all on function public.queue_communication(uuid) from public, anon;
grant execute on function public.queue_communication(uuid) to authenticated;

comment on table public.communication_messages is 'Provider-independent governed communication intent. Delivery providers are adapters; this table remains the canonical message record.';
comment on table public.communication_recipients is 'Recipient/delivery records for a communication message without coupling the domain event to a specific provider.';