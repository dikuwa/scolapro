-- Communication authoring and communication-ledger access are different permissions.
-- Teachers may create scoped messages, but should not browse every school's recipient
-- destination, sensitive message, provider failure, or another teacher's draft.

create or replace function app_private.can_author_communications(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or exists(
      select 1 from public.school_memberships sm
      where sm.school_id=target_school_id
        and sm.user_id=(select auth.uid())
        and sm.role_key in ('school_admin','principal','deputy_principal','hod','teacher','class_teacher','counsellor')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
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
        cm.created_by_user_id=(select auth.uid())
        or app_private.has_platform_role(array['platform_admin'])
        or exists(
          select 1 from public.school_memberships sm
          where sm.school_id=cm.school_id
            and sm.user_id=(select auth.uid())
            and sm.role_key in ('school_admin','principal','deputy_principal')
            and sm.active_from<=current_date
            and (sm.active_to is null or sm.active_to>=current_date)
        )
        or (
          cm.sensitive=false
          and exists(
            select 1 from public.school_memberships sm
            where sm.school_id=cm.school_id
              and sm.user_id=(select auth.uid())
              and sm.role_key='counsellor'
              and sm.active_from<=current_date
              and (sm.active_to is null or sm.active_to>=current_date)
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

drop policy if exists "authorized staff can read school communications" on public.communication_messages;
create policy "authorized users read communication ledger"
on public.communication_messages for select to authenticated
using (app_private.can_read_communication(id));

drop policy if exists "authorized staff can create school communications" on public.communication_messages;
create policy "authorized staff create school communications"
on public.communication_messages for insert to authenticated
with check (
  created_by_user_id=(select auth.uid())
  and app_private.can_author_communications(school_id)
);

drop policy if exists "authors and leaders can update school communications" on public.communication_messages;
create policy "authors and leaders update draft communications"
on public.communication_messages for update to authenticated
using (
  status='draft'
  and (
    created_by_user_id=(select auth.uid())
    or exists(
      select 1 from public.school_memberships sm
      where sm.school_id=communication_messages.school_id
        and sm.user_id=(select auth.uid())
        and sm.role_key in ('school_admin','principal','deputy_principal')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    )
    or app_private.has_platform_role(array['platform_admin'])
  )
)
with check (
  status='draft'
  and app_private.can_author_communications(school_id)
);

drop policy if exists "authorized staff can read communication recipients" on public.communication_recipients;
create policy "authorized users read communication recipients"
on public.communication_recipients for select to authenticated
using (app_private.can_read_communication(message_id));

drop policy if exists "message authors can manage communication recipients" on public.communication_recipients;
create policy "message authors manage draft recipients"
on public.communication_recipients for all to authenticated
using (
  exists(
    select 1 from public.communication_messages cm
    where cm.id=communication_recipients.message_id
      and cm.school_id=communication_recipients.school_id
      and cm.status='draft'
      and (
        cm.created_by_user_id=(select auth.uid())
        or exists(
          select 1 from public.school_memberships sm
          where sm.school_id=cm.school_id
            and sm.user_id=(select auth.uid())
            and sm.role_key in ('school_admin','principal','deputy_principal')
            and sm.active_from<=current_date
            and (sm.active_to is null or sm.active_to>=current_date)
        )
        or app_private.has_platform_role(array['platform_admin'])
      )
  )
)
with check (
  exists(
    select 1 from public.communication_messages cm
    where cm.id=communication_recipients.message_id
      and cm.school_id=communication_recipients.school_id
      and cm.status='draft'
      and (
        cm.created_by_user_id=(select auth.uid())
        or exists(
          select 1 from public.school_memberships sm
          where sm.school_id=cm.school_id
            and sm.user_id=(select auth.uid())
            and sm.role_key in ('school_admin','principal','deputy_principal')
            and sm.active_from<=current_date
            and (sm.active_to is null or sm.active_to>=current_date)
        )
        or app_private.has_platform_role(array['platform_admin'])
      )
  )
);

drop policy if exists "authorized staff read communication delivery jobs" on public.communication_delivery_jobs;
create policy "authorized users read own or governed delivery jobs"
on public.communication_delivery_jobs for select to authenticated
using (app_private.can_read_communication(message_id));

create or replace function public.queue_communication(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_message public.communication_messages%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_message
  from public.communication_messages
  where id=p_message_id
  for update;
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

  update public.communication_messages
  set status='queued',updated_at=now()
  where id=v_message.id;

  update public.communication_recipients
  set delivery_status='queued'
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
    jsonb_build_object('channel',v_message.channel,'recipient_count',(select count(*) from public.communication_recipients where message_id=v_message.id))
  );

  return true;
end;
$$;
revoke all on function public.queue_communication(uuid) from public,anon;
grant execute on function public.queue_communication(uuid) to authenticated;

comment on function app_private.can_read_communication(uuid) is
'Communication-ledger privacy: author and leadership/platform admin may read; counsellor may read non-sensitive records. Ordinary teachers/HODs do not browse other authors recipient destinations.';