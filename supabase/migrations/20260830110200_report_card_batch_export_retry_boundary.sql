-- Failed combined exports stay failed until a report manager explicitly retries them.
-- This avoids a broken export being reclaimed in a tight worker loop.

drop index if exists public.report_card_batches_export_worker_idx;
create index report_card_batches_export_worker_idx
  on public.report_card_batches(export_status,created_at)
  where operation='pdf' and export_status='waiting';

create or replace function public.claim_report_card_batch_exports(p_limit integer default 1)
returns setof public.report_card_batches
language plpgsql
security definer
set search_path=public
as $$
begin
  return query
  with candidates as (
    select b.id
    from public.report_card_batches b
    where b.operation='pdf'
      and b.status in ('completed','partial')
      and b.export_status='waiting'
      and b.completed_items>0
      and not exists(
        select 1
        from public.report_card_batch_items i
        where i.batch_id=b.id
          and i.status='completed'
          and (
            i.snapshot_id is null
            or not exists(
              select 1 from public.report_card_documents d
              where d.snapshot_id=i.snapshot_id and d.document_format='pdf' and d.status='ready'
            )
          )
      )
    order by b.created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,1),3))
  ), claimed as (
    update public.report_card_batches b
    set export_status='processing',export_error=null,updated_at=now()
    from candidates c where b.id=c.id
    returning b.*
  )
  select * from claimed;
end;
$$;

revoke all on function public.claim_report_card_batch_exports(integer) from public,anon,authenticated;
grant execute on function public.claim_report_card_batch_exports(integer) to service_role;

comment on function public.claim_report_card_batch_exports(integer) is
'Service-role claim for combined PDF exports. Only explicitly waiting batches are claimed; failed exports require a management retry before re-entering the queue.';
