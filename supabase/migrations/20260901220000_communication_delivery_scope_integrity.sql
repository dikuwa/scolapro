create or replace function app_private.enforce_communication_delivery_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
  v_message_tenant uuid;
  v_message_school uuid;
  v_message_channel text;
  v_recipient_tenant uuid;
  v_recipient_school uuid;
  v_recipient_message uuid;
  v_job_tenant uuid;
  v_job_school uuid;
  v_job_recipient uuid;
begin
  select s.tenant_id into v_school_tenant from public.schools s where s.id = new.school_id;
  if v_school_tenant is null or v_school_tenant is distinct from new.tenant_id then
    raise exception 'Communication delivery scope mismatch: school does not belong to tenant';
  end if;

  if tg_table_name = 'communication_delivery_jobs' then
    select m.tenant_id,m.school_id,m.channel into v_message_tenant,v_message_school,v_message_channel
    from public.communication_messages m where m.id=new.message_id;
    if not found or (v_message_tenant,v_message_school) is distinct from (new.tenant_id,new.school_id) then
      raise exception 'Communication delivery job scope mismatch: message does not belong to school';
    end if;
    if v_message_channel is distinct from new.channel then
      raise exception 'Communication delivery job channel does not match message channel';
    end if;

    select r.tenant_id,r.school_id,r.message_id into v_recipient_tenant,v_recipient_school,v_recipient_message
    from public.communication_recipients r where r.id=new.recipient_id;
    if not found or (v_recipient_tenant,v_recipient_school,v_recipient_message)
      is distinct from (new.tenant_id,new.school_id,new.message_id) then
      raise exception 'Communication delivery job scope mismatch: recipient does not belong to message';
    end if;

    if tg_op='UPDATE' and (
      new.tenant_id is distinct from old.tenant_id
      or new.school_id is distinct from old.school_id
      or new.message_id is distinct from old.message_id
      or new.recipient_id is distinct from old.recipient_id
      or new.channel is distinct from old.channel
      or new.created_at is distinct from old.created_at
    ) then
      raise exception 'Communication delivery job identity is immutable';
    end if;

  elsif tg_table_name = 'communication_delivery_attempts' then
    select j.tenant_id,j.school_id into v_job_tenant,v_job_school
    from public.communication_delivery_jobs j where j.id=new.delivery_job_id;
    if not found or (v_job_tenant,v_job_school) is distinct from (new.tenant_id,new.school_id) then
      raise exception 'Communication delivery attempt scope mismatch: job does not belong to school';
    end if;

    if tg_op='UPDATE' and (
      new.tenant_id is distinct from old.tenant_id
      or new.school_id is distinct from old.school_id
      or new.delivery_job_id is distinct from old.delivery_job_id
      or new.attempt_number is distinct from old.attempt_number
      or new.started_at is distinct from old.started_at
      or new.created_at is distinct from old.created_at
    ) then
      raise exception 'Communication delivery attempt identity is immutable';
    end if;

  elsif tg_table_name = 'communication_delivery_receipts' then
    select j.tenant_id,j.school_id,j.recipient_id into v_job_tenant,v_job_school,v_job_recipient
    from public.communication_delivery_jobs j where j.id=new.delivery_job_id;
    if not found or (v_job_tenant,v_job_school,v_job_recipient)
      is distinct from (new.tenant_id,new.school_id,new.recipient_id) then
      raise exception 'Communication delivery receipt scope mismatch: job or recipient does not match';
    end if;

    if tg_op='UPDATE' and (
      new.tenant_id is distinct from old.tenant_id
      or new.school_id is distinct from old.school_id
      or new.delivery_job_id is distinct from old.delivery_job_id
      or new.recipient_id is distinct from old.recipient_id
      or new.provider_key is distinct from old.provider_key
      or new.provider_message_id is distinct from old.provider_message_id
      or new.provider_event_id is distinct from old.provider_event_id
      or new.occurred_at is distinct from old.occurred_at
      or new.created_at is distinct from old.created_at
    ) then
      raise exception 'Communication delivery receipt provenance is immutable';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_communication_delivery_scope_integrity() from public, anon, authenticated;

drop trigger if exists communication_delivery_jobs_scope_integrity_trg on public.communication_delivery_jobs;
create trigger communication_delivery_jobs_scope_integrity_trg
before insert or update on public.communication_delivery_jobs
for each row execute function app_private.enforce_communication_delivery_scope_integrity();

drop trigger if exists communication_delivery_attempts_scope_integrity_trg on public.communication_delivery_attempts;
create trigger communication_delivery_attempts_scope_integrity_trg
before insert or update on public.communication_delivery_attempts
for each row execute function app_private.enforce_communication_delivery_scope_integrity();

drop trigger if exists communication_delivery_receipts_scope_integrity_trg on public.communication_delivery_receipts;
create trigger communication_delivery_receipts_scope_integrity_trg
before insert or update on public.communication_delivery_receipts
for each row execute function app_private.enforce_communication_delivery_scope_integrity();