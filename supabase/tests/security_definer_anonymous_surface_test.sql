begin;

select plan(4);

select is(
  (
    select count(*)::integer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  2,
  'only the two token-scoped public functions are executable by anon'
);

select is(
  (
    select count(*)::integer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  2,
  'both anonymous public functions are SECURITY DEFINER'
);

select is(
  (
    select array_agg(p.proname order by p.proname)::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  '{get_school_invitation_preview,resolve_official_document_verification}',
  'anonymous function surface is limited to possession-based token previews'
);

select is(
  (
    select array_agg(pg_get_function_identity_arguments(p.oid) order by p.proname)::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  '{"p_token text","p_token text"}',
  'both anonymous preview functions expose only the expected token signature'
);

select * from finish();
rollback;
