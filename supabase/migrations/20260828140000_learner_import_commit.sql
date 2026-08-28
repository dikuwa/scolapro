-- First production commit path for staged imports. Learner batches are committed
-- atomically through the canonical learner-registration RPC, never by writing raw
-- spreadsheet rows directly to learner/enrolment tables.

create or replace function public.commit_learner_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_batch public.import_batches%rowtype;
  v_row public.import_rows%rowtype;
  v_result jsonb;
  v_created integer:=0;
  v_skipped integer:=0;
  v_admission text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_batch from public.import_batches where id=p_batch_id for update;
  if not found then raise exception 'Import batch not found'; end if;
  if v_batch.import_type<>'learners' then raise exception 'This commit function only supports learner imports'; end if;
  if not app_private.has_school_role(v_batch.school_id,array['school_admin']) and not app_private.has_platform_role(array['platform_admin']) then raise exception 'Only a school administrator can commit learner imports'; end if;
  if v_batch.status<>'ready' then raise exception 'Import batch must be ready before commit'; end if;
  if exists(select 1 from public.import_rows where batch_id=v_batch.id and resolution in ('review','error','update','link')) then raise exception 'Learner import contains unresolved or unsupported reconciliation rows'; end if;

  update public.import_batches set status='committing',updated_at=now() where id=v_batch.id;

  for v_row in select * from public.import_rows where batch_id=v_batch.id order by row_number
  loop
    if v_row.resolution='skip' then
      insert into public.import_commit_results(batch_id,import_row_id,outcome,message)
      values(v_batch.id,v_row.id,'skipped','Skipped during import review')
      on conflict(import_row_id) do nothing;
      v_skipped:=v_skipped+1;
      continue;
    end if;
    if v_row.resolution<>'create' then raise exception 'Row % is not ready for learner creation',v_row.row_number; end if;
    if nullif(btrim(coalesce(v_row.normalized_data->>'first_names','')),'') is null or nullif(btrim(coalesce(v_row.normalized_data->>'surname','')),'') is null then raise exception 'Row % is missing learner name fields',v_row.row_number; end if;
    if nullif(v_row.normalized_data->>'academic_year','') is null or nullif(v_row.normalized_data->>'grade_id','') is null or nullif(v_row.normalized_data->>'register_class_id','') is null then raise exception 'Row % is missing academic placement',v_row.row_number; end if;

    v_result:=public.create_learner_enrolment(
      v_batch.school_id,
      (v_row.normalized_data->>'academic_year')::integer,
      (v_row.normalized_data->>'grade_id')::uuid,
      (v_row.normalized_data->>'register_class_id')::uuid,
      v_row.normalized_data->>'first_names',
      v_row.normalized_data->>'surname',
      nullif(v_row.normalized_data->>'preferred_name',''),
      nullif(v_row.normalized_data->>'date_of_birth','')::date,
      coalesce(nullif(lower(v_row.normalized_data->>'sex'),''),'unspecified'),
      nullif(v_row.normalized_data->>'admission_number',''),
      coalesce(nullif(v_row.normalized_data->>'enrolled_from','')::date,current_date)
    );
    v_admission:=v_result->>'admission_number';
    update public.school_learner_identifiers set source='imported',updated_at=now()
    where learner_id=(v_result->>'learner_id')::uuid and school_id=v_batch.school_id;
    insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message)
    values(v_batch.id,v_row.id,'learner',(v_result->>'learner_id')::uuid,'created','Created learner '||coalesce(v_admission,''));
    update public.import_rows set matched_entity_type='learner',matched_entity_id=(v_result->>'learner_id')::uuid,updated_at=now() where id=v_row.id;
    v_created:=v_created+1;
  end loop;

  update public.import_batches set status='completed',committed_at=now(),updated_at=now() where id=v_batch.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_batch.tenant_id,v_batch.school_id,auth.uid(),'import.learners.committed','import_batch',v_batch.id,jsonb_build_object('created',v_created,'skipped',v_skipped,'total_rows',v_batch.total_rows));
  return jsonb_build_object('batch_id',v_batch.id,'created',v_created,'skipped',v_skipped);
end;
$$;

revoke all on function public.commit_learner_import_batch(uuid) from public,anon;
grant execute on function public.commit_learner_import_batch(uuid) to authenticated;
