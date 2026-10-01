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
    select pg_get_functiondef(p.oid) like '%public.staff_school_assignments%'
      and pg_get_functiondef(p.oid) like '%public.sports_staff_house_assignments%'
      and pg_get_functiondef(p.oid) like '%public.staff_members%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_sports_house_staff_roster'
  ),
  'sports staff roster RPC bundles placement, assignment and identity sources'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%effective_from <= make_date(p_academic_year, 12, 31)%'
      and pg_get_functiondef(p.oid) like '%effective_to >= make_date(p_academic_year, 1, 1)%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_sports_house_staff_roster'
  ),
  'sports staff roster RPC preserves effective placement overlap semantics'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%union%assignment_rows.staff_member_id%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_sports_house_staff_roster'
  ),
  'sports staff roster RPC preserves already-assigned staff outside placement set'
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