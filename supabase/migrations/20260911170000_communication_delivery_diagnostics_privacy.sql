-- Keep raw provider/internal delivery diagnostics worker-only. Authenticated
-- communication leaders receive only a bounded, school-scoped operational summary.

revoke select on public.communication_delivery_jobs from authenticated;
revoke select on public.communication_delivery_attempts from authenticated;

drop policy if exists "authorized staff read communication delivery jobs" on public.communication_delivery_jobs;
drop policy if exists "authorized users read own or governed delivery jobs" on public.communication_delivery_jobs;
drop policy if exists "communication managers read delivery attempts" on public.communication_delivery_attempts;
drop policy if exists "authorized users read governed delivery attempts" on public.communication_delivery_attempts;

-- Keep an explicit policy on each RLS table so the public-schema security baseline
-- remains closed even if table privileges are changed accidentally in the future.
create policy "authenticated raw delivery job reads denied"
on public.communication_delivery_jobs
for select to authenticated
using (false);

create policy "authenticated raw delivery attempt reads denied"
on public.communication_delivery_attempts
for select to authenticated
using (false);

create or replace function public.list_communication_delivery_diagnostics(
  p_school_id uuid,
  p_limit integer default 100
)
returns table(
  delivery_job_id uuid,
  message_id uuid,
  recipient_id uuid,
  channel text,
  provider_key text,
  status text,
  attempt_count integer,
  available_at timestamptz,
  last_attempt_at timestamptz,
  completed_at timestamptz,
  latest_attempt_number integer,
  latest_outcome text,
  latest_started_at timestamptz,
  latest_finished_at timestamptz,
  latest_error_code text
)
language plpgsql
stable
security definer
set search_path=public,app_private
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  -- Delivery diagnostics are a leadership/provider-operations surface, not the
  -- broader authoring surface represented by can_manage_communications().
  if p_school_id is null or not (
    app_private.has_platform_role(array['platform_admin'])
    or exists(
      select 1
      from public.school_memberships sm
      where sm.school_id=p_school_id
        and sm.user_id=auth.uid()
        and sm.role_key in ('school_admin','principal','deputy_principal')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    )
  ) then
    raise exception 'Permission denied';
  end if;

  return query
  select
    j.id,
    j.message_id,
    j.recipient_id,
    j.channel,
    j.provider_key,
    j.status,
    j.attempt_count,
    j.available_at,
    j.last_attempt_at,
    j.completed_at,
    a.attempt_number,
    a.outcome,
    a.started_at,
    a.finished_at,
    a.error_code
  from public.communication_delivery_jobs j
  left join lateral (
    select da.attempt_number,da.outcome,da.started_at,da.finished_at,da.error_code
    from public.communication_delivery_attempts da
    where da.delivery_job_id=j.id
    order by da.attempt_number desc
    limit 1
  ) a on true
  where j.school_id=p_school_id
  order by j.created_at desc
  limit greatest(1,least(coalesce(p_limit,100),500));
end;
$$;

revoke all on function public.list_communication_delivery_diagnostics(uuid,integer) from public,anon;
grant execute on function public.list_communication_delivery_diagnostics(uuid,integer) to authenticated;

comment on function public.list_communication_delivery_diagnostics(uuid,integer) is
'School-scoped communication delivery summary for platform admins or current school administrators/principals/deputy principals. Raw last_error, error_detail, provider_message_id and provider_metadata remain service-role only.';