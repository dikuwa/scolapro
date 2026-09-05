-- Keep the database render queue contract synchronized with the application renderer.
--
-- The renderer revision is deliberately separate from the immutable report-card
-- snapshot/template version. V3/V4 changed only derived document rendering, so old
-- artifacts remain durable history while newly queued work must use V4.

create or replace function app_private.current_report_card_renderer_version()
returns text
language sql
immutable
security definer
set search_path=pg_catalog
as $$
  select 'SCOLAPRO_TERM_REPORT_RENDERER_V4'::text;
$$;

revoke all on function app_private.current_report_card_renderer_version()
from public, anon, authenticated;
grant execute on function app_private.current_report_card_renderer_version()
to service_role;

-- Defaults are a defence-in-depth fallback. Governed queue/complete RPCs still write
-- renderer_version explicitly from app_private.current_report_card_renderer_version().
alter table public.report_card_render_jobs
  alter column renderer_version set default 'SCOLAPRO_TERM_REPORT_RENDERER_V4';

alter table public.report_card_documents
  alter column renderer_version set default 'SCOLAPRO_TERM_REPORT_RENDERER_V4';

comment on function app_private.current_report_card_renderer_version() is
  'Current derived report-card renderer revision. Must stay synchronized with the application REPORT_CARD_RENDERER_VERSION; snapshot template versions are independent.';
