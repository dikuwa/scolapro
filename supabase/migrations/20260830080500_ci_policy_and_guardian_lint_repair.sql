-- Repair two execution-boundary regressions exposed by full database CI.
--
-- 1. RLS policies execute with caller privileges. Keep the deeper communication
--    authorization helper private, but expose one narrow predicate for policy use.
-- 2. The guardian import commit function intentionally references its PL/pgSQL
--    guardian/address variables inside SQL expressions. Pin variable precedence for
--    that function so PostgreSQL/plpgsql_check resolves those references consistently.

create or replace function app_private.can_read_communication_policy(p_message_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.can_read_communication(p_message_id);
$$;

revoke all on function app_private.can_read_communication_policy(uuid) from public,anon;
grant execute on function app_private.can_read_communication_policy(uuid) to authenticated;

drop policy if exists "authorized users read communication ledger" on public.communication_messages;
create policy "authorized users read communication ledger"
on public.communication_messages for select to authenticated
using (app_private.can_read_communication_policy(id));

drop policy if exists "authorized users read communication recipients" on public.communication_recipients;
create policy "authorized users read communication recipients"
on public.communication_recipients for select to authenticated
using (app_private.can_read_communication_policy(message_id));

drop policy if exists "authorized users read own or governed delivery jobs" on public.communication_delivery_jobs;
create policy "authorized users read own or governed delivery jobs"
on public.communication_delivery_jobs for select to authenticated
using (app_private.can_read_communication_policy(message_id));

alter function public.commit_guardian_import_batch(uuid)
  set plpgsql.variable_conflict = 'use_variable';

comment on function app_private.can_read_communication_policy(uuid) is
'Narrow authenticated RLS predicate for communication-ledger reads; the deeper authorization helper remains non-client-executable.';

comment on function public.commit_guardian_import_batch(uuid) is
'Commits a reviewed guardian roster import atomically. PL/pgSQL variable precedence is pinned so guardian/address variables are resolved deterministically inside SQL expressions.';
