begin;

select plan(4);

select ok(
  to_regprocedure('app_private.can_read_communication_policy(uuid)') is not null,
  'communication read policy wrapper exists'
);

select is(
  has_function_privilege('authenticated','app_private.can_read_communication_policy(uuid)','EXECUTE'),
  true,
  'authenticated RLS execution may call the narrow communication read predicate'
);

select is(
  has_function_privilege('authenticated','app_private.can_read_communication(uuid)','EXECUTE'),
  false,
  'the deeper communication authorization helper remains non-client-executable'
);

select is(
  has_function_privilege('anon','app_private.can_read_communication_policy(uuid)','EXECUTE'),
  false,
  'anonymous users cannot execute the communication read policy predicate'
);

select * from finish();
rollback;
