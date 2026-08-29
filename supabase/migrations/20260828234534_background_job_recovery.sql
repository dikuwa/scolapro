-- Background workers can crash after claiming jobs. Recovery is service-role only and
-- returns stale processing jobs to retry/dead states without mutating canonical domain data.

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
  v_count integer;
begin
  with stale as (
    select id,attempt_count
    from public.communication_delivery_jobs
    where status='processing'
      and locked_at is not null
      and locked_at <= now() - make_interval(mins=>greatest(1,coalesce(p_stale_after_minutes,15)))
    order by locked_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,100),500))
  ), recovered as (
    update public.communication_delivery_jobs j
    set status=case when s.attempt_count>=greatest(1,coalesce(p_max_attempts,5)) then 'dead' else 'retry' end,
        available_at=case when s.attempt_count>=greatest(1,coalesce(p_max_attempts,5)) then j.available_at else now() end,
        locked_at=null,
        last_error=coalesce(j.last_error,'Worker lock expired before completion'),
        updated_at=now()
    from stale s
    where j.id=s.id
    returning j.id,j.attempt_count,j.status,j.recipient_id
  )
  update public.communication_delivery_attempts a
  set outcome=case when r.status='dead' then 'failed' else 'retry' end,
      finished_at=coalesce(a.finished_at,now()),
      error_code=coalesce(a.error_code,'worker_lock_expired'),
      error_detail=coalesce(a.error_detail,'Worker lock expired before completion')
  from recovered r
  where a.delivery_job_id=r.id and a.attempt_number=r.attempt_count and a.outcome='processing';

  get diagnostics v_count = row_count;

  -- row_count above reflects updated attempt rows, so return the actual recovered job count.
  select count(*)::integer into v_count
  from public.communication_delivery_jobs
  where last_error='Worker lock expired before completion'
    and updated_at >= transaction_timestamp();
  return coalesce(v_count,0);
end;
$$;

create or replace function public.recover_stale_report_card_render_jobs(
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
  v_count integer;
begin
  with stale as (
    select id,attempt_count
    from public.report_card_render_jobs
    where status='processing'
      and locked_at is not null
      and locked_at <= now() - make_interval(mins=>greatest(1,coalesce(p_stale_after_minutes,15)))
    order by locked_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,100),500))
  ), recovered as (
    update public.report_card_render_jobs j
    set status=case when s.attempt_count>=greatest(1,coalesce(p_max_attempts,5)) then 'dead' else 'retry' end,
        available_at=case when s.attempt_count>=greatest(1,coalesce(p_max_attempts,5)) then j.available_at else now() end,
        locked_at=null,
        last_error=coalesce(j.last_error,'Worker lock expired before completion'),
        updated_at=now()
    from stale s
    where j.id=s.id
    returning j.id
  )
  select count(*)::integer into v_count from recovered;
  return coalesce(v_count,0);
end;
$$;

revoke all on function public.recover_stale_communication_delivery_jobs(integer,integer,integer) from public,anon,authenticated;
grant execute on function public.recover_stale_communication_delivery_jobs(integer,integer,integer) to service_role;
revoke all on function public.recover_stale_report_card_render_jobs(integer,integer,integer) from public,anon,authenticated;
grant execute on function public.recover_stale_report_card_render_jobs(integer,integer,integer) to service_role;

comment on function public.recover_stale_communication_delivery_jobs(integer,integer,integer) is
'Service-worker recovery for stale claimed communication jobs. Does not resend by itself; recovered jobs re-enter the normal retry claim path.';
comment on function public.recover_stale_report_card_render_jobs(integer,integer,integer) is
'Service-worker recovery for stale claimed report render jobs. Certified snapshot data remains immutable.';
