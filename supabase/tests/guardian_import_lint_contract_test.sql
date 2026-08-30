begin;

select plan(2);

select is(
  current_setting('plpgsql.variable_conflict', true),
  null,
  'database session does not globally weaken PL/pgSQL variable conflict handling'
);

select ok(
  exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    cross join lateral unnest(coalesce(p.proconfig,array[]::text[])) cfg(value)
    where n.nspname='public'
      and p.proname='commit_guardian_import_batch'
      and pg_get_function_identity_arguments(p.oid)='p_batch_id uuid'
      and cfg.value='plpgsql.variable_conflict=use_variable'
  ),
  'guardian import commit pins variable precedence locally instead of changing the database-wide setting'
);

select * from finish();
rollback;
