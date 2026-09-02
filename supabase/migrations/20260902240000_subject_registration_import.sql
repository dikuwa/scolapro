create or replace function public.create_import_batch(
  p_school_id uuid,
  p_import_type text,
  p_source_file_name text,
  p_source_file_sha256 text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_school public.schools%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_school from public.schools where id=p_school_id;
  if not found then raise exception 'School not found'; end if;
  if not app_private.can_manage_school_imports(p_school_id) then raise exception 'Permission denied'; end if;
  if p_import_type not in ('learners','staff','guardians','academic_structure','subject_registrations') then
    raise exception 'Unsupported import type';
  end if;
  if btrim(coalesce(p_source_file_name,''))='' then raise exception 'Source file name is required'; end if;

  insert into public.import_batches(
    tenant_id,school_id,import_type,source_file_name,source_file_sha256,created_by_user_id
  ) values(
    v_school.tenant_id,v_school.id,p_import_type,btrim(p_source_file_name),
    nullif(btrim(coalesce(p_source_file_sha256,'')),''),auth.uid()
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_import_batch(uuid,text,text,text) from public,anon;
grant execute on function public.create_import_batch(uuid,text,text,text) to authenticated;

create or replace function public.reconcile_subject_registration_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_batch public.import_batches%rowtype;
  v_row public.import_rows%rowtype;
  v_admission text;
  v_subject_code text;
  v_action text;
  v_year integer;
  v_learner_id uuid;
  v_enrolment_id uuid;
  v_grade_id uuid;
  v_subject_id uuid;
  v_offering_id uuid;
  v_registration public.learner_subject_registrations%rowtype;
  v_register integer:=0;
  v_reactivate integer:=0;
  v_withdraw integer:=0;
  v_skip integer:=0;
  v_error integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_batch from public.import_batches where id=p_batch_id for update;
  if not found then raise exception 'Import batch not found'; end if;
  if v_batch.import_type<>'subject_registrations' then raise exception 'Only subject-registration batches can be reconciled'; end if;
  if not app_private.can_manage_school_imports(v_batch.school_id) then raise exception 'Permission denied'; end if;
  if v_batch.status not in ('staging','validating','review') then raise exception 'Import batch is not editable'; end if;

  update public.import_batches set status='validating',updated_at=now() where id=v_batch.id;

  for v_row in select * from public.import_rows where batch_id=v_batch.id order by row_number
  loop
    update public.import_rows
    set resolution='review',matched_entity_type=null,matched_entity_id=null,issues='[]'::jsonb,updated_at=now()
    where id=v_row.id;

    v_admission:=upper(btrim(coalesce(v_row.normalized_data->>'admission_number','')));
    v_subject_code:=upper(btrim(coalesce(v_row.normalized_data->>'subject_code','')));
    v_action:=lower(btrim(coalesce(nullif(v_row.normalized_data->>'action',''),'register')));
    begin
      v_year:=(v_row.normalized_data->>'academic_year')::integer;
    exception when others then
      v_year:=null;
    end;

    if v_admission='' then
      update public.import_rows set resolution='error',issues=jsonb_build_array(jsonb_build_object('level','error','field','admission_number','message','Admission number is required.')),updated_at=now() where id=v_row.id;
      v_error:=v_error+1; continue;
    end if;
    if v_subject_code='' then
      update public.import_rows set resolution='error',issues=jsonb_build_array(jsonb_build_object('level','error','field','subject_code','message','Subject code is required.')),updated_at=now() where id=v_row.id;
      v_error:=v_error+1; continue;
    end if;
    if v_year is null or v_year<2000 or v_year>2200 then
      update public.import_rows set resolution='error',issues=jsonb_build_array(jsonb_build_object('level','error','field','academic_year','message','A valid academic year is required.')),updated_at=now() where id=v_row.id;
      v_error:=v_error+1; continue;
    end if;
    if v_action not in ('register','withdraw') then
      update public.import_rows set resolution='error',issues=jsonb_build_array(jsonb_build_object('level','error','field','action','message','Action must be register or withdraw.')),updated_at=now() where id=v_row.id;
      v_error:=v_error+1; continue;
    end if;

    select sli.learner_id into v_learner_id
    from public.school_learner_identifiers sli
    where sli.school_id=v_batch.school_id and upper(btrim(sli.admission_number))=v_admission
    limit 1;
    if v_learner_id is null then
      update public.import_rows set resolution='error',issues=jsonb_build_array(jsonb_build_object('level','error','field','admission_number','message','No learner matches this school admission number.')),updated_at=now() where id=v_row.id;
      v_error:=v_error+1; continue;
    end if;

    select e.id,e.grade_id into v_enrolment_id,v_grade_id
    from public.enrolments e
    where e.school_id=v_batch.school_id and e.learner_id=v_learner_id and e.academic_year=v_year
    order by case when e.status='current' then 0 else 1 end,e.enrolled_from desc
    limit 1;
    if v_enrolment_id is null then
      update public.import_rows set resolution='error',issues=jsonb_build_array(jsonb_build_object('level','error','field','academic_year','message','No enrolment exists for this learner in the requested academic year.')),updated_at=now() where id=v_row.id;
      v_error:=v_error+1; continue;
    end if;
    if v_grade_id is null then
      update public.import_rows set resolution='error',issues=jsonb_build_array(jsonb_build_object('level','error','field','grade','message','Learner enrolment has no grade, so a subject offering cannot be resolved.')),updated_at=now() where id=v_row.id;
      v_error:=v_error+1; continue;
    end if;

    select s.id into v_subject_id
    from public.subjects s
    where s.school_id=v_batch.school_id and upper(btrim(s.subject_code))=v_subject_code
    limit 1;
    if v_subject_id is null then
      update public.import_rows set resolution='error',issues=jsonb_build_array(jsonb_build_object('level','error','field','subject_code','message','Subject code is not configured for this school.')),updated_at=now() where id=v_row.id;
      v_error:=v_error+1; continue;
    end if;

    select so.id into v_offering_id
    from public.subject_offerings so
    where so.school_id=v_batch.school_id
      and so.academic_year=v_year
      and so.subject_id=v_subject_id
      and so.grade_id=v_grade_id
      and so.status='active';
    if v_offering_id is null then
      update public.import_rows set resolution='error',issues=jsonb_build_array(jsonb_build_object('level','error','field','subject_code','message','No active subject offering exists for the learner grade and academic year.')),updated_at=now() where id=v_row.id;
      v_error:=v_error+1; continue;
    end if;

    select * into v_registration
    from public.learner_subject_registrations r
    where r.enrolment_id=v_enrolment_id and r.subject_offering_id=v_offering_id;

    update public.import_rows
    set normalized_data=normalized_data||jsonb_build_object(
          'academic_year',v_year,
          'admission_number',v_admission,
          'subject_code',v_subject_code,
          'action',v_action,
          'learner_id',v_learner_id,
          'enrolment_id',v_enrolment_id,
          'subject_offering_id',v_offering_id
        ),
        matched_entity_type='learner_subject_registration',
        matched_entity_id=case when v_registration.id is null then null else v_registration.id end,
        updated_at=now()
    where id=v_row.id;

    if v_action='register' then
      if v_registration.id is null then
        update public.import_rows set resolution='create' where id=v_row.id;
        v_register:=v_register+1;
      elsif v_registration.status='active' then
        update public.import_rows set resolution='skip' where id=v_row.id;
        v_skip:=v_skip+1;
      else
        update public.import_rows set resolution='update',issues=jsonb_build_array(jsonb_build_object('level','warning','field','action','message','Existing withdrawn subject registration will be reactivated.')) where id=v_row.id;
        v_reactivate:=v_reactivate+1;
      end if;
    else
      if v_registration.id is null or v_registration.status='withdrawn' then
        update public.import_rows set resolution='skip' where id=v_row.id;
        v_skip:=v_skip+1;
      else
        update public.import_rows set resolution='update',issues=jsonb_build_array(jsonb_build_object('level','warning','field','action','message','Existing active subject registration will be withdrawn.')) where id=v_row.id;
        v_withdraw:=v_withdraw+1;
      end if;
    end if;
  end loop;

  with keys as (
    select id,
      normalized_data->>'enrolment_id' enrolment_id,
      normalized_data->>'subject_offering_id' subject_offering_id
    from public.import_rows
    where batch_id=v_batch.id and resolution<>'error'
  ), dupes as (
    select enrolment_id,subject_offering_id from keys
    group by enrolment_id,subject_offering_id having count(*)>1
  )
  update public.import_rows r
  set resolution='error',matched_entity_type=null,matched_entity_id=null,
      issues=r.issues||jsonb_build_array(jsonb_build_object('level','error','field','subject_code','message','This learner and subject offering appears more than once in the import batch.')),
      updated_at=now()
  from keys k join dupes d on d.enrolment_id=k.enrolment_id and d.subject_offering_id=k.subject_offering_id
  where r.id=k.id;

  update public.import_batches b set
    total_rows=(select count(*) from public.import_rows r where r.batch_id=b.id),
    valid_rows=(select count(*) from public.import_rows r where r.batch_id=b.id and r.resolution in ('create','update','skip')),
    warning_rows=(select count(*) from public.import_rows r where r.batch_id=b.id and jsonb_array_length(r.issues)>0 and r.resolution<>'error'),
    error_rows=(select count(*) from public.import_rows r where r.batch_id=b.id and r.resolution='error'),
    status='review',updated_at=now()
  where b.id=v_batch.id;

  return jsonb_build_object(
    'register',v_register,
    'reactivate',v_reactivate,
    'withdraw',v_withdraw,
    'skip',v_skip,
    'error',(select count(*) from public.import_rows where batch_id=v_batch.id and resolution='error')
  );
end;
$$;

revoke all on function public.reconcile_subject_registration_import_batch(uuid) from public,anon;
grant execute on function public.reconcile_subject_registration_import_batch(uuid) to authenticated;

create or replace function public.commit_subject_registration_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_batch public.import_batches%rowtype;
  v_row public.import_rows%rowtype;
  v_action text;
  v_enrolment_id uuid;
  v_offering_id uuid;
  v_registration_id uuid;
  v_created integer:=0;
  v_updated integer:=0;
  v_skipped integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_batch from public.import_batches where id=p_batch_id for update;
  if not found then raise exception 'Import batch not found'; end if;
  if v_batch.import_type<>'subject_registrations' then raise exception 'This commit function only supports subject-registration imports'; end if;
  if not app_private.can_manage_learner_subject_registrations(v_batch.school_id) then raise exception 'Permission denied'; end if;
  if v_batch.status<>'ready' then raise exception 'Import batch must be ready before commit'; end if;
  if exists(select 1 from public.import_rows where batch_id=v_batch.id and resolution in ('review','error','link')) then
    raise exception 'Subject-registration import contains unresolved rows';
  end if;

  update public.import_batches set status='committing',updated_at=now() where id=v_batch.id;

  for v_row in select * from public.import_rows where batch_id=v_batch.id order by row_number
  loop
    v_action:=v_row.normalized_data->>'action';
    v_enrolment_id:=(v_row.normalized_data->>'enrolment_id')::uuid;
    v_offering_id:=(v_row.normalized_data->>'subject_offering_id')::uuid;

    if v_row.resolution='skip' then
      insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message)
      values(v_batch.id,v_row.id,'learner_subject_registration',v_row.matched_entity_id,'skipped','Subject registration already matches requested state');
      v_skipped:=v_skipped+1;
      continue;
    end if;

    if v_action='register' then
      v_registration_id:=public.register_learner_subject(v_enrolment_id,v_offering_id,'import');
      insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message)
      values(v_batch.id,v_row.id,'learner_subject_registration',v_registration_id,
        case when v_row.resolution='create' then 'created' else 'updated' end,
        case when v_row.resolution='create' then 'Subject registration created' else 'Subject registration reactivated' end);
      if v_row.resolution='create' then v_created:=v_created+1; else v_updated:=v_updated+1; end if;
    else
      if v_row.matched_entity_id is null then
        insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message)
        values(v_batch.id,v_row.id,'learner_subject_registration',null,'skipped','No active subject registration existed to withdraw');
        v_skipped:=v_skipped+1;
      else
        perform public.withdraw_learner_subject_registration(v_row.matched_entity_id,'Subject registration import');
        insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message)
        values(v_batch.id,v_row.id,'learner_subject_registration',v_row.matched_entity_id,'updated','Subject registration withdrawn');
        v_updated:=v_updated+1;
      end if;
    end if;
  end loop;

  update public.import_batches set status='completed',committed_at=now(),updated_at=now() where id=v_batch.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_batch.tenant_id,v_batch.school_id,auth.uid(),'import.subject_registrations.committed','import_batch',v_batch.id,
    jsonb_build_object('created',v_created,'updated',v_updated,'skipped',v_skipped));

  return jsonb_build_object('batch_id',v_batch.id,'created',v_created,'updated',v_updated,'skipped',v_skipped);
end;
$$;

revoke all on function public.commit_subject_registration_import_batch(uuid) from public,anon;
grant execute on function public.commit_subject_registration_import_batch(uuid) to authenticated;

comment on function public.reconcile_subject_registration_import_batch(uuid) is
'Validates one learner-subject action per row using stable school admission number, academic year and school subject code. It resolves the exact grade offering and never merges by learner name.';
comment on function public.commit_subject_registration_import_batch(uuid) is
'Atomically applies a ready subject-registration import through the canonical governed register/withdraw RPCs and records import commit/audit evidence.';
