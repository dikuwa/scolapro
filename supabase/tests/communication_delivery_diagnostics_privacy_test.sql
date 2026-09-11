begin;

select plan(10);

select ok(
  to_regprocedure('public.list_communication_delivery_diagnostics(uuid,integer)') is not null,
  'sanitized communication delivery diagnostics function exists'
);

select ok(
  has_function_privilege('authenticated','public.list_communication_delivery_diagnostics(uuid,integer)','EXECUTE'),
  'authenticated communication leaders can call sanitized delivery diagnostics'
);

select ok(
  not has_function_privilege('anon','public.list_communication_delivery_diagnostics(uuid,integer)','EXECUTE'),
  'anonymous users cannot call delivery diagnostics'
);

select ok(
  not has_table_privilege('authenticated','public.communication_delivery_jobs','SELECT'),
  'authenticated users cannot directly read raw delivery jobs'
);

select ok(
  not has_table_privilege('authenticated','public.communication_delivery_attempts','SELECT'),
  'authenticated users cannot directly read raw delivery attempts'
);

select ok(
  has_table_privilege('service_role','public.communication_delivery_jobs','SELECT'),
  'service role retains raw delivery job access for workers'
);

select ok(
  has_table_privilege('service_role','public.communication_delivery_attempts','SELECT'),
  'service role retains raw delivery attempt access for workers'
);

select ok(
  position('last_error' in pg_get_function_result(to_regprocedure('public.list_communication_delivery_diagnostics(uuid,integer)'))) = 0,
  'sanitized diagnostics do not expose raw job errors'
);

select ok(
  position('error_detail' in pg_get_function_result(to_regprocedure('public.list_communication_delivery_diagnostics(uuid,integer)'))) = 0,
  'sanitized diagnostics do not expose raw attempt error detail'
);

select ok(
  position('provider_metadata' in pg_get_function_result(to_regprocedure('public.list_communication_delivery_diagnostics(uuid,integer)'))) = 0
  and position('provider_message_id' in pg_get_function_result(to_regprocedure('public.list_communication_delivery_diagnostics(uuid,integer)'))) = 0,
  'sanitized diagnostics do not expose raw provider metadata or message identifiers'
);

select * from finish();
rollback;
