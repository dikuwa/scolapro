begin;

select plan(4);

select ok(
  not exists(
    select 1
    from information_schema.role_table_grants
    where table_schema='public'
      and grantee='anon'
  ),
  'anonymous role has no direct public table or view privileges'
);

select ok(
  not exists(
    select 1
    from information_schema.role_usage_grants
    where object_schema='public'
      and grantee='anon'
      and object_type='SEQUENCE'
  ),
  'anonymous role has no direct public sequence privileges'
);

select ok(
  not exists(
    select 1
    from pg_policies
    where 'anon'=any(roles) or 'public'=any(roles)
  ),
  'no anonymous RLS policy depends on raw relation access'
);

select ok(
  has_function_privilege('anon','public.get_school_invitation_preview(text)','EXECUTE'),
  'token-scoped invitation preview remains the intentional anonymous entry point'
);

select * from finish();
rollback;
