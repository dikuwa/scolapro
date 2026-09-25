-- Issue #692: finalized correspondence communications.
-- Email uses the shared communications outbox and renders the immutable
-- finalized PDF at worker time. Device/WhatsApp share remains client/platform
-- initiated; only an audit event is recorded.

create or replace function public.queue_finalized_correspondence_email(
  p_document_id uuid,
  p_destination text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_document public.correspondence_documents%rowtype;
  v_message_id uuid;
  v_recipient_id uuid;
  v_destination text := lower(btrim(coalesce(p_destination, '')));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_document
  from public.correspondence_documents
  where id = p_document_id;

  if v_document.id is null then raise exception 'Correspondence document not found'; end if;
  if not app_private.can_manage_correspondence(auth.uid(), v_document.school_id) then
    raise exception 'Current-school correspondence authority required';
  end if;
  if v_document.status <> 'finalized' or v_document.finalized_at is null then
    raise exception 'Only finalized correspondence can be emailed';
  end if;
  if v_destination !~* '^[A-Z0-9._%+''-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'A valid recipient email address is required';
  end if;

  insert into public.communication_messages(
    tenant_id,
    school_id,
    channel,
    subject,
    body,
    domain_type,
    domain_id,
    audience_type,
    status,
    sensitive,
    created_by_user_id
  )
  values(
    v_document.tenant_id,
    v_document.school_id,
    'email',
    case when nullif(btrim(v_document.subject), '') is not null
      then v_document.subject
      else 'Official correspondence ' || coalesce(v_document.reference_number, '')
    end,
    'Please find attached the finalized official correspondence PDF from '
      || coalesce(v_document.school_identity_snapshot->>'name', 'the school')
      || '. Reference: ' || coalesce(v_document.reference_number, 'finalized correspondence') || '.',
    'correspondence_finalized_pdf',
    v_document.id,
    'individual',
    'draft',
    false,
    auth.uid()
  )
  returning id into v_message_id;

  insert into public.communication_recipients(
    tenant_id,
    school_id,
    message_id,
    external_name,
    destination,
    delivery_status
  )
  values(
    v_document.tenant_id,
    v_document.school_id,
    v_message_id,
    nullif(btrim(v_document.recipient), ''),
    v_destination,
    'pending'
  )
  returning id into v_recipient_id;

  perform public.queue_communication(v_message_id);

  insert into public.audit_events(
    tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
  )
  values(
    v_document.tenant_id,
    v_document.school_id,
    auth.uid(),
    'correspondence.email.queued',
    'correspondence_document',
    v_document.id,
    jsonb_build_object(
      'reference_number', v_document.reference_number,
      'revision_number', v_document.revision_number,
      'communication_message_id', v_message_id,
      'communication_recipient_id', v_recipient_id,
      'destination', v_destination
    )
  );

  return v_message_id;
end;
$$;

revoke all on function public.queue_finalized_correspondence_email(uuid,text) from public, anon;
grant execute on function public.queue_finalized_correspondence_email(uuid,text) to authenticated;

create or replace function public.record_finalized_correspondence_device_share(
  p_document_id uuid,
  p_share_method text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_document public.correspondence_documents%rowtype;
  v_method text := btrim(coalesce(p_share_method, ''));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_document
  from public.correspondence_documents
  where id = p_document_id;

  if v_document.id is null then raise exception 'Correspondence document not found'; end if;
  if not app_private.can_manage_correspondence(auth.uid(), v_document.school_id) then
    raise exception 'Current-school correspondence authority required';
  end if;
  if v_document.status <> 'finalized' or v_document.finalized_at is null then
    raise exception 'Only finalized correspondence can be shared';
  end if;
  if v_method not in ('web_share_pdf', 'download_for_whatsapp') then
    raise exception 'Unsupported correspondence share method';
  end if;

  insert into public.audit_events(
    tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
  )
  values(
    v_document.tenant_id,
    v_document.school_id,
    auth.uid(),
    'correspondence.shared',
    'correspondence_document',
    v_document.id,
    jsonb_build_object(
      'reference_number', v_document.reference_number,
      'revision_number', v_document.revision_number,
      'share_method', v_method
    )
  );

  return true;
end;
$$;

revoke all on function public.record_finalized_correspondence_device_share(uuid,text) from public, anon;
grant execute on function public.record_finalized_correspondence_device_share(uuid,text) to authenticated;

comment on function public.queue_finalized_correspondence_email(uuid,text) is
'Queues one finalized correspondence PDF through the canonical communications outbox after current-school correspondence authorization.';
comment on function public.record_finalized_correspondence_device_share(uuid,text) is
'Audits user-initiated Web Share or download-for-WhatsApp actions for finalized correspondence without sending through an embedded WhatsApp client.';
