-- Combined report-card PDF export completion/failure is performed by the service worker,
-- not by the administrator who originally requested the batch. Audit events must not
-- impersonate that administrator. Keep the requester as explicit metadata and leave the
-- human actor null for worker-owned state transitions.

create or replace function public.complete_report_card_batch_export(
  p_batch_id uuid,
  p_storage_bucket text,
  p_storage_path text,
  p_content_sha256 text,
  p_page_count integer
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_batch public.report_card_batches%rowtype;
begin
  select * into v_batch from public.report_card_batches where id=p_batch_id for update;
  if not found then raise exception 'Report-card batch not found'; end if;
  if v_batch.operation<>'pdf' or v_batch.export_status<>'processing' then raise exception 'Report-card batch export is not processing'; end if;
  if btrim(coalesce(p_storage_bucket,''))='' or btrim(coalesce(p_storage_path,''))='' then raise exception 'Batch export storage location is required'; end if;
  if coalesce(p_page_count,0)<=0 then raise exception 'Batch export page count is required'; end if;

  update public.report_card_batches
  set export_status='ready',export_storage_bucket=btrim(p_storage_bucket),export_storage_path=btrim(p_storage_path),
      export_content_sha256=nullif(lower(btrim(coalesce(p_content_sha256,''))),''),export_page_count=p_page_count,
      export_error=null,export_completed_at=now(),updated_at=now()
  where id=v_batch.id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_batch.tenant_id,
    v_batch.school_id,
    null,
    'report_card.batch.export.ready',
    'report_card_batch',
    v_batch.id,
    jsonb_build_object(
      'requested_by_user_id',v_batch.created_by_user_id,
      'page_count',p_page_count,
      'storage_bucket',btrim(p_storage_bucket),
      'storage_path',btrim(p_storage_path)
    )
  );
  return true;
end;
$$;

create or replace function public.fail_report_card_batch_export(p_batch_id uuid,p_error text)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_batch public.report_card_batches%rowtype;
  v_error text;
begin
  select * into v_batch
  from public.report_card_batches
  where id=p_batch_id and operation='pdf' and export_status='processing'
  for update;
  if not found then raise exception 'Processing report-card batch export not found'; end if;

  v_error:=left(coalesce(p_error,'Combined PDF export failed'),2000);
  update public.report_card_batches
  set export_status='failed',export_error=v_error,updated_at=now()
  where id=v_batch.id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_batch.tenant_id,
    v_batch.school_id,
    null,
    'report_card.batch.export.failed',
    'report_card_batch',
    v_batch.id,
    jsonb_build_object(
      'requested_by_user_id',v_batch.created_by_user_id,
      'error',v_error
    )
  );
  return true;
end;
$$;

revoke all on function public.complete_report_card_batch_export(uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.complete_report_card_batch_export(uuid,text,text,text,integer) to service_role;
revoke all on function public.fail_report_card_batch_export(uuid,text) from public,anon,authenticated;
grant execute on function public.fail_report_card_batch_export(uuid,text) to service_role;

comment on function public.complete_report_card_batch_export(uuid,text,text,text,integer) is
'Service-worker completion of a combined report-card PDF export. Audit provenance uses a null human actor and records the requesting administrator separately in metadata.';

comment on function public.fail_report_card_batch_export(uuid,text) is
'Service-worker failure recording for a combined report-card PDF export. Audit provenance uses a null human actor and records the requesting administrator separately in metadata.';
