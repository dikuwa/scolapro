begin;

select plan(10);

select ok(
  to_regprocedure('public.get_sports_house_staff_roster(uuid,integer)') is not null,
  'sports staff roster RPC exists'
);

select is(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_sports_house_staff_roster'
  ),
  false,
  'sports staff roster RPC is SECURITY INVOKER'
);

select is(
  (
    select array_to_string(p.proconfig, ',')
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_sports_house_staff_roster'
  ),
  'search_path=pg_catalog',
  'sports staff roster RPC pins search_path'
);

select is(
  (
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_sports_house_staff_roster'
  ),
  'p_school_id uuid, p_academic_year integer',
  'sports staff roster RPC accepts school and academic-year scope only'
);

select ok(
  has_function_privilege('authenticated','public.get_sports_house_staff_roster(uuid,integer)','EXECUTE'),
  'authenticated can execute sports staff roster RPC'
);

select ok(
  not has_function_privilege('anon','public.get_sports_house_staff_roster(uuid,integer)','EXECUTE'),
  'anon cannot execute sports staff roster RPC'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%app_private.get_sports_house_staff_roster_authorized(p_school_id, p_academic_year)%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_sports_house_staff_roster'
  ),
  'sports staff roster RPC delegates to the source-authorized private helper'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%select roster.staff_member_id%'
      and pg_get_functiondef(p.oid) like '%roster.employee_number%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_sports_house_staff_roster'
  ),
  'sports staff roster RPC preserves the canonical row shape'
);

select ok(
  (
    select pg_get_functiondef(p.oid) not like '%public.staff_school_assignments%'
      and pg_get_functiondef(p.oid) not like '%public.sports_staff_house_assignments%'
      and pg_get_functiondef(p.oid) not like '%public.staff_members%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_sports_house_staff_roster'
  ),
  'exposed staff roster RPC does not own privileged source scans'
);

select is(
  (
    select count(*)::integer
    from information_schema.routine_privileges
    where routine_schema='public'
      and routine_name='get_sports_house_staff_roster'
      and grantee='PUBLIC'
      and privilege_type='EXECUTE'
  ),
  0,
  'PUBLIC has no execute grant'
);

select * from finish();
rollback;