begin;

select plan(6);

select ok(
  to_regprocedure('app_private.get_sports_house_staff_roster_authorized(uuid,integer)') is not null,
  'staff roster authorized helper exists'
);

select ok(
  (
    select pg_get_functiondef(p.oid) like '%select fast_visible.staff_member_id%'
      and pg_get_functiondef(p.oid) like '%from fast_visible_identity_ids fast_visible%'
      and pg_get_functiondef(p.oid) like '%select fallback_visible.staff_member_id%'
      and pg_get_functiondef(p.oid) like '%from fallback_visible_identity_ids fallback_visible%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_private'
      and p.proname='get_sports_house_staff_roster_authorized'
  ),
  'visible identity union columns are alias-qualified'
);

select ok(
  (
    select pg_get_functiondef(p.oid) not like '%select staff_member_id from fast_visible_identity_ids%'
      and pg_get_functiondef(p.oid) not like '%select staff_member_id from fallback_visible_identity_ids%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_private'
      and p.proname='get_sports_house_staff_roster_authorized'
  ),
  'unqualified PL/pgSQL output-column union references are absent'
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

select ok(
  not has_function_privilege(
    'anon',
    'public.get_sports_house_staff_roster(uuid,integer)',
    'EXECUTE'
  ),
  'anon remains denied'
);

select * from finish();
rollback;