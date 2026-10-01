begin;

select plan(10);

select ok(
  to_regprocedure('public.get_sports_house_workspace_metadata(uuid)') is not null,
  'Sports/Houses workspace metadata RPC exists'
);

select is(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_sports_house_workspace_metadata'
  ),
  false,
  'workspace metadata RPC is SECURITY INVOKER'
);

select is(
  (
    select array_to_string(p.proconfig, ',')
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_sports_house_workspace_metadata'
  ),
  'search_path=pg_catalog',
  'workspace metadata RPC pins pg_catalog search_path'
);

select is(
  (
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_sports_house_workspace_metadata'
  ),
  'p_school_id uuid',
  'workspace metadata RPC accepts only school scope'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%public.schools%'
      and pg_get_functiondef(p.oid) like '%public.sports_houses%'
      and pg_get_functiondef(p.oid) like '%public.sports_year_settings%'
      and pg_get_functiondef(p.oid) like '%public.sports_age_groups%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_sports_house_workspace_metadata'
  ),
  'workspace metadata RPC bundles all four governed metadata sources'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%order by h.sort_order, h.name%'
      and pg_get_functiondef(p.oid) like '%order by ys.academic_year desc%'
      and pg_get_functiondef(p.oid) like '%order by ag.sort_order, ag.label%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_sports_house_workspace_metadata'
  ),
  'workspace metadata RPC preserves canonical source ordering'
);

select ok(
  has_function_privilege('authenticated','public.get_sports_house_workspace_metadata(uuid)','EXECUTE'),
  'authenticated can execute workspace metadata RPC'
);

select ok(
  not has_function_privilege('anon','public.get_sports_house_workspace_metadata(uuid)','EXECUTE'),
  'anon cannot execute workspace metadata RPC'
);

select is(
  (
    select count(*)::integer
    from information_schema.routine_privileges
    where routine_schema='public'
      and routine_name='get_sports_house_workspace_metadata'
      and grantee='PUBLIC'
      and privilege_type='EXECUTE'
  ),
  0,
  'PUBLIC has no execute grant'
);

select ok(
  (
    select pg_get_functiondef(p.oid) not like '%security definer%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_sports_house_workspace_metadata'
  ),
  'workspace metadata RPC does not bypass source RLS'
);

select * from finish();
rollback;