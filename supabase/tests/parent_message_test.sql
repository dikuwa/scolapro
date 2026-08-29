begin;

select plan(2);

select ok(
  to_regprocedure('public.get_parent_message_overview(integer)') is not null,
  'parent message overview function exists'
);

select ok(
  not has_function_privilege('anon','public.get_parent_message_overview(integer)','EXECUTE'),
  'anonymous users cannot read parent message overview'
);

select * from finish();
rollback;
