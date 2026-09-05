-- Separate the immutable report-card snapshot/template contract from the renderer
-- implementation that produces derived PDF/HTML artifacts. Historical artifacts stay
-- durable, but only the current renderer revision qualifies as ready for new workflows.

create or replace function app_private.current_report_card_renderer_version()
returns text
language sql
immutable
security definer
set search_path=pg_catalog
as $$
  select 'SCOLAPRO_TERM_REPORT_RENDERER_V2'::text;
$$;
revoke all on function app_private.current_report_card_renderer_version() from public,anon,authenticated;
grant execute on function app_private.current_report_card_renderer_version() to service_role;

alter table public.report_card_render_jobs
  add column if not exists renderer_version text;
update public.report_card_render_jobs
set renderer_version='SCOLAPRO_TERM_REPORT_RENDERER_LEGACY'
where renderer_version is null;
alter table public.report_card_render_jobs
  alter column renderer_version set not null,
  alter column renderer_version set default 'SCOLAPRO_TERM_REPORT_RENDERER_V2';

alter table public.report_card_documents
  add column if not exists renderer_version text;
update public.report_card_documents
set renderer_version='SCOLAPRO_TERM_REPORT_RENDERER_LEGACY'
where renderer_version is null;
alter table public.report_card_documents
  alter column renderer_version set not null,
  alter column renderer_version set default 'SCOLAPRO_TERM_REPORT_RENDERER_V2';

alter table public.report_card_batches
  add column if not exists export_renderer_version text;
update public.report_card_batches
set export_renderer_version='SCOLAPRO_TERM_REPORT_RENDERER_LEGACY'
where operation='pdf' and export_status='ready' and export_renderer_version is null;

-- Replace the legacy render-job uniqueness boundary so a new renderer revision can
-- coexist with the completed job for the same immutable snapshot/template.
do $$
declare
  v_constraint text;
begin
  select c.conname into v_constraint
  from pg_constraint c
  where c.conrelid='public.report_card_render_jobs'::regclass
    and c.contype='u'
    and (
      select array_agg(a.attname order by x.ord)
      from unnest(c.conkey) with ordinality x(attnum,ord)
      join pg_attribute a on a.attrelid=c.conrelid and a.attnum=x.attnum
    ) = array['snapshot_id','template_key','template_version','document_format']::text[]
  limit 1;

  if v_constraint is not null then
    execute format('alter table public.report_card_render_jobs drop constraint %I',v_constraint);
  end if;
end;
$$;

alter table public.report_card_render_jobs
  drop constraint if exists report_card_render_jobs_snapshot_template_renderer_format_key;
alter table public.report_card_render_jobs
  add constraint report_card_render_jobs_snapshot_template_renderer_format_key
  unique(snapshot_id,template_key,template_version,renderer_version,document_format);

create index if not exists report_card_documents_current_renderer_idx
  on public.report_card_documents(snapshot_id,document_format,status,renderer_version);

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
  v_renderer_version text := app_private.current_report_card_renderer_version();
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
    tenant_id,school_id,snapshot_id,template_key,template_version,renderer_version,document_format,requested_by_user_id
  ) values(
    v_snapshot.tenant_id,v_snapshot.school_id,v_snapshot.id,btrim(p_template_key),btrim(p_template_version),v_renderer_version,
    coalesce(nullif(btrim(p_document_format),''),'pdf'),auth.uid()
  )
  on conflict(snapshot_id,template_key,template_version,renderer_version,document_format)
  do update set
    status=case when report_card_render_jobs.status in ('dead','cancelled') then 'pending' else report_card_render_jobs.status end,
    available_at=case when report_card_render_jobs.status in ('dead','cancelled') then now() else report_card_render_jobs.available_at end,
    last_error=case when report_card_render_jobs.status in ('dead','cancelled') then null else report_card_render_jobs.last_error end,
    updated_at=now()
  returning id into v_job_id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_snapshot.tenant_id,v_snapshot.school_id,auth.uid(),'report_card.render.queued','report_card_render_job',v_job_id,
    jsonb_build_object('snapshot_id',v_snapshot.id,'template_key',p_template_key,'template_version',p_template_version,
      'renderer_version',v_renderer_version,'format',p_document_format));
  return v_job_id;
end;
$$;

