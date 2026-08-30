-- Rendered report-card artifacts are now created only by the service-role render-job
-- completion path. The older direct registration RPC accepted caller-supplied storage
-- locations and is no longer part of the authenticated application API.

revoke all on function public.register_report_card_document(uuid,text,text,text,text,text,text,integer)
  from public,anon,authenticated;
grant execute on function public.register_report_card_document(uuid,text,text,text,text,text,text,integer)
  to service_role;

comment on function public.register_report_card_document(uuid,text,text,text,text,text,text,integer) is
'Legacy/internal report-document registration helper. Authenticated application users must queue a render job; only the service role may execute direct registration.';
