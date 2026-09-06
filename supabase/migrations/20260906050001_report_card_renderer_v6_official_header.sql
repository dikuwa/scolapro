-- Synchronize the database render queue with report-card renderer V6.
-- V6 routes official school identity/header presentation through the shared
-- document contract so derived HTML/PDF artifacts cannot silently drift in
-- school identity/contact semantics while immutable snapshots stay unchanged.

create or replace function app_private.current_report_card_renderer_version()
returns text
language sql
immutable
security definer
set search_path=pg_catalog
as $$
  select 'SCOLAPRO_TERM_REPORT_RENDERER_V6'::text;
$$;

revoke all on function app_private.current_report_card_renderer_version()
from public, anon, authenticated;
grant execute on function app_private.current_report_card_renderer_version()
to service_role;

alter table public.report_card_render_jobs
  alter column renderer_version set default 'SCOLAPRO_TERM_REPORT_RENDERER_V6';

alter table public.report_card_documents
  alter column renderer_version set default 'SCOLAPRO_TERM_REPORT_RENDERER_V6';

comment on function app_private.current_report_card_renderer_version() is
  'Current derived report-card renderer revision. V6 routes frozen school identity/header presentation through the shared official-document contract.';
