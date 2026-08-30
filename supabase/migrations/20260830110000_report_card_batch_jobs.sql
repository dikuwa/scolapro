-- Durable bulk report-card operations for whole-school, grade, class and custom scopes.
-- Each action is a separate auditable batch. The UI may present one streamlined workflow,
-- but snapshot generation, certification and PDF preparation remain distinct operations.

create table public.report_card_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  term_number smallint not null check (term_number between 1 and 6),
  scope_type text not null check (scope_type in ('school','grade','class','custom')),
  scope_label text not null,
  operation text not null check (operation in ('generate','certify','pdf')),
  status text not null default 'pending' check (status in ('pending','processing','completed','partial','cancelled')),
  total_items integer not null default 0 check (total_items >= 0),
  processed_items integer not null default 0 check (processed_items >= 0),
  completed_items integer not null default 0 check (completed_items >= 0),
  skipped_items integer not null default 0 check (skipped_items >= 0),
  failed_items integer not null default 0 check (failed_items >= 0),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(scope_label) <> '')
);

create index report_card_batches_school_recent_idx
  on public.report_card_batches(school_id,academic_year,term_number,created_at desc);
create index report_card_batches_worker_idx
  on public.report_card_batches(status,created_at)
  where status in ('pending','processing');

create table public.report_card_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.report_card_batches(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  enrolment_id uuid not null references public.enrolments(id) on delete restrict,
  learner_id uuid not null references public.learners(id) on delete restrict,
  snapshot_id uuid references public.report_card_snapshots(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','processing','completed','skipped','failed')),
  result_code text,
  message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(batch_id,enrolment_id)
);

create index report_card_batch_items_worker_idx
  on public.report_card_batch_items(status,created_at)
  where status='pending';
create index report_card_batch_items_batch_status_idx
  on public.report_card_batch_items(batch_id,status);

alter table public.report_card_batches enable row level security;
alter table public.report_card_batch_items enable row level security;

create policy "report managers read report card batches"
on public.report_card_batches for select to authenticated
using (
  app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal'])
  or app_private.has_platform_role(array['platform_admin'])
);

create policy "report managers read report card batch items"
on public.report_card_batch_items for select to authenticated
using (
  app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal'])
  or app_private.has_platform_role(array['platform_admin'])
);

revoke all on public.report_card_batches,public.report_card_batch_items from anon,authenticated;
grant select on public.report_card_batches,public.report_card_batch_items to authenticated;
grant select,insert,update,delete on public.report_card_batches,public.report_card_batch_items to service_role;

create or replace function app_private.refresh_report_card_batch(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_total integer;
  v_pending integer;
  v_processing integer;
  v_completed integer;
  v_skipped integer;
  v_failed integer;
begin
  select count(*)::integer,
         count(*) filter(where status='pending')::integer,
         count(*) filter(where status='processing')::integer,
         count(*) filter(where status='completed')::integer,
         count(*) filter(where status='skipped')::integer,
         count(*) filter(where status='failed')::integer
  into v_total,v_pending,v_processing,v_completed,v_skipped,v_failed
  from public.report_card_batch_items
  where batch_id=p_batch_id;

  update public.report_card_batches
  set total_items=coalesce(v_total,0),
      processed_items=coalesce(v_completed,0)+coalesce(v_skipped,0)+coalesce(v_failed,0),
      completed_items=coalesce(v_completed,0),
      skipped_items=coalesce(v_skipped,0),
      failed_items=coalesce(v_failed,0),
      status=case
        when status='cancelled' then 'cancelled'
        when coalesce(v_pending,0)+coalesce(v_processing,0)>0 then 'processing'
        when coalesce(v_failed,0)>0 then 'partial'
        else 'completed'
      end,
      started_at=case when started_at is null and coalesce(v_total,0)>0 then now() else started_at end,
      completed_at=case
        when status<>'cancelled' and coalesce(v_pending,0)+coalesce(v_processing,0)=0 then coalesce(completed_at,now())
        else null
      end,
      updated_at=now()
  where id=p_batch_id;
end;
$$;

revoke all on function app_private.refresh_report_card_batch(uuid) from public,anon,authenticated;

create or replace function public.create_report_card_batch(
  p_school_id uuid,
  p_academic_year integer,
  p_term_number integer,
  p_scope_type text,
  p_scope_label text,
  p_operation text,
  p_enrolment_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_tenant_id uuid;
  v_batch_id uuid;
  v_requested integer;
  v_valid integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (
    app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])
    or app_private.has_platform_role(array['platform_admin'])
  ) then raise exception 'Permission denied'; end if;

  if p_term_number<1 or p_term_number>6 then raise exception 'Term number is invalid'; end if;
  if p_academic_year<2000 or p_academic_year>2200 then raise exception 'Academic year is invalid'; end if;
  if p_scope_type not in ('school','grade','class','custom') then raise exception 'Unsupported report-card scope'; end if;
  if p_operation not in ('generate','certify','pdf') then raise exception 'Unsupported report-card batch operation'; end if;
  if btrim(coalesce(p_scope_label,''))='' then raise exception 'Scope label is required'; end if;

  v_requested:=coalesce(array_length(p_enrolment_ids,1),0);
  if v_requested=0 then raise exception 'Choose at least one learner'; end if;
  if v_requested>5000 then raise exception 'A report-card batch cannot exceed 5000 learners'; end if;
  if v_requested<>(select count(distinct value)::integer from unnest(p_enrolment_ids) value) then
    raise exception 'Duplicate learner enrolments are not allowed in one batch';
  end if;

  select tenant_id into v_tenant_id
  from public.schools
  where id=p_school_id and status='active';
  if v_tenant_id is null then raise exception 'School not found or inactive'; end if;

  select count(*)::integer into v_valid
  from public.enrolments e
  where e.id=any(p_enrolment_ids)
    and e.tenant_id=v_tenant_id
    and e.school_id=p_school_id
    and e.academic_year=p_academic_year
    and e.status='current';
  if v_valid<>v_requested then
    raise exception 'Every selected learner must have a current enrolment in this school and academic year';
  end if;

  insert into public.report_card_batches(
    tenant_id,school_id,academic_year,term_number,scope_type,scope_label,operation,total_items,created_by_user_id
  ) values(
    v_tenant_id,p_school_id,p_academic_year,p_term_number::smallint,p_scope_type,btrim(p_scope_label),p_operation,v_requested,auth.uid()
  ) returning id into v_batch_id;

  insert into public.report_card_batch_items(batch_id,tenant_id,school_id,enrolment_id,learner_id)
  select v_batch_id,e.tenant_id,e.school_id,e.id,e.learner_id
  from public.enrolments e
  where e.id=any(p_enrolment_ids);

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_tenant_id,p_school_id,auth.uid(),'report_card.batch.created','report_card_batch',v_batch_id,
    jsonb_build_object('operation',p_operation,'scope_type',p_scope_type,'scope_label',btrim(p_scope_label),
      'academic_year',p_academic_year,'term_number',p_term_number,'total_items',v_requested));

  return v_batch_id;
