-- Functions are executable by PUBLIC by default in PostgreSQL unless explicitly
-- revoked. app_private contains authorization helpers and trigger functions that are
-- implementation details, not anonymous API endpoints. Preserve the existing
-- authenticated helper surface used by RLS, but remove inherited PUBLIC/anon access
-- and direct client execution of trigger functions.

do $$
declare
  f record;
  v_authenticated_allowed boolean;
  v_is_trigger boolean;
begin
  for f in
    select p.oid, p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_private'
  loop
    v_authenticated_allowed := has_function_privilege('authenticated',f.oid,'EXECUTE');
    v_is_trigger := exists(
      select 1 from pg_trigger t
      where not t.tgisinternal and t.tgfoid=f.oid
    );

    execute format('revoke execute on function %s from public,anon,authenticated', f.signature);

    if v_authenticated_allowed and not v_is_trigger then
      execute format('grant execute on function %s to authenticated', f.signature);
    end if;
  end loop;
end $$;

-- Prevent future postgres-owned functions from inheriting PUBLIC execution by default.
-- Application RPCs must explicitly grant the role(s) that are allowed to call them.
alter default privileges for role postgres in schema public
  revoke execute on functions from public,anon,authenticated;
alter default privileges for role postgres in schema app_private
  revoke execute on functions from public,anon,authenticated;

-- These notification helpers depend on auth.uid() and are user-session operations,
-- not anonymous endpoints. Keep authenticated execution while closing inherited access.
revoke execute on function public.mark_all_notifications_read() from public,anon;
revoke execute on function public.dismiss_all_notifications() from public,anon;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.dismiss_all_notifications() to authenticated;

-- The invitation preview is intentionally the one anonymous token-scoped RPC here.
revoke execute on function public.get_school_invitation_preview(text) from public;
grant execute on function public.get_school_invitation_preview(text) to anon,authenticated;

comment on function public.get_school_invitation_preview(text) is
'Intentional anonymous token-scoped invitation preview. Other private authorization/trigger helpers are not anonymous API endpoints.';
