begin;

select plan(8);

select has_column(
  'public',
  'user_profiles',
  'password_rotation_expires_at',
  'managed temporary credential expiry is stored on the security profile'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conname='user_profiles_password_rotation_expiry_state_check'
      and conrelid='public.user_profiles'::regclass
  ),
  'temporary credential expiry requires a non-cleared rotation state'
);

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
  ilike '%old.must_change_password is distinct from false%',
  'null and true uncleared rotation flags cannot be cleared by a client'
);

select ok(
  (select pg_get_functiondef(p.oid) from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'prevent_untrusted_password_rotation_clearance')
  ilike '%password_rotation_expires_at is distinct from old.password_rotation_expires_at%',
  'authenticated clients cannot move or remove managed credential expiry'
);

select * from finish();
rollback;