create or replace function public.claim_report_card_render_jobs(
  p_limit integer default 10,
  p_document_format text default null
)
returns setof public.report_card_render_jobs
language plpgsql
security definer
set search_path=public,app_private
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
      and renderer_version=app_private.current_report_card_renderer_version()
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
  if v_job.renderer_version<>app_private.current_report_card_renderer_version() then
    raise exception 'Render job does not use the current renderer revision';
  end if;
  select * into v_snapshot from public.report_card_snapshots where id=v_job.snapshot_id;
  if not found then raise exception 'Report-card snapshot not found'; end if;
  if v_snapshot.status not in ('certified','published','superseded') then
    raise exception 'Snapshot is no longer eligible for rendering';
  end if;
  if btrim(coalesce(p_storage_bucket,''))='' or btrim(coalesce(p_storage_path,''))='' then
    raise exception 'Document storage location is required';
  end if;

  insert into public.report_card_documents(
    tenant_id,school_id,snapshot_id,template_key,template_version,renderer_version,document_format,
    storage_bucket,storage_path,content_sha256,page_count,generated_by_user_id,status
  ) values(
    v_job.tenant_id,v_job.school_id,v_job.snapshot_id,v_job.template_key,v_job.template_version,v_job.renderer_version,v_job.document_format,
    btrim(p_storage_bucket),btrim(p_storage_path),nullif(lower(btrim(coalesce(p_content_sha256,''))),''),p_page_count,
    v_job.requested_by_user_id,'ready'
  ) returning id into v_document_id;

  update public.report_card_render_jobs
  set status='completed',completed_at=now(),locked_at=null,last_error=null,output_document_id=v_document_id,updated_at=now()
  where id=v_job.id;

  return v_document_id;
end;
$$;

-- Renderer revision is part of immutable render-job identity.
create or replace function app_private.enforce_report_card_render_job_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_snapshot_tenant uuid;
  v_snapshot_school uuid;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.snapshot_id is distinct from old.snapshot_id
    or new.template_key is distinct from old.template_key
    or new.template_version is distinct from old.template_version
    or new.renderer_version is distinct from old.renderer_version
    or new.document_format is distinct from old.document_format
    or new.requested_by_user_id is distinct from old.requested_by_user_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Report-card render job scope, renderer identity, and request provenance are immutable';
  end if;

  select s.tenant_id,s.school_id into v_snapshot_tenant,v_snapshot_school
  from public.report_card_snapshots s
  where s.id = new.snapshot_id;

  if v_snapshot_tenant is null or (v_snapshot_tenant,v_snapshot_school) is distinct from (new.tenant_id,new.school_id) then
    raise exception 'Report-card render job scope mismatch: snapshot does not match job scope';
  end if;
  return new;
end;
$$;

-- Existing durable documents keep their historical renderer revision. New/current
-- readiness is determined only by the current revision.
create or replace function public.get_report_card_status_for_enrolment(
  p_school_id uuid,
  p_academic_year integer,
  p_term_number integer,
  p_enrolment_id uuid
)
returns table(
  enrolment_id uuid, learner_id uuid, first_names text, surname text, admission_number text,
  grade_id uuid, grade_name text, register_class_id uuid, class_name text,
  snapshot_id uuid, snapshot_version integer, template_version text, report_status text,
  generated_at timestamptz, certified_at timestamptz, pdf_ready boolean
)
language plpgsql
stable
security definer
set search_path=public,app_private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (
    exists(select 1 from public.school_memberships sm where sm.school_id=p_school_id and sm.user_id=auth.uid()
      and sm.active_from<=current_date and (sm.active_to is null or sm.active_to>=current_date))
    or app_private.has_platform_role(array['platform_admin'])
  ) then raise exception 'Permission denied'; end if;
  if p_academic_year<2000 or p_academic_year>2200 then raise exception 'Academic year is invalid'; end if;
  if p_term_number<1 or p_term_number>6 then raise exception 'Term number is invalid'; end if;

  return query
  select e.id,e.learner_id,l.first_names,l.surname,e.admission_number,e.grade_id,
    coalesce(g.display_name,'Unassigned'),e.register_class_id,coalesce(rc.display_name,'Unassigned'),
    rs.id,rs.snapshot_version,rs.template_version,
    case when rs.id is null then 'not_generated' when rs.status='draft' then 'generated'
      when rs.status='published' then 'published' else 'certified' end,
    rs.generated_at,rs.certified_at,
    case when rs.id is null then false else exists(
      select 1 from public.report_card_documents d
      where d.snapshot_id=rs.id and d.school_id=p_school_id and d.document_format='pdf' and d.status='ready'
        and d.renderer_version=app_private.current_report_card_renderer_version()
    ) end
  from public.enrolments e
  join public.learners l on l.id=e.learner_id
  left join public.grades g on g.id=e.grade_id
  left join public.register_classes rc on rc.id=e.register_class_id
  left join lateral (
    select s.id,s.snapshot_version,s.template_version,s.status,s.generated_at,s.certified_at
    from public.report_card_snapshots s
    where s.school_id=p_school_id and s.academic_year=p_academic_year and s.enrolment_id=e.id
      and s.term_number=p_term_number and s.status<>'superseded'
      and app_private.can_read_report_card_snapshot(s.school_id,s.learner_id,s.status)
    order by s.snapshot_version desc limit 1
  ) rs on true
  where e.id=p_enrolment_id and e.school_id=p_school_id and e.academic_year=p_academic_year and e.status='current'
  limit 1;
