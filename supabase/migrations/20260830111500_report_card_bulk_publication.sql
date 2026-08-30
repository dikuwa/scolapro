-- Bulk publication extends the durable report-card batch engine without replacing the
-- existing per-snapshot publication governance. Each learner item calls the canonical
-- publish_report_card_snapshot() RPC so supersession, guardian notifications and audit
-- provenance remain identical to individual publication.

alter table public.report_card_batches
  drop constraint if exists report_card_batches_operation_check;
alter table public.report_card_batches
  add constraint report_card_batches_operation_check
  check (operation in ('generate','certify','publish','pdf'));

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
  if p_operation not in ('generate','certify','publish','pdf') then raise exception 'Unsupported report-card batch operation'; end if;
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

      elsif v_batch.operation='publish' then
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
        elsif v_snapshot.status='published' then
          update public.report_card_batch_items
          set status='completed',snapshot_id=v_snapshot.id,result_code='already_published',message='Snapshot was already published.',completed_at=now(),updated_at=now()
          where id=v_item.id;
          v_completed:=v_completed+1;
        elsif v_snapshot.status='certified' then
          perform public.publish_report_card_snapshot(v_snapshot.id);
          update public.report_card_batch_items
          set status='completed',snapshot_id=v_snapshot.id,result_code='published',message='Snapshot published to linked guardians.',completed_at=now(),updated_at=now()
          where id=v_item.id;
          v_completed:=v_completed+1;
        else
          update public.report_card_batch_items
          set status='skipped',snapshot_id=v_snapshot.id,result_code='not_certified',message='Certify this snapshot before publishing it.',completed_at=now(),updated_at=now()
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

revoke all on function public.create_report_card_batch(uuid,integer,integer,text,text,text,uuid[]) from public,anon;
grant execute on function public.create_report_card_batch(uuid,integer,integer,text,text,text,uuid[]) to authenticated;
revoke all on function public.process_report_card_batch_items(integer) from public,anon,authenticated;
grant execute on function public.process_report_card_batch_items(integer) to service_role;

comment on function public.process_report_card_batch_items(integer) is
'Service-role worker for durable generate/certify/publish/PDF report-card batches. Publication delegates to the canonical per-snapshot RPC so supersession, guardian notification and audit behavior remain unchanged.';