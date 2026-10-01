begin;

select plan(9);

select ok(
  to_regprocedure('public.get_my_user_context(date)') is not null,
  'get_my_user_context(date) exists'
);

select is(
  (
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_my_user_context'
  ),
  'p_as_of_date date',
  'RPC accepts only the explicit as-of date and no user id'
);

select ok(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_my_user_context'
  ),
  'RPC is SECURITY DEFINER'
);

select ok(
  (
    select exists (
      select 1
      from unnest(p.proconfig) config
      where config = 'search_path=pg_catalog'
    )
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_my_user_context'
  ),
  'RPC pins search_path to pg_catalog'
);

select is(
  (
    select p.provolatile::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_my_user_context'
  ),
  's',
  'RPC is STABLE'
);

select ok(
  has_function_privilege('authenticated', 'public.get_my_user_context(date)', 'EXECUTE'),
  'authenticated role can execute bundled context RPC'
);

select ok(
  not has_function_privilege('anon', 'public.get_my_user_context(date)', 'EXECUTE'),
  'anon role cannot execute bundled context RPC'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%auth.uid()%'
       and pg_get_functiondef(p.oid) like '%public.user_profiles%'
       and pg_get_functiondef(p.oid) like '%public.school_memberships%'
       and pg_get_functiondef(p.oid) like '%public.platform_memberships%'
       and pg_get_functiondef(p.oid) like '%public.education_network_memberships%'
       and pg_get_functiondef(p.oid) like '%public.guardian_user_links%'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_my_user_context'
  ),
  'RPC is self-scoped and bundles all five shared context sources'
);

select is(
  (
    select count(*)::integer
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'get_my_user_context'
      and grantee = 'PUBLIC'
      and privilege_type = 'EXECUTE'
  ),
  0,
  'PUBLIC has no execute grant'
);

select * from finish();
rollback;
