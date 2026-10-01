begin;

select plan(9);

select ok(
  to_regprocedure('public.get_school_dashboard_overview(uuid,integer)') is not null,
  'dashboard overview RPC exists'
);

select is(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_school_dashboard_overview'
  ),
  false,
  'dashboard overview RPC is SECURITY INVOKER'
);

select is(
  (
    select array_to_string(p.proconfig, ',')
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_school_dashboard_overview'
  ),
  'search_path=pg_catalog',
  'dashboard overview RPC pins search_path'
);

select is(
  (
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_school_dashboard_overview'
  ),
  'p_school_id uuid, p_academic_year integer',
  'dashboard overview RPC accepts school and academic-year scope only'
);

select ok(
  has_function_privilege('authenticated','public.get_school_dashboard_overview(uuid,integer)','EXECUTE'),
  'authenticated can execute dashboard overview RPC'
);

select ok(
  not has_function_privilege('anon','public.get_school_dashboard_overview(uuid,integer)','EXECUTE'),
  'anon cannot execute dashboard overview RPC'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%public.enrolments%'
      and pg_get_functiondef(p.oid) like '%public.grades%'
      and pg_get_functiondef(p.oid) like '%public.register_classes%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_school_dashboard_overview'
  ),
  'dashboard overview RPC bundles all three count sources'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%status = ''current''%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_school_dashboard_overview'
  ),
  'dashboard overview preserves current-enrolment semantics'
);

select is(
  (
    select count(*)::integer
    from information_schema.routine_privileges
    where routine_schema='public'
      and routine_name='get_school_dashboard_overview'
      and grantee='PUBLIC'
      and privilege_type='EXECUTE'
  ),
  0,
  'PUBLIC has no execute grant'
);

select * from finish();
rollback;
