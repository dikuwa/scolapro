begin;

select plan(4);

select ok(
  (
    select pg_get_functiondef(p.oid) not like '%pg_catalog.current_date%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_private'
      and p.proname='get_sports_house_staff_roster_authorized'
  ),
  'staff roster helper never schema-qualifies CURRENT_DATE'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%current_date%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_private'
      and p.proname='get_sports_house_staff_roster_authorized'
  ),
  'staff roster helper retains current-date period checks'
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

select is(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_private'
      and p.proname='get_sports_house_staff_roster_authorized'
  ),
  true,
  'private staff roster helper remains SECURITY DEFINER'
);

select * from finish();
rollback;