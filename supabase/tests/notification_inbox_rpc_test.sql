begin;

select plan(10);

select ok(
  to_regprocedure('public.get_my_notification_inbox(integer)') is not null,
  'notification inbox RPC exists'
);

select is(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public'
      and p.proname='get_my_notification_inbox'
      and pg_get_function_identity_arguments(p.oid)='p_limit integer'
  ),
  false,
  'notification inbox RPC is SECURITY INVOKER'
);

select is(
  (
    select array_to_string(p.proconfig, ',')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public'
      and p.proname='get_my_notification_inbox'
      and pg_get_function_identity_arguments(p.oid)='p_limit integer'
  ),
  'search_path=pg_catalog',
  'notification inbox RPC pins search_path'
);

select ok(
  has_function_privilege('authenticated','public.get_my_notification_inbox(integer)','EXECUTE'),
  'authenticated can execute notification inbox RPC'
);

select ok(
  not has_function_privilege('anon','public.get_my_notification_inbox(integer)','EXECUTE'),
  'anon cannot execute notification inbox RPC'
);

select is(
  (
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public'
      and p.proname='get_my_notification_inbox'
  ),
  'p_limit integer',
  'notification inbox RPC exposes no arbitrary user-id argument'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%auth.uid()%'
       and pg_get_functiondef(p.oid) like '%public.notifications%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_my_notification_inbox'
      and pg_get_function_identity_arguments(p.oid)='p_limit integer'
  ),
  'RPC self-scopes notification rows to auth.uid()'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%dismissed_at is null%'
       and pg_get_functiondef(p.oid) like '%read_at is null%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_my_notification_inbox'
      and pg_get_function_identity_arguments(p.oid)='p_limit integer'
  ),
  'RPC preserves dismissed and unread semantics'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%order by created_at desc%'
       and pg_get_functiondef(p.oid) like '%least(coalesce(p_limit, 8), 50)%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_my_notification_inbox'
      and pg_get_function_identity_arguments(p.oid)='p_limit integer'
  ),
  'RPC preserves latest ordering and bounds requested rows'
);

select is(
  (
    select count(*)::integer
    from information_schema.routine_privileges
    where routine_schema='public'
      and routine_name='get_my_notification_inbox'
      and grantee='PUBLIC'
      and privilege_type='EXECUTE'
  ),
  0,
  'PUBLIC has no notification inbox execute grant'
);

select * from finish();
rollback;