end;
$$;

revoke all on function public.create_report_card_batch(uuid,integer,integer,text,text,text,uuid[]) from public,anon;
grant execute on function public.create_report_card_batch(uuid,integer,integer,text,text,text,uuid[]) to authenticated;

create or replace function public.retry_report_card_batch_failures(p_batch_id uuid)
returns integer
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_batch public.report_card_batches%rowtype;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_batch from public.report_card_batches where id=p_batch_id for update;
  if not found then raise exception 'Report-card batch not found'; end if;
  if not (
    app_private.has_school_role(v_batch.school_id,array['school_admin','principal','deputy_principal'])
    or app_private.has_platform_role(array['platform_admin'])
  ) then raise exception 'Permission denied'; end if;

  update public.report_card_batch_items
  set status='pending',result_code=null,message=null,started_at=null,completed_at=null,updated_at=now()
  where batch_id=v_batch.id and status='failed';
  get diagnostics v_count=row_count;
  if v_count>0 then
    update public.report_card_batches set status='pending',completed_at=null,updated_at=now() where id=v_batch.id;
    perform app_private.refresh_report_card_batch(v_batch.id);
  end if;
  return v_count;
end;
$$;

revoke all on function public.retry_report_card_batch_failures(uuid) from public,anon;
grant execute on function public.retry_report_card_batch_failures(uuid) to authenticated;

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
  v_processed integer := 0;
  v_completed integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
  v_message text;
  v_result_code text;
  v_job_id uuid;
