begin;

select plan(1);

select is(
  has_function_privilege('anon','app_private.can_read_communication_policy(uuid)','EXECUTE'),
  false,
  'communication ledger policy predicate is never an anonymous capability'
);

select * from finish();
rollback;
