begin;

select plan(11);

select ok(
  to_regprocedure('public.get_sports_house_assignment_years(uuid)') is not null,
  'sports assignment years RPC exists'
);

select is(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_sports_house_assignment_years'
  ),
  true,
  'sports assignment years RPC is SECURITY DEFINER'
);

select is(
  (
    select array_to_string(p.proconfig, ',')
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_sports_house_assignment_years'
  ),
  'search_path=pg_catalog, public, app_private',
  'sports assignment years RPC pins search_path'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%auth.uid() is null%'
      and pg_get_functiondef(p.oid) like '%Authentication required%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_sports_house_assignment_years'
  ),
  'sports assignment years RPC requires authentication'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%app_private.has_school_access(p_school_id)%'
      and pg_get_functiondef(p.oid) like '%app_private.has_platform_role(array[''platform_admin''::text])%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_sports_house_assignment_years'
  ),
  'sports assignment years RPC preserves school-access and platform-admin authority'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%Permission denied%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_sports_house_assignment_years'
  ),
  'sports assignment years RPC fails closed outside authorized school scope'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%public.sports_learner_house_assignments%'
      and pg_get_functiondef(p.oid) like '%public.sports_staff_house_assignments%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_sports_house_assignment_years'
  ),
  'sports assignment years RPC preserves both assignment sources'
);

select ok(
  has_function_privilege('authenticated','public.get_sports_house_assignment_years(uuid)','EXECUTE'),
  'authenticated can execute sports assignment years RPC'
);

select ok(
  not has_function_privilege('anon','public.get_sports_house_assignment_years(uuid)','EXECUTE'),
  'anon cannot execute sports assignment years RPC'
);

select is(
  (
    select count(*)::integer
    from information_schema.routine_privileges
    where routine_schema='public'
      and routine_name='get_sports_house_assignment_years'
      and grantee='PUBLIC'
      and privilege_type='EXECUTE'
  ),
  0,
  'PUBLIC has no execute grant'
);

select is(
  (
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_sports_house_assignment_years'
  ),
  'p_school_id uuid',
  'sports assignment years RPC signature remains unchanged'
);

select * from finish();
rollback;