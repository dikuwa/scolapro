-- Issue #615 / Offline Phase 2E
-- Make the existing append-only teaching actual mutation safe for offline replay.
-- The receipt is the idempotency authority; teaching_actuals remains the sole
-- authoritative record and planned schedule items remain untouched.

create or replace function public.record_teaching_actual_idempotent(
  p_client_operation_id uuid,
  p_teaching_schedule_item_id uuid,
  p_taught_on date,
  p_periods_used smallint,
  p_coverage_state text,
  p_reflection text default null,
  p_compensatory_action text default null
) returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_item public.teaching_schedule_items%rowtype;
  v_existing public.client_operation_receipts%rowtype;
  v_payload jsonb;
  v_fingerprint text;
  v_actual_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_client_operation_id is null then raise exception 'Client operation ID is required'; end if;

  select * into v_item
  from public.teaching_schedule_items
  where id=p_teaching_schedule_item_id;
  if not found then raise exception 'Schedule item not found or not accessible in your current school'; end if;
  if not app_private.can_record_teaching_actual(auth.uid(),v_item.school_id,v_item.teacher_allocation_id,p_taught_on) then
    raise exception 'Teaching actual recorder mismatch: user is not authorized for teaching allocation';
  end if;

  v_payload:=jsonb_build_object(
    'teaching_schedule_item_id',p_teaching_schedule_item_id,
    'taught_on',p_taught_on,
    'periods_used',p_periods_used,
    'coverage_state',p_coverage_state,
    'reflection',nullif(btrim(coalesce(p_reflection,'')),''),
    'compensatory_action',nullif(btrim(coalesce(p_compensatory_action,'')),'')
  );
  v_fingerprint:=md5(v_payload::text);

  select * into v_existing
  from public.client_operation_receipts
  where actor_user_id=auth.uid()
    and operation_type='teaching_actual.record'
    and client_operation_id=p_client_operation_id
  for update;
  if found then
    if v_existing.payload_fingerprint<>v_fingerprint then
      raise exception 'Client operation ID was already used with different teaching actual data';
    end if;
    if v_existing.completed_at is null or v_existing.result_payload is null then
      raise exception 'Client operation is already being processed';
    end if;
    return (v_existing.result_payload->>'teaching_actual_id')::uuid;
  end if;

  insert into public.client_operation_receipts(
    tenant_id,school_id,actor_user_id,operation_type,client_operation_id,payload_fingerprint
  ) values (
    v_item.tenant_id,v_item.school_id,auth.uid(),'teaching_actual.record',p_client_operation_id,v_fingerprint
  );

  insert into public.teaching_actuals(
    tenant_id,school_id,teaching_schedule_item_id,taught_on,periods_used,coverage_state,
    reflection,compensatory_action,recorded_by_user_id
  ) values (
    v_item.tenant_id,v_item.school_id,p_teaching_schedule_item_id,p_taught_on,p_periods_used,p_coverage_state,
    nullif(btrim(coalesce(p_reflection,'')),''),nullif(btrim(coalesce(p_compensatory_action,'')),''),auth.uid()
  ) returning id into v_actual_id;

  update public.client_operation_receipts
  set result_payload=jsonb_build_object('teaching_actual_id',v_actual_id),completed_at=now()
  where actor_user_id=auth.uid()
    and operation_type='teaching_actual.record'
    and client_operation_id=p_client_operation_id;

  return v_actual_id;
end;
$$;

revoke all on function public.record_teaching_actual_idempotent(uuid,uuid,date,smallint,text,text,text) from public,anon;
grant execute on function public.record_teaching_actual_idempotent(uuid,uuid,date,smallint,text,text,text) to authenticated;

comment on function public.record_teaching_actual_idempotent(uuid,uuid,date,smallint,text,text,text) is
'Offline-safe append-only teaching actual recording. Replaying the same actor operation returns the original teaching actual; changed payloads are rejected. Current recorder, tenant, school, allocation and schedule scope are revalidated before insertion.';
