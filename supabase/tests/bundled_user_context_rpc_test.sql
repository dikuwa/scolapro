begin;

select plan(13);

select has_function(
  'public',
  'get_my_user_context',
  array['date'],
  'bundled user context RPC exists'
);

select is(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_my_user_context'
      and pg_get_function_identity_arguments(p.oid) = 'p_as_of date'
  ),
  true,
  'bundled user context RPC is SECURITY DEFINER'
);

select is(
  (
    select array_to_string(p.proconfig, ',')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_my_user_context'
      and pg_get_function_identity_arguments(p.oid) = 'p_as_of date'
  ),
  'search_path=pg_catalog, public, auth',
  'bundled user context RPC pins search_path'
);

select ok(
  not has_function_privilege('anon', 'public.get_my_user_context(date)', 'EXECUTE'),
  'anon cannot execute bundled user context RPC'
);

select ok(
  has_function_privilege('authenticated', 'public.get_my_user_context(date)', 'EXECUTE'),
  'authenticated can execute bundled user context RPC'
);

select ok(
  not has_function_privilege('public', 'public.get_my_user_context(date)', 'EXECUTE'),
  'PUBLIC cannot execute bundled user context RPC'
);

select ok(
  (
    select position('auth.uid()' in pg_get_functiondef(p.oid)) > 0
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_my_user_context'
      and pg_get_function_identity_arguments(p.oid) = 'p_as_of date'
  ),
  'RPC derives caller identity from auth.uid()'
);

select ok(
  (
    select position('p_user' in pg_get_function_identity_arguments(p.oid)) = 0
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_my_user_context'
      and pg_get_function_identity_arguments(p.oid) = 'p_as_of date'
  ),
  'RPC has no arbitrary user-id argument'
);

select ok(
  (
    select position('sm.active_from <= p_as_of' in pg_get_functiondef(p.oid)) > 0
       and position('sm.active_to >= p_as_of' in pg_get_functiondef(p.oid)) > 0
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_my_user_context'
      and pg_get_function_identity_arguments(p.oid) = 'p_as_of date'
  ),
  'school membership active-date boundary uses supplied as-of date'
);

select ok(
  (
    select position('pm.active_from <= p_as_of' in pg_get_functiondef(p.oid)) > 0
       and position('pm.active_to >= p_as_of' in pg_get_functiondef(p.oid)) > 0
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_my_user_context'
      and pg_get_function_identity_arguments(p.oid) = 'p_as_of date'
  ),
  'platform membership active-date boundary uses supplied as-of date'
);

select ok(
  (
    select position('nm.active_from <= p_as_of' in pg_get_functiondef(p.oid)) > 0
       and position('nm.active_to >= p_as_of' in pg_get_functiondef(p.oid)) > 0
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_my_user_context'
      and pg_get_function_identity_arguments(p.oid) = 'p_as_of date'
  ),
  'network membership active-date boundary uses supplied as-of date'
);

select ok(
  (
    select position('order by sm.active_from desc, sm.id' in lower(pg_get_functiondef(p.oid))) > 0
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_my_user_context'
      and pg_get_function_identity_arguments(p.oid) = 'p_as_of date'
  ),
  'school membership ordering remains deterministic'
);

select ok(
  (
    select position('guardian_user_links' in pg_get_functiondef(p.oid)) > 0
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_my_user_context'
      and pg_get_function_identity_arguments(p.oid) = 'p_as_of date'
  ),
  'guardian links are bundled into the same RPC'
);

select * from finish();

rollback;
