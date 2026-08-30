-- A PDF-preparation batch should culminate in one durable printable artifact rather than
-- forcing an administrator to open hundreds of individual PDFs. The individual report
-- documents remain canonical; this export is a derived convenience artifact tied to the
-- immutable batch and can be safely rebuilt.

alter table public.report_card_batches
  add column export_status text not null default 'not_applicable'
    check (export_status in ('not_applicable','waiting','processing','ready','failed')),
  add column export_storage_bucket text,
  add column export_storage_path text,
  add column export_content_sha256 text,
  add column export_page_count integer check (export_page_count is null or export_page_count > 0),
  add column export_error text,
  add column export_completed_at timestamptz;

create index report_card_batches_export_worker_idx
  on public.report_card_batches(export_status,created_at)
  where operation='pdf' and export_status in ('waiting','failed');

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
    tenant_id,school_id,academic_year,term_number,scope_type,scope_label,operation,total_items,created_by_user_id,export_status
  ) values(
    v_tenant_id,p_school_id,p_academic_year,p_term_number::smallint,p_scope_type,btrim(p_scope_label),p_operation,v_requested,auth.uid(),
    case when p_operation='pdf' then 'waiting' else 'not_applicable' end
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
      and b.export_status in ('waiting','failed')
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

create or replace function public.complete_report_card_batch_export(
  p_batch_id uuid,
  p_storage_bucket text,
  p_storage_path text,
  p_content_sha256 text,
  p_page_count integer
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_batch public.report_card_batches%rowtype;
begin
  select * into v_batch from public.report_card_batches where id=p_batch_id for update;
  if not found then raise exception 'Report-card batch not found'; end if;
  if v_batch.operation<>'pdf' or v_batch.export_status<>'processing' then raise exception 'Report-card batch export is not processing'; end if;
  if btrim(coalesce(p_storage_bucket,''))='' or btrim(coalesce(p_storage_path,''))='' then raise exception 'Batch export storage location is required'; end if;
  if coalesce(p_page_count,0)<=0 then raise exception 'Batch export page count is required'; end if;

  update public.report_card_batches
  set export_status='ready',export_storage_bucket=btrim(p_storage_bucket),export_storage_path=btrim(p_storage_path),
      export_content_sha256=nullif(lower(btrim(coalesce(p_content_sha256,''))),''),export_page_count=p_page_count,
      export_error=null,export_completed_at=now(),updated_at=now()
  where id=v_batch.id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_batch.tenant_id,v_batch.school_id,v_batch.created_by_user_id,'report_card.batch.export.ready','report_card_batch',v_batch.id,
    jsonb_build_object('page_count',p_page_count,'storage_path',btrim(p_storage_path)));
  return true;
end;
$$;

create or replace function public.fail_report_card_batch_export(p_batch_id uuid,p_error text)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.report_card_batches
  set export_status='failed',export_error=left(coalesce(p_error,'Combined PDF export failed'),2000),updated_at=now()
  where id=p_batch_id and operation='pdf' and export_status='processing';
  if not found then raise exception 'Processing report-card batch export not found'; end if;
  return true;
end;
$$;

create or replace function public.retry_report_card_batch_export(p_batch_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_batch public.report_card_batches%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_batch from public.report_card_batches where id=p_batch_id for update;
  if not found then raise exception 'Report-card batch not found'; end if;
  if not (
    app_private.has_school_role(v_batch.school_id,array['school_admin','principal','deputy_principal'])
    or app_private.has_platform_role(array['platform_admin'])
  ) then raise exception 'Permission denied'; end if;
  if v_batch.operation<>'pdf' or v_batch.export_status<>'failed' then raise exception 'Only failed PDF batch exports can be retried'; end if;
  update public.report_card_batches set export_status='waiting',export_error=null,updated_at=now() where id=v_batch.id;
  return true;
end;
$$;

revoke all on function public.claim_report_card_batch_exports(integer) from public,anon,authenticated;
grant execute on function public.claim_report_card_batch_exports(integer) to service_role;
revoke all on function public.complete_report_card_batch_export(uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.complete_report_card_batch_export(uuid,text,text,text,integer) to service_role;
revoke all on function public.fail_report_card_batch_export(uuid,text) from public,anon,authenticated;
grant execute on function public.fail_report_card_batch_export(uuid,text) to service_role;
revoke all on function public.retry_report_card_batch_export(uuid) from public,anon;
grant execute on function public.retry_report_card_batch_export(uuid) to authenticated;

comment on function public.claim_report_card_batch_exports(integer) is
'Service-role claim for combined PDF exports. A batch is eligible only after all completed learner items have ready immutable PDF artifacts.';
