-- Functions are executable by PUBLIC by default in PostgreSQL unless explicitly
-- revoked. app_private contains authorization helpers and trigger functions that are
-- implementation details, not anonymous API endpoints. No anon RLS policy depends on
-- direct execution of these helpers; the intentionally public invitation-preview RPC
-- is SECURITY DEFINER and reads its own narrow token-scoped result.

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_private'
  loop
    execute format('revoke execute on function %s from anon', f.signature);
  end loop;
end $$;

-- Trigger functions execute through their trigger binding and do not need to be
-- callable as authenticated RPC endpoints. Remove the direct EXECUTE capability too.
do $$
declare
  f record;
begin
  for f in
    select distinct p.oid::regprocedure as signature
    from pg_trigger t
    join pg_proc p on p.oid=t.tgfoid
    join pg_namespace n on n.oid=p.pronamespace
    where not t.tgisinternal
      and n.nspname='app_private'
  loop
    execute format('revoke execute on function %s from authenticated', f.signature);
  end loop;
end $$;

-- These notification helpers depend on auth.uid() and are user-session operations,
-- not anonymous endpoints. Keep authenticated execution while closing the inherited
-- PUBLIC/anon capability.
revoke execute on function public.mark_all_notifications_read() from public,anon;
revoke execute on function public.dismiss_all_notifications() from public,anon;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.dismiss_all_notifications() to authenticated;

-- The invitation preview is intentionally the one anonymous token-scoped RPC here.
revoke execute on function public.get_school_invitation_preview(text) from public;
grant execute on function public.get_school_invitation_preview(text) to anon,authenticated;

comment on function public.get_school_invitation_preview(text) is
'Intentional anonymous token-scoped invitation preview. Other private authorization/trigger helpers are not anonymous API endpoints.';