end;
$$;

create or replace function public.list_report_card_status_page(
  p_school_id uuid,
  p_academic_year integer,
  p_term_number integer,
  p_query text default null,
  p_grade_id uuid default null,
  p_class_id uuid default null,
  p_report_status text default 'all',
  p_page integer default 1,
  p_page_size integer default 50
)
returns table(
  enrolment_id uuid, learner_id uuid, first_names text, surname text, admission_number text,
  grade_id uuid, grade_name text, register_class_id uuid, class_name text,
  snapshot_id uuid, snapshot_version integer, template_version text, report_status text,
  generated_at timestamptz, certified_at timestamptz, pdf_ready boolean, total_count bigint
)
language plpgsql
stable
security definer
set search_path=public,app_private
as $$
declare
  v_page integer := greatest(coalesce(p_page,1),1);
  v_page_size integer := least(greatest(coalesce(p_page_size,50),1),100);
  v_query text := nullif(btrim(coalesce(p_query,'')),'');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (
    exists(select 1 from public.school_memberships sm where sm.school_id=p_school_id and sm.user_id=auth.uid()
      and sm.active_from<=current_date and (sm.active_to is null or sm.active_to>=current_date))
    or app_private.has_platform_role(array['platform_admin'])
  ) then raise exception 'Permission denied'; end if;
  if p_academic_year<2000 or p_academic_year>2200 then raise exception 'Academic year is invalid'; end if;
  if p_term_number<1 or p_term_number>6 then raise exception 'Term number is invalid'; end if;
  if coalesce(p_report_status,'all') not in ('all','not_generated','generated','certified','published') then
    raise exception 'Unsupported report-card status filter';
  end if;

  return query
  with visible as (
    select e.id enrolment_id,e.learner_id,l.first_names,l.surname,e.admission_number,e.grade_id,
      coalesce(g.display_name,'Unassigned') grade_name,e.register_class_id,coalesce(rc.display_name,'Unassigned') class_name,
      rs.id snapshot_id,rs.snapshot_version,rs.template_version,
      case when rs.id is null then 'not_generated' when rs.status='draft' then 'generated'
        when rs.status='published' then 'published' else 'certified' end report_status,
      rs.generated_at,rs.certified_at,
      case when rs.id is null then false else exists(
        select 1 from public.report_card_documents d
        where d.snapshot_id=rs.id and d.school_id=p_school_id and d.document_format='pdf' and d.status='ready'
          and d.renderer_version=app_private.current_report_card_renderer_version()
      ) end pdf_ready
    from public.enrolments e
    join public.learners l on l.id=e.learner_id
    left join public.grades g on g.id=e.grade_id
    left join public.register_classes rc on rc.id=e.register_class_id
    left join lateral (
      select s.id,s.snapshot_version,s.template_version,s.status,s.generated_at,s.certified_at
      from public.report_card_snapshots s
      where s.school_id=p_school_id and s.academic_year=p_academic_year and s.enrolment_id=e.id
        and s.term_number=p_term_number and s.status<>'superseded'
        and app_private.can_read_report_card_snapshot(s.school_id,s.learner_id,s.status)
      order by s.snapshot_version desc limit 1
    ) rs on true
    where e.school_id=p_school_id and e.academic_year=p_academic_year and e.status='current'
      and (p_grade_id is null or e.grade_id=p_grade_id)
      and (p_class_id is null or e.register_class_id=p_class_id)
      and (v_query is null or concat_ws(' ',l.first_names,l.surname,e.admission_number,g.display_name,rc.display_name) ilike '%'||v_query||'%')
  ), filtered as (
    select * from visible v where coalesce(p_report_status,'all')='all' or v.report_status=p_report_status
  )
  select f.enrolment_id,f.learner_id,f.first_names,f.surname,f.admission_number,f.grade_id,f.grade_name,
    f.register_class_id,f.class_name,f.snapshot_id,f.snapshot_version,f.template_version,f.report_status,
    f.generated_at,f.certified_at,f.pdf_ready,count(*) over()
  from filtered f
  order by lower(f.surname),lower(f.first_names),f.enrolment_id
  limit v_page_size offset (v_page-1)*v_page_size;
