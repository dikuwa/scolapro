-- Deterministic guardian relationship import.
-- Learners are resolved by school admission number and guardians by identity number.
-- Names alone never merge guardian identities.

create or replace function public.reconcile_guardian_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_batch public.import_batches%rowtype;
  v_row public.import_rows%rowtype;
  v_admission text;
  v_identity text;
  v_learner_id uuid;
  v_guardian_id uuid;
  v_create integer := 0;
  v_link integer := 0;
  v_error integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_batch from public.import_batches where id = p_batch_id for update;
  if not found then raise exception 'Import batch not found'; end if;
  if v_batch.import_type <> 'guardians' then raise exception 'Only guardian batches can be reconciled'; end if;
  if not app_private.can_manage_school_imports(v_batch.school_id) then raise exception 'Permission denied'; end if;
  if v_batch.status not in ('staging','validating','review') then raise exception 'Import batch is not editable'; end if;

  update public.import_batches set status = 'validating', updated_at = now() where id = v_batch.id;

  for v_row in select * from public.import_rows where batch_id = v_batch.id order by row_number
  loop
    if v_row.resolution = 'error' then v_error := v_error + 1; continue; end if;
    if v_row.resolution = 'skip' then continue; end if;

    v_admission := nullif(upper(btrim(coalesce(v_row.normalized_data->>'learner_admission_number',''))), '');
    v_identity := nullif(lower(btrim(coalesce(v_row.normalized_data->>'identity_number',''))), '');
    v_learner_id := null;
    v_guardian_id := null;

    if v_admission is null then
      update public.import_rows set resolution='error', matched_entity_type=null, matched_entity_id=null,
        issues = issues || jsonb_build_array(jsonb_build_object('level','error','field','learner_admission_number','message','Learner admission number is required for deterministic guardian import.')), updated_at=now()
      where id=v_row.id;
      v_error := v_error + 1;
      continue;
    end if;
    if v_identity is null then
      update public.import_rows set resolution='error', matched_entity_type=null, matched_entity_id=null,
        issues = issues || jsonb_build_array(jsonb_build_object('level','error','field','identity_number','message','Guardian identity number is required for deterministic bulk matching. Use the learner profile for guardians without a stable identity number.')), updated_at=now()
      where id=v_row.id;
      v_error := v_error + 1;
      continue;
    end if;

    select sli.learner_id into v_learner_id
    from public.school_learner_identifiers sli
    where sli.school_id=v_batch.school_id and upper(btrim(sli.admission_number))=v_admission
    limit 1;
    if v_learner_id is null then
      update public.import_rows set resolution='error', matched_entity_type=null, matched_entity_id=null,
        issues = issues || jsonb_build_array(jsonb_build_object('level','error','field','learner_admission_number','message','No learner in this school matches the supplied admission number.')), updated_at=now()
      where id=v_row.id;
      v_error := v_error + 1;
      continue;
    end if;

    select gp.id into v_guardian_id
    from public.guardian_profiles gp
    where gp.tenant_id=v_batch.tenant_id and lower(btrim(gp.identity_number))=v_identity
    limit 1;

    if v_guardian_id is null then
      update public.import_rows set resolution='create', matched_entity_type='learner', matched_entity_id=v_learner_id, updated_at=now() where id=v_row.id;
      v_create := v_create + 1;
    else
      update public.import_rows set resolution='link', matched_entity_type='guardian', matched_entity_id=v_guardian_id,
        issues = issues || jsonb_build_array(jsonb_build_object('level','warning','field','identity_number','message','Existing guardian identity matched exactly and will be reused for this learner relationship.')), updated_at=now()
      where id=v_row.id;
      v_link := v_link + 1;
    end if;
  end loop;

  update public.import_batches b set
    total_rows=(select count(*) from public.import_rows r where r.batch_id=b.id),
    valid_rows=(select count(*) from public.import_rows r where r.batch_id=b.id and r.resolution in ('create','link','skip')),
    warning_rows=(select count(*) from public.import_rows r where r.batch_id=b.id and jsonb_array_length(r.issues)>0 and r.resolution<>'error'),
    error_rows=(select count(*) from public.import_rows r where r.batch_id=b.id and r.resolution='error'),
    status='review', updated_at=now()
  where b.id=v_batch.id;

  return jsonb_build_object('create',v_create,'link',v_link,'error',v_error);
end;
$$;

