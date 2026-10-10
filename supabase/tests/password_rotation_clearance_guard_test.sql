begin;

select plan(5);

select ok(
  exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'user_profiles'
      and t.tgname = 'user_profiles_password_rotation_clearance_guard'
      and t.tgenabled = 'O'
      and not t.tgisinternal
  ),
  'user profile password rotation clearance trigger exists and is enabled'
);

select is(
  (select p.prosecdef from pg_proc p
   join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='prevent_untrusted_password_rotation_clearance'),
  false,
  'clearance guard is not security definer'
);

select ok(
  not has_function_privilege('anon', 'public.prevent_untrusted_password_rotation_clearance()', 'EXECUTE'),
  'anonymous role cannot execute clearance guard directly'
);

select ok(
  not has_function_privilege('authenticated', 'public.prevent_untrusted_password_rotation_clearance()', 'EXECUTE'),
  'authenticated role cannot execute clearance guard directly'
);

select ok(
  (select pg_get_functiondef(p.oid) from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'prevent_untrusted_password_rotation_clearance')
  like '%old.must_change_password IS DISTINCT FROM false%'
  or
  (select pg_get_functiondef(p.oid) from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'prevent_untrusted_password_rotation_clearance')
  like '%old.must_change_password is distinct from false%',
  'null and true uncleared rotation flags cannot be cleared by a client'
);

select * from finish();
rollback;