end;
$$;

-- PDF batch items only accept the current renderer revision; legacy ready documents
-- therefore queue a fresh render without mutating the certified snapshot.
create or replace function public.process_report_card_batch_items(p_limit integer default 25)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_item record;
  v_batch public.report_card_batches%rowtype;
  v_snapshot public.report_card_snapshots%rowtype;
  v_original_sub text := current_setting('request.jwt.claim.sub',true);
  v_original_role text := current_setting('request.jwt.claim.role',true);
  v_processed integer := 0; v_completed integer := 0; v_skipped integer := 0; v_failed integer := 0;
  v_message text; v_job_id uuid;
begin
  for v_item in
    select i.id,i.batch_id,i.enrolment_id,i.learner_id
    from public.report_card_batch_items i join public.report_card_batches b on b.id=i.batch_id
    where i.status='pending' and b.status<>'cancelled'
    order by b.created_at,i.created_at for update of i skip locked
    limit greatest(1,least(coalesce(p_limit,25),100))
  loop
    select * into v_batch from public.report_card_batches where id=v_item.batch_id;
    update public.report_card_batch_items set status='processing',started_at=coalesce(started_at,now()),updated_at=now() where id=v_item.id;
    v_processed:=v_processed+1;
    begin
      perform set_config('request.jwt.claim.sub',v_batch.created_by_user_id::text,true);
      perform set_config('request.jwt.claim.role','authenticated',true);

      select * into v_snapshot from public.report_card_snapshots
      where enrolment_id=v_item.enrolment_id and term_number=v_batch.term_number and status<>'superseded'
      order by snapshot_version desc limit 1;

      if v_batch.operation='generate' then
        if found then
          update public.report_card_batch_items set status='completed',snapshot_id=v_snapshot.id,result_code='already_generated',
            message='A current report-card snapshot already exists for this learner and term.',completed_at=now(),updated_at=now() where id=v_item.id;
        else
          v_snapshot.id:=public.build_report_card_snapshot(v_item.enrolment_id,v_batch.term_number,'SCOLAPRO_TERM_REPORT_V1');
          update public.report_card_batch_items set status='completed',snapshot_id=v_snapshot.id,result_code='generated',
            message='Report-card snapshot generated.',completed_at=now(),updated_at=now() where id=v_item.id;
        end if;
        v_completed:=v_completed+1;
      elsif v_batch.operation='certify' then
        if not found then
          update public.report_card_batch_items set status='skipped',result_code='not_generated',message='No current snapshot exists for this learner and term.',completed_at=now(),updated_at=now() where id=v_item.id; v_skipped:=v_skipped+1;
        elsif v_snapshot.status='draft' then
          perform public.certify_report_card_snapshot(v_snapshot.id);
          update public.report_card_batch_items set status='completed',snapshot_id=v_snapshot.id,result_code='certified',message='Snapshot certified.',completed_at=now(),updated_at=now() where id=v_item.id; v_completed:=v_completed+1;
        elsif v_snapshot.status in ('certified','published') then
          update public.report_card_batch_items set status='completed',snapshot_id=v_snapshot.id,result_code='already_certified',message='Snapshot was already certified.',completed_at=now(),updated_at=now() where id=v_item.id; v_completed:=v_completed+1;
        else
          update public.report_card_batch_items set status='skipped',snapshot_id=v_snapshot.id,result_code='not_certifiable',message='The current snapshot is not eligible for certification.',completed_at=now(),updated_at=now() where id=v_item.id; v_skipped:=v_skipped+1;
        end if;
      elsif v_batch.operation='publish' then
        if not found then
          update public.report_card_batch_items set status='skipped',result_code='not_generated',message='No current snapshot exists for this learner and term.',completed_at=now(),updated_at=now() where id=v_item.id; v_skipped:=v_skipped+1;
        elsif v_snapshot.status='published' then
          update public.report_card_batch_items set status='completed',snapshot_id=v_snapshot.id,result_code='already_published',message='Snapshot was already published.',completed_at=now(),updated_at=now() where id=v_item.id; v_completed:=v_completed+1;
        elsif v_snapshot.status='certified' then
          perform public.publish_report_card_snapshot(v_snapshot.id);
          update public.report_card_batch_items set status='completed',snapshot_id=v_snapshot.id,result_code='published',message='Snapshot published to linked guardians.',completed_at=now(),updated_at=now() where id=v_item.id; v_completed:=v_completed+1;
        else
          update public.report_card_batch_items set status='skipped',snapshot_id=v_snapshot.id,result_code='not_certified',message='Certify this snapshot before publishing it.',completed_at=now(),updated_at=now() where id=v_item.id; v_skipped:=v_skipped+1;
        end if;
      else
        if not found then
          update public.report_card_batch_items set status='skipped',result_code='not_generated',message='No current snapshot exists for this learner and term.',completed_at=now(),updated_at=now() where id=v_item.id; v_skipped:=v_skipped+1;
        elsif v_snapshot.status not in ('certified','published') then
          update public.report_card_batch_items set status='skipped',snapshot_id=v_snapshot.id,result_code='not_certified',message='Certify this snapshot before preparing its PDF.',completed_at=now(),updated_at=now() where id=v_item.id; v_skipped:=v_skipped+1;
        elsif exists(select 1 from public.report_card_documents d where d.snapshot_id=v_snapshot.id and d.document_format='pdf' and d.status='ready' and d.renderer_version=app_private.current_report_card_renderer_version()) then
          update public.report_card_batch_items set status='completed',snapshot_id=v_snapshot.id,result_code='pdf_ready',message='Current PDF artifact is already ready.',completed_at=now(),updated_at=now() where id=v_item.id; v_completed:=v_completed+1;
        else
          v_job_id:=public.queue_report_card_render(v_snapshot.id,'TERM_REPORT',v_snapshot.template_version,'pdf');
          update public.report_card_batch_items set status='completed',snapshot_id=v_snapshot.id,result_code='pdf_queued',message='Current PDF render queued.',completed_at=now(),updated_at=now() where id=v_item.id; v_completed:=v_completed+1;
        end if;
      end if;
    exception when others then
      v_message:=sqlerrm;
      if v_batch.operation='generate' and v_message ilike '%No approved official results%' then
        update public.report_card_batch_items set status='skipped',result_code='no_approved_results',message='No approved official results are available for this learner and term.',completed_at=now(),updated_at=now() where id=v_item.id; v_skipped:=v_skipped+1;
      else
        update public.report_card_batch_items set status='failed',result_code='error',message=left(coalesce(v_message,'Report-card batch item failed'),1000),completed_at=now(),updated_at=now() where id=v_item.id; v_failed:=v_failed+1;
      end if;
    end;
    perform app_private.refresh_report_card_batch(v_item.batch_id);
  end loop;
  perform set_config('request.jwt.claim.sub',coalesce(v_original_sub,''),true);
  perform set_config('request.jwt.claim.role',coalesce(v_original_role,''),true);
  return jsonb_build_object('processed',v_processed,'completed',v_completed,'skipped',v_skipped,'failed',v_failed);
