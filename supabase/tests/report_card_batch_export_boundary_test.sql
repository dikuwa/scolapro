begin;

select plan(6);

select ok(
  not has_function_privilege('authenticated','public.claim_report_card_batch_exports(integer)','EXECUTE'),
  'authenticated clients cannot claim combined PDF exports'
);
select ok(
  has_function_privilege('service_role','public.claim_report_card_batch_exports(integer)','EXECUTE'),
  'service role can claim combined PDF exports'
);
select ok(
  not has_function_privilege('authenticated','public.complete_report_card_batch_export(uuid,text,text,text,integer)','EXECUTE'),
  'authenticated clients cannot forge completed combined PDF exports'
);
select ok(
  not has_function_privilege('authenticated','public.fail_report_card_batch_export(uuid,text)','EXECUTE'),
  'authenticated clients cannot rewrite export failure state'
);
select ok(
  has_function_privilege('authenticated','public.retry_report_card_batch_export(uuid)','EXECUTE'),
  'authenticated management can reach the self-authorizing export retry RPC'
);
select ok(
  not has_table_privilege('authenticated','public.report_card_batches','UPDATE'),
  'combined export metadata remains read-only to authenticated clients'
);

select * from finish();
rollback;
