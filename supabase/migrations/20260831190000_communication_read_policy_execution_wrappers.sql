-- Communication ledger privacy is enforced by app_private.can_read_communication(),
-- which is intentionally not directly executable by authenticated clients. RLS must
-- therefore call a narrow SECURITY DEFINER wrapper rather than exposing the private
-- helper itself. Provider-route reads get a similarly narrow leadership wrapper.

create or replace function app_private.can_read_communication_for_rls(p_message_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.can_read_communication(p_message_id);
$$;

revoke all on function app_private.can_read_communication_for_rls(uuid) from public,anon;
grant execute on function app_private.can_read_communication_for_rls(uuid) to authenticated;

create or replace function app_private.can_read_communication_provider_route_for_rls(
  p_tenant_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or (
      p_school_id is not null
      and app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])
    )
    or (
      p_school_id is null
      and exists(
        select 1
        from public.school_memberships sm
        where sm.tenant_id=p_tenant_id
          and sm.user_id=(select auth.uid())
          and sm.role_key in ('school_admin','principal','deputy_principal')
          and sm.active_from<=current_date
          and (sm.active_to is null or sm.active_to>=current_date)
      )
    );
$$;

revoke all on function app_private.can_read_communication_provider_route_for_rls(uuid,uuid) from public,anon;
grant execute on function app_private.can_read_communication_provider_route_for_rls(uuid,uuid) to authenticated;

create or replace function app_private.can_read_communication_delivery_job_for_rls(p_delivery_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select exists(
    select 1
    from public.communication_delivery_jobs j
    where j.id=p_delivery_job_id
      and app_private.can_read_communication(j.message_id)
  );
$$;

revoke all on function app_private.can_read_communication_delivery_job_for_rls(uuid) from public,anon;
grant execute on function app_private.can_read_communication_delivery_job_for_rls(uuid) to authenticated;

-- Canonical message/recipient/job read policies use the same privacy decision.
drop policy if exists "authorized users read communication ledger" on public.communication_messages;
create policy "authorized users read communication ledger"
on public.communication_messages for select to authenticated
using (app_private.can_read_communication_for_rls(id));

drop policy if exists "authorized users read communication recipients" on public.communication_recipients;
create policy "authorized users read communication recipients"
on public.communication_recipients for select to authenticated
using (app_private.can_read_communication_for_rls(message_id));

drop policy if exists "authorized users read own or governed delivery jobs" on public.communication_delivery_jobs;
drop policy if exists "authorized staff read communication delivery jobs" on public.communication_delivery_jobs;
create policy "authorized users read own or governed delivery jobs"
on public.communication_delivery_jobs for select to authenticated
using (app_private.can_read_communication_for_rls(message_id));

-- Provider routing is operational configuration: only platform administration or
-- school/tenant leadership may inspect it.
drop policy if exists "communication managers read provider routes" on public.communication_provider_routes;
create policy "communication leaders read provider routes"
on public.communication_provider_routes for select to authenticated
using (app_private.can_read_communication_provider_route_for_rls(tenant_id,school_id));

-- Attempt/receipt diagnostics follow the underlying communication ledger permission,
-- rather than granting every communication author school-wide diagnostic visibility.
drop policy if exists "communication managers read delivery attempts" on public.communication_delivery_attempts;
create policy "authorized users read governed delivery attempts"
on public.communication_delivery_attempts for select to authenticated
using (app_private.can_read_communication_delivery_job_for_rls(delivery_job_id));

drop policy if exists "communication managers read delivery receipts" on public.communication_delivery_receipts;
create policy "authorized users read governed delivery receipts"
on public.communication_delivery_receipts for select to authenticated
using (app_private.can_read_communication_delivery_job_for_rls(delivery_job_id));

comment on function app_private.can_read_communication_for_rls(uuid) is
'RLS-only wrapper around the private communication-ledger authorization decision. Keeps the underlying helper unavailable as a direct client API.';
comment on function app_private.can_read_communication_delivery_job_for_rls(uuid) is
'RLS-only delivery diagnostic wrapper. Resolves a job back to its canonical message and applies the communication-ledger privacy decision.';
comment on function app_private.can_read_communication_provider_route_for_rls(uuid,uuid) is
'RLS-only provider-route authorization wrapper for platform administration and active school/tenant leadership.';
