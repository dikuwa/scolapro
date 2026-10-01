begin;

select plan(7);

select is(
  (
    select array_to_string(p.proconfig, ',')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private'
      and p.proname = 'valid_three_term_array'
      and pg_get_function_identity_arguments(p.oid) = 'p_terms smallint[]'
  ),
  'search_path=pg_catalog',
  'valid_three_term_array pins search_path to pg_catalog'
);

select ok(
  app_private.valid_three_term_array(array[1,2,3]::smallint[]),
  'valid term arrays remain accepted'
);

select ok(
  not app_private.valid_three_term_array(array[1,4]::smallint[]),
  'out-of-range terms remain rejected'
);

select ok(
  not app_private.valid_three_term_array(array[1,1]::smallint[]),
  'duplicate terms remain rejected'
);

select ok(
  has_function_privilege(
    'anon',
    'public.get_school_invitation_preview(text)',
    'EXECUTE'
  ),
  'anonymous invitation preview remains an intentional public token contract'
);

select ok(
  has_function_privilege(
    'anon',
    'public.resolve_official_document_verification(text)',
    'EXECUTE'
  ),
  'anonymous official-document verification remains an intentional public token contract'
);

select ok(
  (
    select p.prosecdef
      and exists (
        select 1
        from unnest(p.proconfig) config
        where config like 'search_path=%'
      )
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'resolve_official_document_verification'
      and pg_get_function_identity_arguments(p.oid) = 'p_token text'
  ),
  'public document verification remains SECURITY DEFINER with a pinned search path'
);

select * from finish();

rollback;