create or replace function public.commit_guardian_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_batch public.import_batches%rowtype;
  v_row public.import_rows%rowtype;
  v_learner_id uuid;
  v_guardian_id uuid;
  v_contacts jsonb;
  v_created integer := 0;
  v_linked integer := 0;
  v_skipped integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_batch from public.import_batches where id=p_batch_id for update;
  if not found then raise exception 'Import batch not found'; end if;
  if v_batch.import_type <> 'guardians' then raise exception 'This commit function only supports guardian imports'; end if;
  if not app_private.has_school_role(v_batch.school_id,array['school_admin']) and not app_private.has_platform_role(array['platform_admin']) then raise exception 'Only a school administrator can commit guardian imports'; end if;
  if v_batch.status <> 'ready' then raise exception 'Import batch must be ready before commit'; end if;
  if exists(select 1 from public.import_rows where batch_id=v_batch.id and resolution in ('review','error','update')) then raise exception 'Guardian import contains unresolved rows'; end if;

  update public.import_batches set status='committing',updated_at=now() where id=v_batch.id;

  for v_row in select * from public.import_rows where batch_id=v_batch.id order by row_number
  loop
    if v_row.resolution='skip' then
      insert into public.import_commit_results(batch_id,import_row_id,outcome,message)
      values(v_batch.id,v_row.id,'skipped','Skipped during guardian import review') on conflict(import_row_id) do nothing;
      v_skipped := v_skipped + 1;
      continue;
    end if;

    select sli.learner_id into v_learner_id
    from public.school_learner_identifiers sli
    where sli.school_id=v_batch.school_id
      and upper(btrim(sli.admission_number))=upper(btrim(v_row.normalized_data->>'learner_admission_number'))
    limit 1;
    if v_learner_id is null then raise exception 'Learner for row % can no longer be resolved',v_row.row_number; end if;

    v_guardian_id := case when v_row.resolution='link' then v_row.matched_entity_id else null end;
    v_contacts := '[]'::jsonb;
    if nullif(btrim(coalesce(v_row.normalized_data->>'email','')),'') is not null then
      v_contacts := v_contacts || jsonb_build_array(jsonb_build_object('type','email','value',btrim(v_row.normalized_data->>'email'),'primary',true));
    end if;
    if nullif(btrim(coalesce(v_row.normalized_data->>'mobile','')),'') is not null then
      v_contacts := v_contacts || jsonb_build_array(jsonb_build_object('type','mobile','value',btrim(v_row.normalized_data->>'mobile'),'primary',true));
    end if;
    if nullif(btrim(coalesce(v_row.normalized_data->>'whatsapp','')),'') is not null then
      v_contacts := v_contacts || jsonb_build_array(jsonb_build_object('type','whatsapp','value',btrim(v_row.normalized_data->>'whatsapp'),'primary',true));
    end if;

    v_guardian_id := public.upsert_guardian_relationship(
      v_learner_id,
      v_guardian_id,
      nullif(btrim(v_row.normalized_data->>'first_names'),''),
      nullif(btrim(v_row.normalized_data->>'surname'),''),
      nullif(btrim(v_row.normalized_data->>'preferred_name'),''),
      nullif(btrim(v_row.normalized_data->>'identity_number'),''),
      coalesce(nullif(lower(btrim(v_row.normalized_data->>'relationship_type')),''),'guardian'),
      coalesce((v_row.normalized_data->>'is_legal_guardian')::boolean,false),
      coalesce((v_row.normalized_data->>'is_emergency_contact')::boolean,false),
      coalesce((v_row.normalized_data->>'is_pickup_authorized')::boolean,false),
      coalesce(nullif(v_row.normalized_data->>'priority','')::smallint,1),
      v_contacts
    );

    insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message)
    values(v_batch.id,v_row.id,'guardian',v_guardian_id,case when v_row.resolution='link' then 'linked' else 'created' end,
      case when v_row.resolution='link' then 'Linked existing guardian to learner' else 'Created guardian and learner relationship' end);
    update public.import_rows set matched_entity_type='guardian',matched_entity_id=v_guardian_id,updated_at=now() where id=v_row.id;
    if v_row.resolution='link' then v_linked := v_linked + 1; else v_created := v_created + 1; end if;
  end loop;

  update public.import_batches set status='completed',committed_at=now(),updated_at=now() where id=v_batch.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_batch.tenant_id,v_batch.school_id,auth.uid(),'import.guardians.committed','import_batch',v_batch.id,
    jsonb_build_object('created',v_created,'linked',v_linked,'skipped',v_skipped,'total_rows',v_batch.total_rows));
  return jsonb_build_object('batch_id',v_batch.id,'created',v_created,'linked',v_linked,'skipped',v_skipped);
end;
$$;

revoke all on function public.reconcile_guardian_import_batch(uuid) from public, anon;
grant execute on function public.reconcile_guardian_import_batch(uuid) to authenticated;
revoke all on function public.commit_guardian_import_batch(uuid) from public, anon;
grant execute on function public.commit_guardian_import_batch(uuid) to authenticated;

comment on function public.reconcile_guardian_import_batch(uuid) is 'Reconciles guardian import rows by school learner admission number and tenant guardian identity number. Names alone never merge guardian identities.';