end;
$$;

-- Combined exports can be rebuilt when their recorded renderer is stale. They become
-- claimable only once every completed learner item has a current-revision PDF.
create or replace function public.claim_report_card_batch_exports(p_limit integer default 1)
returns setof public.report_card_batches
language plpgsql
security definer
set search_path=public,app_private
as $$
begin
  return query
  with candidates as (
    select b.id from public.report_card_batches b
    where b.operation='pdf' and b.status in ('completed','partial') and b.completed_items>0
      and (b.export_status in ('waiting','failed') or (b.export_status='ready' and b.export_renderer_version is distinct from app_private.current_report_card_renderer_version()))
      and not exists(
        select 1 from public.report_card_batch_items i
        where i.batch_id=b.id and i.status='completed' and (
          i.snapshot_id is null or not exists(
            select 1 from public.report_card_documents d
            where d.snapshot_id=i.snapshot_id and d.document_format='pdf' and d.status='ready'
              and d.renderer_version=app_private.current_report_card_renderer_version()
          )
        )
      )
    order by b.created_at for update skip locked
    limit greatest(1,least(coalesce(p_limit,1),3))
  ), claimed as (
    update public.report_card_batches b
    set export_status='processing',export_error=null,updated_at=now()
    from candidates c where b.id=c.id returning b.*
  )
  select * from claimed;
