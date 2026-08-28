-- Provider-neutral report-card rendering outbox.
-- Historical report-card snapshots remain canonical. Renderer workers only turn a
-- certified/published snapshot into a durable artifact and register its metadata.

create table public.report_card_render_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  snapshot_id uuid not null references public.report_card_snapshots(id) on delete restrict,
  template_key text not null,
  template_version text not null,
  document_format text not null default 'pdf' check (document_format in ('pdf','html')),
  status text not null default 'pending' check (status in ('pending','processing','retry','completed','dead','cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  last_attempt_at timestamptz,
  completed_at timestamptz,
  output_document_id uuid references public.report_card_documents(id) on delete restrict,
  last_error text,
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(snapshot_id,template_key,template_version,document_format)
);

create index report_card_render_jobs_ready_idx
  on public.report_card_render_jobs(status,available_at,created_at)
  where status in ('pending','retry');
create index report_card_render_jobs_snapshot_idx
  on public.report_card_render_jobs(snapshot_id,status);
create index report_card_render_jobs_school_idx
  on public.report_card_render_jobs(school_id,status,created_at desc);

alter table public.report_card_render_jobs enable row level security;
create policy "authorized staff read report card render jobs"
on public.report_card_render_jobs for select to authenticated
using (
  app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal','hod'])
  or app_private.has_platform_role(array['platform_admin'])
);

revoke all on public.report_card_render_jobs from anon,authenticated;
grant select on public.report_card_render_jobs to authenticated;
grant select,insert,update,delete on public.report_card_render_jobs to service_role;

create or replace function public.queue_report_card_render(
  p_snapshot_id uuid,
  p_template_key text,
  p_template_version text,
  p_document_format text default 'pdf'
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_snapshot public.report_card_snapshots%rowtype;
  v_job_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_snapshot from public.report_card_snapshots where id=p_snapshot_id;
  if not found then raise exception 'Report-card snapshot not found'; end if;
  if not (
    app_private.has_school_role(v_snapshot.school_id,array['school_admin','principal','deputy_principal'])
    or app_private.has_platform_role(array['platform_admin'])
  ) then raise exception 'Permission denied'; end if;
  if v_snapshot.status not in ('certified','published','superseded') then
    raise exception 'Only certified historical snapshots can be rendered';
  end if;
  if btrim(coalesce(p_template_key,''))='' or btrim(coalesce(p_template_version,''))='' then
    raise exception 'Template identity is required';
  end if;
  if coalesce(nullif(btrim(p_document_format),''),'pdf') not in ('pdf','html') then
    raise exception 'Unsupported report-card document format';
  end if;

  insert into public.report_card_render_jobs(
    tenant_id,school_id,snapshot_id,template_key,template_version,document_format,requested_by_user_id
  ) values(
    v_snapshot.tenant_id,v_snapshot.school_id,v_snapshot.id,btrim(p_template_key),btrim(p_template_version),
    coalesce(nullif(btrim(p_document_format),''),'pdf'),auth.uid()
  )
  on conflict(snapshot_id,template_key,template_version,document_format)
  do update set
    status=case when report_card_render_jobs.status in ('dead','cancelled') then 'pending' else report_card_render_jobs.status end,
    available_at=case when report_card_render_jobs.status in ('dead','cancelled') then now() else report_card_render_jobs.available_at end,
    last_error=case when report_card_render_jobs.status in ('dead','cancelled') then null else report_card_render_jobs.last_error end,
    updated_at=now()
  returning id into v_job_id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_snapshot.tenant_id,v_snapshot.school_id,auth.uid(),'report_card.render.queued','report_card_render_job',v_job_id,
    jsonb_build_object('snapshot_id',v_snapshot.id,'template_key',p_template_key,'template_version',p_template_version,'format',p_document_format));
  return v_job_id;
end;
$$;

create or replace function public.claim_report_card_render_jobs(p_limit integer default 10)
returns setof public.report_card_render_jobs
language plpgsql
security definer
set search_path=public
as $$
begin
  return query
  with candidates as (
    select id
    from public.report_card_render_jobs
    where status in ('pending','retry') and available_at<=now()
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

create or replace function public.complete_report_card_render_job(
  p_job_id uuid,
  p_storage_bucket text,
  p_storage_path text,
  p_content_sha256 text default null,
  p_page_count integer default null
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_job public.report_card_render_jobs%rowtype;
  v_snapshot public.report_card_snapshots%rowtype;
  v_document_id uuid;
begin
  select * into v_job from public.report_card_render_jobs where id=p_job_id for update;
  if not found then raise exception 'Render job not found'; end if;
  if v_job.status<>'processing' then raise exception 'Render job is not processing'; end if;
  select * into v_snapshot from public.report_card_snapshots where id=v_job.snapshot_id;
  if not found then raise exception 'Report-card snapshot not found'; end if;
  if v_snapshot.status not in ('certified','published','superseded') then
    raise exception 'Snapshot is no longer eligible for rendering';
  end if;
  if btrim(coalesce(p_storage_bucket,''))='' or btrim(coalesce(p_storage_path,''))='' then
    raise exception 'Document storage location is required';
  end if;

  insert into public.report_card_documents(
    tenant_id,school_id,snapshot_id,template_key,template_version,document_format,
    storage_bucket,storage_path,content_sha256,page_count,generated_by_user_id,status
  ) values(
    v_job.tenant_id,v_job.school_id,v_job.snapshot_id,v_job.template_key,v_job.template_version,v_job.document_format,
    btrim(p_storage_bucket),btrim(p_storage_path),nullif(lower(btrim(coalesce(p_content_sha256,''))),''),p_page_count,
    v_job.requested_by_user_id,'ready'
  ) returning id into v_document_id;

  update public.report_card_render_jobs
  set status='completed',completed_at=now(),locked_at=null,last_error=null,output_document_id=v_document_id,updated_at=now()
  where id=v_job.id;

  return v_document_id;
end;
$$;

create or replace function public.fail_report_card_render_job(
  p_job_id uuid,
  p_error text,
  p_retry_after_seconds integer default 300,
  p_max_attempts integer default 5
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_job public.report_card_render_jobs%rowtype;
  v_dead boolean;
begin
  select * into v_job from public.report_card_render_jobs where id=p_job_id for update;
  if not found then raise exception 'Render job not found'; end if;
  if v_job.status<>'processing' then raise exception 'Render job is not processing'; end if;
  v_dead:=v_job.attempt_count>=greatest(1,coalesce(p_max_attempts,5));
  update public.report_card_render_jobs
  set status=case when v_dead then 'dead' else 'retry' end,
      available_at=case when v_dead then available_at else now()+make_interval(secs=>greatest(30,coalesce(p_retry_after_seconds,300))) end,
      locked_at=null,last_error=left(coalesce(p_error,'Report rendering failed'),2000),updated_at=now()
  where id=v_job.id;
  return true;
end;
$$;

revoke all on function public.queue_report_card_render(uuid,text,text,text) from public,anon;
grant execute on function public.queue_report_card_render(uuid,text,text,text) to authenticated;
revoke all on function public.claim_report_card_render_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_report_card_render_jobs(integer) to service_role;
revoke all on function public.complete_report_card_render_job(uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.complete_report_card_render_job(uuid,text,text,text,integer) to service_role;
revoke all on function public.fail_report_card_render_job(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.fail_report_card_render_job(uuid,text,integer,integer) to service_role;

comment on table public.report_card_render_jobs is
'Provider-neutral render outbox for immutable report-card snapshots. Renderer implementation and storage credentials live outside canonical academic records.';
