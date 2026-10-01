begin;

select plan(9);

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
  false,
  'sports assignment years RPC is SECURITY INVOKER'
);

select is(
  (
    select array_to_string(p.proconfig, ',')
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_sports_house_assignment_years'
  ),
  'search_path=pg_catalog',
  'sports assignment years RPC pins search_path'
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
  'sports assignment years RPC accepts school scope only'
);

select ok(
  has_function_privilege('authenticated','public.get_sports_house_assignment_years(uuid)','EXECUTE'),
  'authenticated can execute sports assignment years RPC'
);

select ok(
  not has_function_privilege('anon','public.get_sports_house_assignment_years(uuid)','EXECUTE'),
  'anon cannot execute sports assignment years RPC'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%app_private.get_sports_house_assignment_years_authorized(p_school_id)%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_sports_house_assignment_years'
  ),
  'sports assignment years RPC delegates to the authorized private helper'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%select years.academic_year%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_sports_house_assignment_years'
  ),
  'sports assignment years RPC preserves the one-column year result'
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

select * from finish();
rollback;