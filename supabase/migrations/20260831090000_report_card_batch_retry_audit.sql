-- Make management-triggered report-card retry actions durable in the audit trail.
-- Worker-only state transitions are already privilege-bound; these user-triggered retry
-- mutations additionally record who requeued work and how many learner items were affected.

create or replace function public.retry_report_card_batch_failures(p_batch_id uuid)
returns integer
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_batch public.report_card_batches%rowtype;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_batch from public.report_card_batches where id=p_batch_id for update;
  if not found then raise exception 'Report-card batch not found'; end if;
  if not (
    app_private.has_school_role(v_batch.school_id,array['school_admin','principal','deputy_principal'])
    or app_private.has_platform_role(array['platform_admin'])
  ) then raise exception 'Permission denied'; end if;

  update public.report_card_batch_items
  set status='pending',result_code=null,message=null,started_at=null,completed_at=null,updated_at=now()
  where batch_id=v_batch.id and status='failed';
  get diagnostics v_count=row_count;

  if v_count>0 then
    update public.report_card_batches
    set status='pending',completed_at=null,updated_at=now()
    where id=v_batch.id;

    perform app_private.refresh_report_card_batch(v_batch.id);

    insert into public.audit_events(
      tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
    ) values (
      v_batch.tenant_id,
      v_batch.school_id,
      auth.uid(),
      'report_card.batch.retry_requested',
      'report_card_batch',
      v_batch.id,
      jsonb_build_object('operation',v_batch.operation,'retried_items',v_count)
    );
  end if;

  return v_count;
end;
$$;

revoke all on function public.retry_report_card_batch_failures(uuid) from public,anon;
grant execute on function public.retry_report_card_batch_failures(uuid) to authenticated;

create or replace function public.retry_report_card_batch_export(p_batch_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_batch public.report_card_batches%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_batch from public.report_card_batches where id=p_batch_id for update;
  if not found then raise exception 'Report-card batch not found'; end if;
  if not (
    app_private.has_school_role(v_batch.school_id,array['school_admin','principal','deputy_principal'])
    or app_private.has_platform_role(array['platform_admin'])
  ) then raise exception 'Permission denied'; end if;
  if v_batch.operation<>'pdf' or v_batch.export_status<>'failed' then
    raise exception 'Only failed PDF batch exports can be retried';
  end if;

  update public.report_card_batches
  set export_status='waiting',export_error=null,updated_at=now()
  where id=v_batch.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values (
    v_batch.tenant_id,
    v_batch.school_id,
    auth.uid(),
    'report_card.batch.export.retry_requested',
    'report_card_batch',
    v_batch.id,
    jsonb_build_object('operation',v_batch.operation)
  );

  return true;
end;
$$;

revoke all on function public.retry_report_card_batch_export(uuid) from public,anon;
grant execute on function public.retry_report_card_batch_export(uuid) to authenticated;

comment on function public.retry_report_card_batch_failures(uuid) is
'Requeues failed learner items for a report-card batch after school/platform authorization and records the management retry in audit_events.';

comment on function public.retry_report_card_batch_export(uuid) is
'Requeues a failed combined PDF export after school/platform authorization and records the management retry in audit_events.';
