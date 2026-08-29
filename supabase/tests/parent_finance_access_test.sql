begin;

select plan(2);

select ok(
  to_regprocedure('public.get_parent_finance_overview()') is not null,
  'child-scoped parent finance overview function exists'
);

select ok(
  not has_function_privilege('anon','public.get_parent_finance_overview()','EXECUTE'),
  'anonymous users cannot access parent finance overview'
);

select * from finish();
rollback;
