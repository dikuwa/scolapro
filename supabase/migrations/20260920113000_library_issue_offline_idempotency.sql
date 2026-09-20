-- Offline library issue replay must return the original accepted loan when a
-- client loses the HTTP response after the transaction commits. Reuse the
-- existing client_operation_receipts foundation so retry semantics are
-- consistent with other offline-safe insert workflows.

create or replace function public.issue_learning_resource_idempotent(
  p_client_operation_id uuid,
  p_copy_id uuid,
  p_learner_id uuid default null,
  p_staff_member_id uuid default null,
  p_due_on date default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_copy public.learning_resource_copies%rowtype;
  v_existing public.client_operation_receipts%rowtype;
  v_receipt_id uuid;
  v_payload jsonb;
  v_fingerprint text;
  v_loan_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_client_operation_id is null then
    raise exception 'Client operation ID is required';
  end if;

  select *
  into v_copy
  from public.learning_resource_copies
  where id=p_copy_id;
  if not found then
    raise exception 'Resource copy not found';
  end if;
  if not app_private.can_manage_ltsm(v_copy.school_id) then
    raise exception 'Permission denied';
  end if;

  v_payload:=jsonb_build_object(
    'copy_id',p_copy_id,
    'learner_id',p_learner_id,
    'staff_member_id',p_staff_member_id,
    'due_on',p_due_on,
    'notes',nullif(btrim(coalesce(p_notes,'')),'')
  );
  v_fingerprint:=md5(v_payload::text);

  insert into public.client_operation_receipts(
    tenant_id,school_id,actor_user_id,operation_type,client_operation_id,payload_fingerprint
  ) values(
    v_copy.tenant_id,
    v_copy.school_id,
    auth.uid(),
    'ltsm.resource.issue',
    p_client_operation_id,
    v_fingerprint
  )
  on conflict(actor_user_id,operation_type,client_operation_id) do nothing
  returning id into v_receipt_id;

  if v_receipt_id is null then
    select *
    into v_existing
    from public.client_operation_receipts
    where actor_user_id=auth.uid()
      and operation_type='ltsm.resource.issue'
      and client_operation_id=p_client_operation_id
    for update;

    if not found then
      raise exception 'Client operation receipt could not be resolved';
    end if;
    if v_existing.payload_fingerprint<>v_fingerprint then
      raise exception 'Client operation ID was already used with different library issue data';
    end if;
    if v_existing.completed_at is null or v_existing.result_payload is null then
      raise exception 'Client operation is already being processed';
    end if;

    return (v_existing.result_payload->>'loan_id')::uuid;
  end if;

  v_loan_id:=public.issue_learning_resource(
    p_copy_id,
    p_learner_id,
    p_staff_member_id,
    p_due_on,
    p_notes
  );

  update public.client_operation_receipts
  set result_payload=jsonb_build_object('loan_id',v_loan_id),
      completed_at=now()
  where id=v_receipt_id;

  return v_loan_id;
end;
$$;

revoke all on function public.issue_learning_resource_idempotent(uuid,uuid,uuid,uuid,date,text) from public,anon;
grant execute on function public.issue_learning_resource_idempotent(uuid,uuid,uuid,uuid,date,text) to authenticated;

comment on function public.issue_learning_resource_idempotent(uuid,uuid,uuid,uuid,date,text)
is 'Offline-safe single-copy issue. Replaying the same client operation returns the original loan and rejects mutation-key reuse with changed payload.';
