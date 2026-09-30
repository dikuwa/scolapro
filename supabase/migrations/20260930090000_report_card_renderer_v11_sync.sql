-- Synchronize the governed report-card queues with the V11 application worker.
-- Renderer revisions identify derived artifacts only. Existing V9 jobs and
-- documents retain their recorded provenance and are not rewritten.

create or replace function app_private.current_report_card_renderer_version()
returns text
language sql
immutable
security definer
set search_path=pg_catalog
as $$
  select 'SCOLAPRO_TERM_REPORT_RENDERER_V11'::text;
$$;

revoke all on function app_private.current_report_card_renderer_version()
from public, anon, authenticated;
grant execute on function app_private.current_report_card_renderer_version()
to service_role;

alter table public.report_card_render_jobs
  alter column renderer_version set default 'SCOLAPRO_TERM_REPORT_RENDERER_V11';

alter table public.report_card_documents
  alter column renderer_version set default 'SCOLAPRO_TERM_REPORT_RENDERER_V11';

comment on function app_private.current_report_card_renderer_version() is
  'Current derived report-card renderer revision. V11 uses the universal official-document header for certified report-card HTML and PDF artifacts.';
