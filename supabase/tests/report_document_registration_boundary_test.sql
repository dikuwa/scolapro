begin;

select plan(5);

select ok(
  not has_function_privilege('anon','public.register_report_card_document(uuid,text,text,text,text,text,text,integer)','EXECUTE'),
  'anonymous callers cannot directly register report-card documents'
);

select ok(
  not has_function_privilege('authenticated','public.register_report_card_document(uuid,text,text,text,text,text,text,integer)','EXECUTE'),
  'authenticated callers cannot directly register ready report-card documents'
);

select ok(
  has_function_privilege('service_role','public.register_report_card_document(uuid,text,text,text,text,text,text,integer)','EXECUTE'),
  'service role retains legacy internal registration access'
);

select ok(
  not has_function_privilege('authenticated','public.complete_report_card_render_job(uuid,text,text,text,integer)','EXECUTE'),
  'authenticated callers cannot complete render jobs'
);

select ok(
  has_function_privilege('service_role','public.complete_report_card_render_job(uuid,text,text,text,integer)','EXECUTE'),
  'service role owns render-job completion and canonical ready-document creation'
);

select * from finish();
rollback;