begin
  for v_item in
    select i.id,i.batch_id,i.enrolment_id,i.learner_id
    from public.report_card_batch_items i
    join public.report_card_batches b on b.id=i.batch_id
    where i.status='pending' and b.status<>'cancelled'
    order by b.created_at,i.created_at
    for update of i skip locked
    limit greatest(1,least(coalesce(p_limit,25),100))
  loop
    select * into v_batch from public.report_card_batches where id=v_item.batch_id;
    update public.report_card_batch_items
    set status='processing',started_at=coalesce(started_at,now()),updated_at=now()
    where id=v_item.id;

    v_processed:=v_processed+1;
    v_message:=null;
    v_result_code:=null;

    begin
      perform set_config('request.jwt.claim.sub',v_batch.created_by_user_id::text,true);
      perform set_config('request.jwt.claim.role','authenticated',true);

      if v_batch.operation='generate' then
        select * into v_snapshot
        from public.report_card_snapshots
        where enrolment_id=v_item.enrolment_id
          and term_number=v_batch.term_number
          and status<>'superseded'
        order by snapshot_version desc
        limit 1;

        if found then
          update public.report_card_batch_items
          set status='completed',snapshot_id=v_snapshot.id,result_code='already_generated',
              message='A current report-card snapshot already exists for this learner and term.',completed_at=now(),updated_at=now()
          where id=v_item.id;
        else
          v_snapshot.id:=public.build_report_card_snapshot(v_item.enrolment_id,v_batch.term_number,'SCOLAPRO_TERM_REPORT_V1');
          update public.report_card_batch_items
          set status='completed',snapshot_id=v_snapshot.id,result_code='generated',
              message='Report-card snapshot generated.',completed_at=now(),updated_at=now()
          where id=v_item.id;
        end if;
        v_completed:=v_completed+1;

      elsif v_batch.operation='certify' then
        select * into v_snapshot
        from public.report_card_snapshots
        where enrolment_id=v_item.enrolment_id
          and term_number=v_batch.term_number
          and status<>'superseded'
        order by snapshot_version desc
        limit 1;

        if not found then
          update public.report_card_batch_items
          set status='skipped',result_code='not_generated',message='No current snapshot exists for this learner and term.',completed_at=now(),updated_at=now()
          where id=v_item.id;
          v_skipped:=v_skipped+1;
        elsif v_snapshot.status='draft' then
          perform public.certify_report_card_snapshot(v_snapshot.id);
          update public.report_card_batch_items
          set status='completed',snapshot_id=v_snapshot.id,result_code='certified',message='Snapshot certified.',completed_at=now(),updated_at=now()
          where id=v_item.id;
          v_completed:=v_completed+1;
        elsif v_snapshot.status in ('certified','published') then
          update public.report_card_batch_items
          set status='completed',snapshot_id=v_snapshot.id,result_code='already_certified',message='Snapshot was already certified.',completed_at=now(),updated_at=now()
          where id=v_item.id;
          v_completed:=v_completed+1;
        else
          update public.report_card_batch_items
          set status='skipped',snapshot_id=v_snapshot.id,result_code='not_certifiable',message='The current snapshot is not eligible for certification.',completed_at=now(),updated_at=now()
          where id=v_item.id;
          v_skipped:=v_skipped+1;
        end if;

      else
        select * into v_snapshot
        from public.report_card_snapshots
        where enrolment_id=v_item.enrolment_id
          and term_number=v_batch.term_number
          and status<>'superseded'
        order by snapshot_version desc
        limit 1;

        if not found then
          update public.report_card_batch_items
          set status='skipped',result_code='not_generated',message='No current snapshot exists for this learner and term.',completed_at=now(),updated_at=now()
          where id=v_item.id;
          v_skipped:=v_skipped+1;
        elsif v_snapshot.status not in ('certified','published') then
          update public.report_card_batch_items
          set status='skipped',snapshot_id=v_snapshot.id,result_code='not_certified',message='Certify this snapshot before preparing its PDF.',completed_at=now(),updated_at=now()
          where id=v_item.id;
          v_skipped:=v_skipped+1;
        elsif exists(
          select 1 from public.report_card_documents d
          where d.snapshot_id=v_snapshot.id and d.document_format='pdf' and d.status='ready'
        ) then
          update public.report_card_batch_items
          set status='completed',snapshot_id=v_snapshot.id,result_code='pdf_ready',message='PDF artifact is already ready.',completed_at=now(),updated_at=now()
          where id=v_item.id;
          v_completed:=v_completed+1;
        else
          v_job_id:=public.queue_report_card_render(v_snapshot.id,'TERM_REPORT',v_snapshot.template_version,'pdf');
          update public.report_card_batch_items
          set status='completed',snapshot_id=v_snapshot.id,result_code='pdf_queued',message='PDF render queued.',completed_at=now(),updated_at=now()
          where id=v_item.id;
          v_completed:=v_completed+1;
        end if;
      end if;

    exception when others then
      v_message:=sqlerrm;
      if v_batch.operation='generate' and v_message ilike '%No approved official results%' then
        update public.report_card_batch_items
        set status='skipped',result_code='no_approved_results',message='No approved official results are available for this learner and term.',completed_at=now(),updated_at=now()
        where id=v_item.id;
        v_skipped:=v_skipped+1;
      else
        update public.report_card_batch_items
        set status='failed',result_code='error',message=left(coalesce(v_message,'Report-card batch item failed'),1000),completed_at=now(),updated_at=now()
        where id=v_item.id;
        v_failed:=v_failed+1;
      end if;
    end;

    perform app_private.refresh_report_card_batch(v_item.batch_id);
  end loop;

  perform set_config('request.jwt.claim.sub',coalesce(v_original_sub,''),true);
  perform set_config('request.jwt.claim.role',coalesce(v_original_role,''),true);

  return jsonb_build_object(
    'processed',v_processed,
    'completed',v_completed,
    'skipped',v_skipped,
    'failed',v_failed
  );
end;
$$;

revoke all on function public.process_report_card_batch_items(integer) from public,anon,authenticated;
grant execute on function public.process_report_card_batch_items(integer) to service_role;

comment on table public.report_card_batches is
'Durable management-only bulk report-card jobs. Each batch records one scoped operation (generate, certify, or PDF preparation) and survives browser refresh/closure.';
comment on table public.report_card_batch_items is
'Per-learner outcomes for a report-card batch, including explicit skip/failure reasons rather than silently dropping learners.';
comment on function public.process_report_card_batch_items(integer) is
'Service-role worker for durable report-card batches. It executes each item using the immutable batch creator as the audited actor, while all public mutation functions retain their existing authorization checks.';
