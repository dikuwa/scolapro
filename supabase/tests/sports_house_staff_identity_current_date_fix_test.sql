begin;

select plan(5);

select ok(
  to_regprocedure('app_private.get_sports_house_staff_roster_authorized(uuid,integer)') is not null,
  'staff roster authorized helper exists'
);

select ok(
  (
    select pg_get_functiondef(p.oid) not like '%pg_catalog.current_date%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_private'
      and p.proname='get_sports_house_staff_roster_authorized'
  ),
  'staff roster helper does not schema-qualify CURRENT_DATE'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%current_date%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_private'
      and p.proname='get_sports_house_staff_roster_authorized'
  ),
  'staff roster helper retains current-date period coverage'
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
  has_function_privilege(
    'authenticated',
    'public.get_sports_house_staff_roster(uuid,integer)',
    'EXECUTE'
  ),
  'authenticated retains staff roster RPC execute'
);

select * from finish();
rollback;