end;
$$;

create or replace function public.complete_report_card_batch_export(
  p_batch_id uuid,p_storage_bucket text,p_storage_path text,p_content_sha256 text,p_page_count integer
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare v_batch public.report_card_batches%rowtype;
begin
  select * into v_batch from public.report_card_batches where id=p_batch_id for update;
  if not found then raise exception 'Report-card batch not found'; end if;
  if v_batch.operation<>'pdf' or v_batch.export_status<>'processing' then raise exception 'Report-card batch export is not processing'; end if;
  if btrim(coalesce(p_storage_bucket,''))='' or btrim(coalesce(p_storage_path,''))='' then raise exception 'Batch export storage location is required'; end if;
  if coalesce(p_page_count,0)<=0 then raise exception 'Batch export page count is required'; end if;

  update public.report_card_batches set export_status='ready',export_storage_bucket=btrim(p_storage_bucket),export_storage_path=btrim(p_storage_path),
    export_content_sha256=nullif(lower(btrim(coalesce(p_content_sha256,''))),''),export_page_count=p_page_count,export_error=null,
    export_completed_at=now(),export_renderer_version=app_private.current_report_card_renderer_version(),updated_at=now()
  where id=v_batch.id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_batch.tenant_id,v_batch.school_id,null,'report_card.batch.export.ready','report_card_batch',v_batch.id,
    jsonb_build_object('requested_by_user_id',v_batch.created_by_user_id,'renderer_version',app_private.current_report_card_renderer_version(),
      'page_count',p_page_count,'storage_bucket',btrim(p_storage_bucket),'storage_path',btrim(p_storage_path)));
  return true;
end;
$$;

revoke all on function public.queue_report_card_render(uuid,text,text,text) from public,anon;
grant execute on function public.queue_report_card_render(uuid,text,text,text) to authenticated;
revoke all on function public.claim_report_card_render_jobs(integer,text) from public,anon,authenticated;
grant execute on function public.claim_report_card_render_jobs(integer,text) to service_role;
revoke all on function public.complete_report_card_render_job(uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.complete_report_card_render_job(uuid,text,text,text,integer) to service_role;
revoke all on function public.process_report_card_batch_items(integer) from public,anon,authenticated;
grant execute on function public.process_report_card_batch_items(integer) to service_role;
revoke all on function public.claim_report_card_batch_exports(integer) from public,anon,authenticated;
grant execute on function public.claim_report_card_batch_exports(integer) to service_role;
revoke all on function public.complete_report_card_batch_export(uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.complete_report_card_batch_export(uuid,text,text,text,integer) to service_role;

comment on function app_private.current_report_card_renderer_version() is
'Current derived report-card artifact renderer revision. This is intentionally independent from the immutable snapshot template_version.';
comment on column public.report_card_render_jobs.renderer_version is
'Renderer implementation revision for this derived artifact job; independent from the immutable snapshot/template contract.';
comment on column public.report_card_documents.renderer_version is
'Renderer implementation revision that produced this durable artifact. Historical revisions remain stored but do not satisfy current readiness.';
comment on column public.report_card_batches.export_renderer_version is
'Renderer revision used for the currently recorded combined PDF export.';
