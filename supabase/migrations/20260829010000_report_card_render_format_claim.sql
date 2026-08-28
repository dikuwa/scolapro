-- Workers can claim only the document formats they actually support. This prevents an
-- HTML renderer from taking PDF work and vice versa while preserving SKIP LOCKED safety.

create or replace function public.claim_report_card_render_jobs(
  p_limit integer default 10,
  p_document_format text default null
)
returns setof public.report_card_render_jobs
language plpgsql
security definer
set search_path=public
as $$
begin
  if p_document_format is not null and p_document_format not in ('pdf','html') then
    raise exception 'Unsupported report-card document format';
  end if;

  return query
  with candidates as (
    select id
    from public.report_card_render_jobs
    where status in ('pending','retry')
      and available_at<=now()
      and (p_document_format is null or document_format=p_document_format)
    order by available_at,created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,10),50))
  ), claimed as (
    update public.report_card_render_jobs j
    set status='processing',attempt_count=attempt_count+1,locked_at=now(),last_attempt_at=now(),updated_at=now()
    from candidates c where j.id=c.id
    returning j.*
  )
  select * from claimed;
end;
$$;

revoke all on function public.claim_report_card_render_jobs(integer,text) from public,anon,authenticated;
grant execute on function public.claim_report_card_render_jobs(integer,text) to service_role;
-- Keep the legacy one-argument signature service-role only for compatibility.
revoke all on function public.claim_report_card_render_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_report_card_render_jobs(integer) to service_role;
