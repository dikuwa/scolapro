-- Synchronize the durable report-card queues with renderer V9 and restore the
-- explicit-retry boundary for failed combined exports.
--
-- A combined PDF is derived from immutable learner snapshots. It may be rebuilt
-- automatically when the previously ready combined artifact belongs to an older
-- renderer revision, but a genuinely failed current export must remain failed
-- until a report manager explicitly retries it. This prevents a broken artifact
-- from being reclaimed in a tight worker loop.

create or replace function app_private.current_report_card_renderer_version()
returns text
language sql
immutable
security definer
set search_path=pg_catalog
as $$
  select 'SCOLAPRO_TERM_REPORT_RENDERER_V9'::text;
$$;

revoke all on function app_private.current_report_card_renderer_version()
from public, anon, authenticated;
grant execute on function app_private.current_report_card_renderer_version()
to service_role;

alter table public.report_card_render_jobs
  alter column renderer_version set default 'SCOLAPRO_TERM_REPORT_RENDERER_V9';

alter table public.report_card_documents
  alter column renderer_version set default 'SCOLAPRO_TERM_REPORT_RENDERER_V9';

-- Only terminal PDF batches can reach this worker. Completed learner items must
-- all have a ready canonical TERM_REPORT PDF from the current renderer.
-- Skipped/failed learner items remain explicit batch outcomes and are intentionally
-- not included in the combined artifact. A stale ready export is automatically
-- rebuilt; an export already marked failed is not claimed until
-- retry_report_card_batch_export() changes it back to waiting.
create or replace function public.claim_report_card_batch_exports(p_limit integer default 1)
returns setof public.report_card_batches
language plpgsql
security definer
set search_path=public,app_private
as $$
begin
  return query
  with candidates as (
    select b.id
    from public.report_card_batches b
    where b.operation='pdf'
      and b.status in ('completed','partial')
      and b.completed_items>0
      and (
        b.export_status='waiting'
        or (
          b.export_status='ready'
          and b.export_renderer_version is distinct from app_private.current_report_card_renderer_version()
        )
      )
      and not exists(
        select 1
        from public.report_card_batch_items i
        where i.batch_id=b.id
          and i.status in ('pending','processing')
      )
      and not exists(
        select 1
        from public.report_card_batch_items i
        where i.batch_id=b.id
          and i.status='completed'
          and (
            i.snapshot_id is null
            or not exists(
              select 1
              from public.report_card_documents d
              where d.snapshot_id=i.snapshot_id
                and d.template_key='TERM_REPORT'
                and d.document_format='pdf'
                and d.status='ready'
                and d.renderer_version=app_private.current_report_card_renderer_version()
            )
          )
      )
    order by b.created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,1),3))
  ), claimed as (
    update public.report_card_batches b
    set export_status='processing',export_error=null,updated_at=now()
    from candidates c
    where b.id=c.id
    returning b.*
  )
  select * from claimed;
end;
$$;

revoke all on function public.claim_report_card_batch_exports(integer)
from public,anon,authenticated;
grant execute on function public.claim_report_card_batch_exports(integer)
to service_role;

comment on function app_private.current_report_card_renderer_version() is
  'Current derived report-card renderer revision. V9 aligns both HTML/print and native PDF output with the approved progress-report layout.';

comment on function public.claim_report_card_batch_exports(integer) is
  'Claims terminal PDF batches only when every completed learner has a current-renderer canonical TERM_REPORT PDF. Stale ready exports rebuild automatically; failed exports require an explicit management retry.';
