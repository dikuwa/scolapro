-- Deterministic learner-import reconciliation.
-- Stable identifiers may flag an existing learner; names alone never merge identities.

create or replace function public.reconcile_learner_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_batch public.import_batches%rowtype;
  v_row public.import_rows%rowtype;
  v_admission text;
  v_national text;
  v_birth text;
  v_match_admission uuid;
  v_match_national uuid;
  v_match_birth uuid;
  v_match uuid;
  v_signals text[];
  v_review integer := 0;
  v_create integer := 0;
  v_error integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_batch from public.import_batches where id = p_batch_id for update;
  if not found then raise exception 'Import batch not found'; end if;
  if v_batch.import_type <> 'learners' then raise exception 'Only learner batches can be reconciled'; end if;
  if not app_private.can_manage_school_imports(v_batch.school_id) then raise exception 'Permission denied'; end if;
  if v_batch.status not in ('staging','validating','review') then raise exception 'Import batch is not editable'; end if;

  update public.import_batches set status = 'validating', updated_at = now() where id = v_batch.id;

  for v_row in select * from public.import_rows where batch_id = v_batch.id order by row_number
  loop
    if v_row.resolution = 'error' then v_error := v_error + 1; continue; end if;
    if v_row.resolution = 'skip' then continue; end if;

    v_admission := nullif(upper(btrim(coalesce(v_row.normalized_data->>'admission_number',''))), '');
    v_national := nullif(lower(btrim(coalesce(v_row.normalized_data->>'national_id',''))), '');
    v_birth := nullif(lower(btrim(coalesce(v_row.normalized_data->>'birth_certificate_number',''))), '');
    v_match_admission := null; v_match_national := null; v_match_birth := null; v_match := null; v_signals := array[]::text[];

    if v_admission is not null then
      select learner_id into v_match_admission from public.school_learner_identifiers
      where school_id = v_batch.school_id and upper(btrim(admission_number)) = v_admission limit 1;
      if v_match_admission is not null then v_signals := array_append(v_signals, 'admission number'); end if;
    end if;
    if v_national is not null then
      select id into v_match_national from public.learners
      where tenant_id = v_batch.tenant_id and lower(btrim(national_id)) = v_national limit 1;
      if v_match_national is not null then v_signals := array_append(v_signals, 'national ID'); end if;
    end if;
    if v_birth is not null then
      select id into v_match_birth from public.learners
      where tenant_id = v_batch.tenant_id and lower(btrim(birth_certificate_number)) = v_birth limit 1;
      if v_match_birth is not null then v_signals := array_append(v_signals, 'birth certificate'); end if;
    end if;

    v_match := coalesce(v_match_admission, v_match_national, v_match_birth);
    if (v_match_admission is not null and v_match_admission <> v_match)
       or (v_match_national is not null and v_match_national <> v_match)
       or (v_match_birth is not null and v_match_birth <> v_match) then
      update public.import_rows set
        resolution = 'error', matched_entity_type = null, matched_entity_id = null,
        issues = issues || jsonb_build_array(jsonb_build_object('level','error','field','identity','message','Stable identifiers point to different existing learners. Review the source row manually.')),
        updated_at = now()
      where id = v_row.id;
      v_error := v_error + 1;
    elsif v_match is not null then
      update public.import_rows set
        resolution = 'review', matched_entity_type = 'learner', matched_entity_id = v_match,
        issues = issues || jsonb_build_array(jsonb_build_object('level','warning','field','identity','message','Exact existing learner match found by ' || array_to_string(v_signals, ', ') || '. Skip the duplicate row or handle the existing learner through the governed enrolment/transfer workflow.')),
        updated_at = now()
      where id = v_row.id;
      v_review := v_review + 1;
    else
      update public.import_rows set resolution = 'create', matched_entity_type = null, matched_entity_id = null, updated_at = now() where id = v_row.id;
      v_create := v_create + 1;
    end if;
  end loop;

  update public.import_batches b set
    total_rows = (select count(*) from public.import_rows r where r.batch_id = b.id),
    valid_rows = (select count(*) from public.import_rows r where r.batch_id = b.id and r.resolution in ('create','update','link','skip')),
    warning_rows = (select count(*) from public.import_rows r where r.batch_id = b.id and jsonb_array_length(r.issues) > 0 and r.resolution <> 'error'),
    error_rows = (select count(*) from public.import_rows r where r.batch_id = b.id and r.resolution = 'error'),
    status = 'review', updated_at = now()
  where b.id = v_batch.id;

  return jsonb_build_object('create', v_create, 'review', v_review, 'error', v_error);
end;
$$;

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
  v_learner_id uuid;
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
    v_learner_id := (v_result->>'learner_id')::uuid;
    update public.learners set
      national_id = nullif(btrim(v_row.normalized_data->>'national_id'),''),
      birth_certificate_number = nullif(btrim(v_row.normalized_data->>'birth_certificate_number'),''),
      updated_at = now()
    where id = v_learner_id;
    v_admission:=v_result->>'admission_number';
    update public.school_learner_identifiers set source='imported',updated_at=now()
    where learner_id=v_learner_id and school_id=v_batch.school_id;
    insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message)
    values(v_batch.id,v_row.id,'learner',v_learner_id,'created','Created learner '||coalesce(v_admission,''));
    update public.import_rows set matched_entity_type='learner',matched_entity_id=v_learner_id,updated_at=now() where id=v_row.id;
    v_created:=v_created+1;
  end loop;

  update public.import_batches set status='completed',committed_at=now(),updated_at=now() where id=v_batch.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_batch.tenant_id,v_batch.school_id,auth.uid(),'import.learners.committed','import_batch',v_batch.id,jsonb_build_object('created',v_created,'skipped',v_skipped,'total_rows',v_batch.total_rows));
  return jsonb_build_object('batch_id',v_batch.id,'created',v_created,'skipped',v_skipped);
end;
$$;

revoke all on function public.reconcile_learner_import_batch(uuid) from public, anon;
grant execute on function public.reconcile_learner_import_batch(uuid) to authenticated;
revoke all on function public.commit_learner_import_batch(uuid) from public,anon;
grant execute on function public.commit_learner_import_batch(uuid) to authenticated;

comment on function public.reconcile_learner_import_batch(uuid) is 'Reconciles learner import rows only by stable identifiers. Name-only matches are never silently merged.';
