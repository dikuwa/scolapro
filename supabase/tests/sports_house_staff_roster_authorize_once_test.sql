begin;

select plan(12);

select ok(
  to_regprocedure('app_private.get_sports_house_staff_roster_authorized(uuid,integer)') is not null,
  'private Sports/Houses staff roster helper exists'
);

select is(
  (
    select p.prosecdef
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_private'
      and p.proname='get_sports_house_staff_roster_authorized'
  ),
  true,
  'private staff roster helper is SECURITY DEFINER'
);

select is(
  (
    select array_to_string(p.proconfig, ',')
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_private'
      and p.proname='get_sports_house_staff_roster_authorized'
  ),
  'search_path=""',
  'private staff roster helper pins empty search_path'
);

select is(
  (
    select p.prosecdef
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_sports_house_staff_roster'
  ),
  false,
  'public staff roster RPC remains SECURITY INVOKER'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%placement_allowed := coalesce(%'
      and pg_get_functiondef(p.oid) like '%app_private.can_access_current_school_staff_directory(p_school_id)%'
      and pg_get_functiondef(p.oid) like '%app_private.has_platform_role(array[''platform_admin'']::text[])%'
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_private'
      and p.proname='get_sports_house_staff_roster_authorized'
  ),
  'placement source keeps current staff-directory/platform authority'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%assignment_allowed := coalesce(%'
      and pg_get_functiondef(p.oid) like '%app_private.has_school_access(p_school_id)%'
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_private'
      and p.proname='get_sports_house_staff_roster_authorized'
  ),
  'sports assignment source keeps school-access/platform authority'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%visible_identity_ids as materialized%'
      and pg_get_functiondef(p.oid) like '%app_private.can_access_current_school_staff_directory(ts.school_id)%'
      and pg_get_functiondef(p.oid) like '%app_private.staff_member_covers_school_period(%'
      and pg_get_functiondef(p.oid) like '%own_staff.user_id = viewer_id%'
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_private'
      and p.proname='get_sports_house_staff_roster_authorized'
  ),
  'staff identity visibility remains governed through bulk-equivalent authority checks'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%effective_from <= pg_catalog.make_date(p_academic_year, 12, 31)%'
      and pg_get_functiondef(p.oid) like '%effective_to >= pg_catalog.make_date(p_academic_year, 1, 1)%'
      and pg_get_functiondef(p.oid) like '%union%assignment_rows.staff_member_id%'
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_private'
      and p.proname='get_sports_house_staff_roster_authorized'
  ),
  'helper preserves effective placement overlap and assigned-staff inclusion'
);

select ok(
  has_function_privilege('authenticated','app_private.get_sports_house_staff_roster_authorized(uuid,integer)','EXECUTE'),
  'authenticated can execute private helper through non-exposed schema'
);

select ok(
  not has_function_privilege('anon','app_private.get_sports_house_staff_roster_authorized(uuid,integer)','EXECUTE'),
  'anon cannot execute private helper'
);

select ok(
  not has_function_privilege('anon','public.get_sports_house_staff_roster(uuid,integer)','EXECUTE'),
  'anon cannot execute public staff roster RPC'
);

select ok(
  (
    select count(*)::integer
    from information_schema.routine_privileges
    where routine_schema in ('public','app_private')
      and routine_name in ('get_sports_house_staff_roster','get_sports_house_staff_roster_authorized')
      and grantee='PUBLIC'
      and privilege_type='EXECUTE'
  ) = 0,
  'PUBLIC has no execute grant on either staff roster function'
);

select * from finish();
rollback;