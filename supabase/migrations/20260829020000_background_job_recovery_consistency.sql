-- Make stale communication recovery state-consistent and return an exact recovered
-- job count. Recovery updates the delivery attempt and canonical recipient delivery
-- state but does not manufacture a provider success.

create or replace function public.recover_stale_communication_delivery_jobs(
  p_stale_after_minutes integer default 15,
  p_max_attempts integer default 5,
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_job public.communication_delivery_jobs%rowtype;
  v_count integer := 0;
  v_dead boolean;
begin
  for v_job in
    select *
    from public.communication_delivery_jobs
    where status='processing'
      and locked_at is not null
      and locked_at <= now() - make_interval(mins=>greatest(1,coalesce(p_stale_after_minutes,15)))
    order by locked_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,100),500))
  loop
    v_dead := v_job.attempt_count >= greatest(1,coalesce(p_max_attempts,5));

    update public.communication_delivery_jobs
    set status=case when v_dead then 'dead' else 'retry' end,
        available_at=case when v_dead then available_at else now() end,
        locked_at=null,
        last_error='Worker lock expired before completion',
        updated_at=now()
    where id=v_job.id;

    update public.communication_delivery_attempts
    set outcome=case when v_dead then 'failed' else 'retry' end,
        finished_at=coalesce(finished_at,now()),
        error_code=coalesce(error_code,'worker_lock_expired'),
        error_detail=coalesce(error_detail,'Worker lock expired before completion')
    where delivery_job_id=v_job.id
      and attempt_number=v_job.attempt_count
      and outcome='processing';

    update public.communication_recipients
    set delivery_status=case when v_dead then 'failed' else 'queued' end,
        failure_reason='Worker lock expired before completion'
    where id=v_job.recipient_id;

    if v_dead and not exists (
      select 1
      from public.communication_delivery_jobs j
      where j.message_id=v_job.message_id
        and j.id<>v_job.id
        and j.status not in ('completed','dead','cancelled')
    ) then
      update public.communication_messages
      set status=case
        when exists(
          select 1 from public.communication_delivery_jobs j
          where j.message_id=v_job.message_id and j.status='completed'
        ) then 'partially_sent'
        else 'failed'
      end,
      updated_at=now()
      where id=v_job.message_id;
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.recover_stale_communication_delivery_jobs(integer,integer,integer) from public,anon,authenticated;
grant execute on function public.recover_stale_communication_delivery_jobs(integer,integer,integer) to service_role;
