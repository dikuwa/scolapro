begin;

select plan(12);

select is(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='app_private'
      and p.proname='get_sports_house_staff_roster_authorized'
  ),
  true,
  'private staff roster helper remains SECURITY DEFINER'
);

select is(
  (
    select array_to_string(p.proconfig, ',')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='app_private'
      and p.proname='get_sports_house_staff_roster_authorized'
  ),
  'search_path=""',
  'private staff roster helper keeps empty search_path'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%viewer_platform_admin := coalesce(%'
      and pg_get_functiondef(p.oid) like '%app_private.has_platform_role(array[''platform_admin'']::text[])%'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='app_private'
      and p.proname='get_sports_house_staff_roster_authorized'
  ),
  'platform-admin identity visibility is evaluated once'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%own_staff.user_id = viewer_id%'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='app_private'
      and p.proname='get_sports_house_staff_roster_authorized'
  ),
  'caller-owned staff identity remains visible'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%target_schools as materialized%'
      and pg_get_functiondef(p.oid) like '%public.staff_school_assignments%'
      and pg_get_functiondef(p.oid) like '%public.school_memberships%'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='app_private'
      and p.proname='get_sports_house_staff_roster_authorized'
  ),
  'target schools preserve assignment plus membership discovery'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%accessible_schools as materialized%'
      and pg_get_functiondef(p.oid) like '%app_private.can_access_current_school_staff_directory(ts.school_id)%'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='app_private'
      and p.proname='get_sports_house_staff_roster_authorized'
  ),
  'directory access is evaluated once per distinct target school'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%app_private.staff_member_covers_school_period(%'
      and pg_get_functiondef(p.oid) like '%pg_catalog.current_date%'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='app_private'
      and p.proname='get_sports_house_staff_roster_authorized'
  ),
  'current school-period staff coverage remains authoritative'
);

select ok(
  (
    select pg_get_functiondef(p.oid) not like '%app_private.can_read_staff_identity(sm.id)%'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='app_private'
      and p.proname='get_sports_house_staff_roster_authorized'
  ),
  'staff roster no longer invokes can_read_staff_identity once per row'
);

select ok(
  has_function_privilege('authenticated','app_private.get_sports_house_staff_roster_authorized(uuid,integer)','EXECUTE'),
  'authenticated retains private helper execute'
);

select ok(
  not has_function_privilege('anon','app_private.get_sports_house_staff_roster_authorized(uuid,integer)','EXECUTE'),
  'anon cannot execute private helper'
);

select is(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_sports_house_staff_roster'
  ),
  false,
  'public staff roster wrapper remains SECURITY INVOKER'
);

select ok(
  (
    select count(*)::integer
    from information_schema.routine_privileges
    where routine_schema='app_private'
      and routine_name='get_sports_house_staff_roster_authorized'
      and grantee='PUBLIC'
      and privilege_type='EXECUTE'
  ) = 0,
  'PUBLIC has no execute grant on private helper'
);

select * from finish();
rollback;