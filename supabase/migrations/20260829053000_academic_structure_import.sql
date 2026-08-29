-- Deterministic school academic-structure import.
-- Codes are authoritative reconciliation keys; display names may be corrected,
-- but names are never used to decide identity.

create or replace function public.reconcile_academic_structure_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_batch public.import_batches%rowtype;
  v_row public.import_rows%rowtype;
  v_type text;
  v_code text;
  v_name text;
  v_grade_code text;
  v_year integer;
  v_existing_id uuid;
  v_existing_name text;
  v_existing_grade_id uuid;
  v_target_grade_id uuid;
  v_create integer:=0;
  v_update integer:=0;
  v_skip integer:=0;
  v_error integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_batch from public.import_batches where id=p_batch_id for update;
  if not found then raise exception 'Import batch not found'; end if;
  if v_batch.import_type<>'academic_structure' then raise exception 'Only academic-structure batches can be reconciled'; end if;
  if not app_private.can_manage_school_imports(v_batch.school_id) then raise exception 'Permission denied'; end if;
  if v_batch.status not in ('staging','validating','review') then raise exception 'Import batch is not editable'; end if;

  update public.import_batches set status='validating',updated_at=now() where id=v_batch.id;

  -- Structural validation is repeated in the database so direct RPC callers cannot
  -- bypass the CSV action's normalization rules.
  for v_row in select * from public.import_rows where batch_id=v_batch.id order by row_number
  loop
    if v_row.resolution='error' then continue; end if;
    v_type:=lower(btrim(coalesce(v_row.normalized_data->>'record_type','')));
    v_code:=upper(btrim(coalesce(v_row.normalized_data->>'code','')));
    v_name:=btrim(coalesce(v_row.normalized_data->>'display_name',''));
    v_year:=coalesce(nullif(v_row.normalized_data->>'academic_year','')::integer,extract(year from current_date)::integer);
    v_grade_code:=upper(btrim(coalesce(v_row.normalized_data->>'grade_code','')));

    if v_type not in ('grade','class','subject') then
      update public.import_rows set resolution='error',issues=issues||jsonb_build_array(jsonb_build_object('level','error','field','record_type','message','Record type must be grade, class or subject.')),updated_at=now() where id=v_row.id;
      continue;
    end if;
    if v_code='' or v_name='' then
      update public.import_rows set resolution='error',issues=issues||jsonb_build_array(jsonb_build_object('level','error','field','code','message','Code and display name are required.')),updated_at=now() where id=v_row.id;
      continue;
    end if;
    if v_year<2000 or v_year>2200 then
      update public.import_rows set resolution='error',issues=issues||jsonb_build_array(jsonb_build_object('level','error','field','academic_year','message','Academic year is invalid.')),updated_at=now() where id=v_row.id;
      continue;
    end if;
    if v_type='class' and v_grade_code='' then
      update public.import_rows set resolution='error',issues=issues||jsonb_build_array(jsonb_build_object('level','error','field','grade_code','message','Class rows require a grade code.')),updated_at=now() where id=v_row.id;
      continue;
    end if;
  end loop;

  -- Mark every duplicate logical code in the source as an error; do not silently
  -- choose a first row. Subject identity is school-wide; grades/classes are yearly.
  with keys as (
    select id,
      lower(btrim(normalized_data->>'record_type')) as record_type,
      upper(btrim(normalized_data->>'code')) as code,
      coalesce(nullif(normalized_data->>'academic_year','')::integer,extract(year from current_date)::integer) as academic_year
    from public.import_rows
    where batch_id=v_batch.id and resolution<>'error'
  ), dupes as (
    select record_type,code,case when record_type='subject' then null else academic_year end as year_key
    from keys group by record_type,code,case when record_type='subject' then null else academic_year end having count(*)>1
  )
  update public.import_rows r
  set resolution='error',matched_entity_type=null,matched_entity_id=null,
      issues=r.issues||jsonb_build_array(jsonb_build_object('level','error','field','code','message','This code appears more than once for the same record type and academic year in the import batch.')),
      updated_at=now()
  from keys k join dupes d on d.record_type=k.record_type and d.code=k.code and d.year_key is not distinct from (case when k.record_type='subject' then null else k.academic_year end)
  where r.id=k.id;

  for v_row in select * from public.import_rows where batch_id=v_batch.id order by row_number
  loop
    if v_row.resolution='error' then v_error:=v_error+1; continue; end if;
    v_type:=lower(btrim(v_row.normalized_data->>'record_type'));
    v_code:=upper(btrim(v_row.normalized_data->>'code'));
    v_name:=btrim(v_row.normalized_data->>'display_name');
    v_year:=coalesce(nullif(v_row.normalized_data->>'academic_year','')::integer,extract(year from current_date)::integer);
    v_grade_code:=upper(btrim(coalesce(v_row.normalized_data->>'grade_code','')));
    v_existing_id:=null;v_existing_name:=null;v_existing_grade_id:=null;v_target_grade_id:=null;

    if v_type='grade' then
      select id,display_name into v_existing_id,v_existing_name from public.grades
      where school_id=v_batch.school_id and academic_year=v_year and upper(btrim(grade_code))=v_code limit 1;
    elsif v_type='subject' then
      select id,display_name into v_existing_id,v_existing_name from public.subjects
      where school_id=v_batch.school_id and upper(btrim(subject_code))=v_code limit 1;
    else
      select id into v_target_grade_id from public.grades
      where school_id=v_batch.school_id and academic_year=v_year and upper(btrim(grade_code))=v_grade_code limit 1;
      if v_target_grade_id is null and not exists(
        select 1 from public.import_rows r2
        where r2.batch_id=v_batch.id and r2.resolution<>'error'
          and lower(btrim(r2.normalized_data->>'record_type'))='grade'
          and upper(btrim(r2.normalized_data->>'code'))=v_grade_code
          and coalesce(nullif(r2.normalized_data->>'academic_year','')::integer,extract(year from current_date)::integer)=v_year
      ) then
        update public.import_rows set resolution='error',issues=issues||jsonb_build_array(jsonb_build_object('level','error','field','grade_code','message','Class grade code does not exist in the school/year and is not supplied by this batch.')),updated_at=now() where id=v_row.id;
        v_error:=v_error+1;continue;
      end if;
      select id,display_name,grade_id into v_existing_id,v_existing_name,v_existing_grade_id from public.register_classes
      where school_id=v_batch.school_id and academic_year=v_year and upper(btrim(class_code))=v_code limit 1;
    end if;

    if v_existing_id is null then
      update public.import_rows set resolution='create',matched_entity_type=null,matched_entity_id=null,updated_at=now() where id=v_row.id;
      v_create:=v_create+1;
    elsif lower(btrim(v_existing_name))=lower(btrim(v_name))
      and (v_type<>'class' or v_target_grade_id is null or v_existing_grade_id=v_target_grade_id) then
      update public.import_rows set resolution='skip',matched_entity_type=v_type,matched_entity_id=v_existing_id,updated_at=now() where id=v_row.id;
      v_skip:=v_skip+1;
    else
      update public.import_rows set resolution='update',matched_entity_type=v_type,matched_entity_id=v_existing_id,
        issues=issues||jsonb_build_array(jsonb_build_object('level','warning','field','display_name','message','Existing code matched; commit will update the configured display name or class grade link.')),
        updated_at=now() where id=v_row.id;
      v_update:=v_update+1;
    end if;
  end loop;

  update public.import_batches b set
    total_rows=(select count(*) from public.import_rows r where r.batch_id=b.id),
    valid_rows=(select count(*) from public.import_rows r where r.batch_id=b.id and r.resolution in ('create','update','skip')),
    warning_rows=(select count(*) from public.import_rows r where r.batch_id=b.id and jsonb_array_length(r.issues)>0 and r.resolution<>'error'),
    error_rows=(select count(*) from public.import_rows r where r.batch_id=b.id and r.resolution='error'),
    status='review',updated_at=now()
  where b.id=v_batch.id;

  return jsonb_build_object('create',v_create,'update',v_update,'skip',v_skip,'error',v_error);
