-- Keep worker RPC authorization at the database grant boundary. SECURITY DEFINER
-- changes current_user to the function owner, so worker identity must not be inferred
-- from current_user inside these functions. Only service_role receives EXECUTE.

create or replace function public.claim_communication_delivery_jobs(p_limit integer default 25)
returns setof public.communication_delivery_jobs
language plpgsql security definer set search_path=public as $$
begin
  return query
  with candidates as (
    select id from public.communication_delivery_jobs
    where status in ('pending','retry') and available_at <= now()
    order by available_at,created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,25),100))
  ), claimed as (
    update public.communication_delivery_jobs j
    set status='processing',attempt_count=attempt_count+1,locked_at=now(),last_attempt_at=now(),updated_at=now()
    from candidates c where j.id=c.id
    returning j.*
  ) select * from claimed;
end;
$$;

create or replace function public.complete_communication_delivery_job(p_job_id uuid,p_provider_key text default null,p_provider_message_id text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_job public.communication_delivery_jobs%rowtype;
begin
  select * into v_job from public.communication_delivery_jobs where id=p_job_id for update;
  if not found then raise exception 'Delivery job not found'; end if;
  update public.communication_delivery_jobs set status='completed',provider_key=nullif(btrim(coalesce(p_provider_key,'')),''),completed_at=now(),locked_at=null,last_error=null,updated_at=now() where id=v_job.id;
  update public.communication_recipients set delivery_status='delivered',provider_message_id=nullif(btrim(coalesce(p_provider_message_id,'')),''),delivered_at=now(),failure_reason=null where id=v_job.recipient_id;
  if not exists(select 1 from public.communication_delivery_jobs where message_id=v_job.message_id and status not in ('completed','cancelled')) then update public.communication_messages set status='sent',sent_at=coalesce(sent_at,now()),updated_at=now() where id=v_job.message_id; end if;
  return true;
end; $$;

create or replace function public.fail_communication_delivery_job(p_job_id uuid,p_error text,p_retry_after_seconds integer default 300,p_max_attempts integer default 5)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_job public.communication_delivery_jobs%rowtype; v_dead boolean;
begin
  select * into v_job from public.communication_delivery_jobs where id=p_job_id for update;
  if not found then raise exception 'Delivery job not found'; end if;
  v_dead:=v_job.attempt_count >= greatest(1,coalesce(p_max_attempts,5));
  update public.communication_delivery_jobs set status=case when v_dead then 'dead' else 'retry' end,available_at=case when v_dead then available_at else now()+make_interval(secs=>greatest(30,coalesce(p_retry_after_seconds,300))) end,locked_at=null,last_error=left(coalesce(p_error,'Delivery failed'),2000),updated_at=now() where id=v_job.id;
  update public.communication_recipients set delivery_status=case when v_dead then 'failed' else 'queued' end,failure_reason=left(coalesce(p_error,'Delivery failed'),2000) where id=v_job.recipient_id;
  if v_dead then update public.communication_messages set status=case when exists(select 1 from public.communication_delivery_jobs where message_id=v_job.message_id and status='completed') then 'partially_sent' else 'failed' end,updated_at=now() where id=v_job.message_id; end if;
  return true;
end; $$;

revoke all on function public.claim_communication_delivery_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_communication_delivery_jobs(integer) to service_role;
revoke all on function public.complete_communication_delivery_job(uuid,text,text) from public,anon,authenticated;
grant execute on function public.complete_communication_delivery_job(uuid,text,text) to service_role;
revoke all on function public.fail_communication_delivery_job(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.fail_communication_delivery_job(uuid,text,integer,integer) to service_role;
