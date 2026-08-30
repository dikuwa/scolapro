begin;

select plan(1);

select ok(
  has_function_privilege('authenticated','app_private.can_read_communication_policy(uuid)','EXECUTE'),
  'authenticated RLS execution retains access to the narrow communication policy wrapper'
);

select * from finish();
rollback;