end;
$$;

create or replace function public.commit_academic_structure_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_batch public.import_batches%rowtype;
  v_row public.import_rows%rowtype;
  v_type text;
  v_code text;
  v_name text;
  v_grade_code text;
  v_year integer;
  v_entity_id uuid;
  v_grade_id uuid;
  v_created integer:=0;
  v_updated integer:=0;
  v_skipped integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_batch from public.import_batches where id=p_batch_id for update;
  if not found then raise exception 'Import batch not found'; end if;
  if v_batch.import_type<>'academic_structure' then raise exception 'This commit function only supports academic structure imports'; end if;
  if not app_private.has_school_role(v_batch.school_id,array['school_admin']) and not app_private.has_platform_role(array['platform_admin']) then raise exception 'Only a school administrator can commit academic structure imports'; end if;
  if v_batch.status<>'ready' then raise exception 'Import batch must be ready before commit'; end if;
  if exists(select 1 from public.import_rows where batch_id=v_batch.id and resolution in ('review','error','link')) then raise exception 'Academic structure import contains unresolved rows'; end if;
  update public.import_batches set status='committing',updated_at=now() where id=v_batch.id;

  -- Grades first so classes may refer to grades created by this same atomic batch.
  for v_row in select * from public.import_rows where batch_id=v_batch.id and lower(btrim(normalized_data->>'record_type'))='grade' order by row_number
  loop
    if v_row.resolution='skip' then
      insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message) values(v_batch.id,v_row.id,'grade',v_row.matched_entity_id,'skipped','Existing grade configuration retained');v_skipped:=v_skipped+1;continue;
    end if;
    v_code:=upper(btrim(v_row.normalized_data->>'code'));v_name:=btrim(v_row.normalized_data->>'display_name');v_year:=coalesce(nullif(v_row.normalized_data->>'academic_year','')::integer,extract(year from current_date)::integer);
    v_entity_id:=public.upsert_school_grade(v_batch.school_id,v_year,v_code,v_name);
    insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message) values(v_batch.id,v_row.id,'grade',v_entity_id,case when v_row.resolution='create' then 'created' else 'updated' end,'Grade configuration applied');
    if v_row.resolution='create' then v_created:=v_created+1;else v_updated:=v_updated+1;end if;
  end loop;

  for v_row in select * from public.import_rows where batch_id=v_batch.id and lower(btrim(normalized_data->>'record_type'))='subject' order by row_number
  loop
    if v_row.resolution='skip' then
      insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message) values(v_batch.id,v_row.id,'subject',v_row.matched_entity_id,'skipped','Existing subject configuration retained');v_skipped:=v_skipped+1;continue;
    end if;
    v_code:=upper(btrim(v_row.normalized_data->>'code'));v_name:=btrim(v_row.normalized_data->>'display_name');
    v_entity_id:=public.upsert_school_subject(v_batch.school_id,v_code,v_name);
    insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message) values(v_batch.id,v_row.id,'subject',v_entity_id,case when v_row.resolution='create' then 'created' else 'updated' end,'Subject configuration applied');
    if v_row.resolution='create' then v_created:=v_created+1;else v_updated:=v_updated+1;end if;
  end loop;

  for v_row in select * from public.import_rows where batch_id=v_batch.id and lower(btrim(normalized_data->>'record_type'))='class' order by row_number
  loop
    if v_row.resolution='skip' then
      insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message) values(v_batch.id,v_row.id,'register_class',v_row.matched_entity_id,'skipped','Existing register class retained');v_skipped:=v_skipped+1;continue;
    end if;
    v_code:=upper(btrim(v_row.normalized_data->>'code'));v_name:=btrim(v_row.normalized_data->>'display_name');v_grade_code:=upper(btrim(v_row.normalized_data->>'grade_code'));v_year:=coalesce(nullif(v_row.normalized_data->>'academic_year','')::integer,extract(year from current_date)::integer);
    select id into v_grade_id from public.grades where school_id=v_batch.school_id and academic_year=v_year and upper(btrim(grade_code))=v_grade_code limit 1;
    if v_grade_id is null then raise exception 'Class row % grade was not created or resolved',v_row.row_number; end if;
    v_entity_id:=public.upsert_register_class(v_batch.school_id,v_year,v_grade_id,v_code,v_name);
    insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message) values(v_batch.id,v_row.id,'register_class',v_entity_id,case when v_row.resolution='create' then 'created' else 'updated' end,'Register class configuration applied');
    if v_row.resolution='create' then v_created:=v_created+1;else v_updated:=v_updated+1;end if;
  end loop;

  update public.import_batches set status='completed',committed_at=now(),updated_at=now() where id=v_batch.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_batch.tenant_id,v_batch.school_id,auth.uid(),'import.academic_structure.committed','import_batch',v_batch.id,jsonb_build_object('created',v_created,'updated',v_updated,'skipped',v_skipped));
  return jsonb_build_object('batch_id',v_batch.id,'created',v_created,'updated',v_updated,'skipped',v_skipped);
end;
$$;

revoke all on function public.reconcile_academic_structure_import_batch(uuid) from public,anon;
grant execute on function public.reconcile_academic_structure_import_batch(uuid) to authenticated;
revoke all on function public.commit_academic_structure_import_batch(uuid) from public,anon;
grant execute on function public.commit_academic_structure_import_batch(uuid) to authenticated;

comment on function public.reconcile_academic_structure_import_batch(uuid) is
'Reconciles grade, class and subject rows only by school codes and academic year; display names never decide identity.';
