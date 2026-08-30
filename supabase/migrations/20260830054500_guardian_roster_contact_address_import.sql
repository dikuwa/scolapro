-- Support real school guardian rosters where identity numbers are not always available.
-- Identity remains the strongest deterministic key. When it is absent, exact normalized
-- guardian name + current contact evidence may be used, with ambiguous existing matches
-- blocked for human review rather than guessed.

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
  v_first_names text;
  v_surname text;
  v_email text;
  v_mobile text;
  v_whatsapp text;
  v_home_phone text;
  v_work_phone text;
  v_learner_id uuid;
  v_guardian_id uuid;
  v_guardian_first_names text;
  v_guardian_surname text;
  v_contact_match_count bigint;
  v_create integer := 0;
  v_link integer := 0;
  v_review integer := 0;
  v_error integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_batch from public.import_batches where id=p_batch_id for update;
  if not found then raise exception 'Import batch not found'; end if;
  if v_batch.import_type <> 'guardians' then raise exception 'Only guardian batches can be reconciled'; end if;
  if not app_private.can_manage_school_imports(v_batch.school_id) then raise exception 'Permission denied'; end if;
  if v_batch.status not in ('staging','validating','review') then raise exception 'Import batch is not editable'; end if;

  update public.import_batches set status='validating',updated_at=now() where id=v_batch.id;

  for v_row in select * from public.import_rows where batch_id=v_batch.id order by row_number loop
    if v_row.resolution='error' then v_error:=v_error+1; continue; end if;
    if v_row.resolution='skip' then continue; end if;

    v_admission:=nullif(upper(btrim(coalesce(v_row.normalized_data->>'learner_admission_number',''))),'');
    v_identity:=nullif(lower(btrim(coalesce(v_row.normalized_data->>'identity_number',''))),'');
    v_first_names:=lower(regexp_replace(btrim(coalesce(v_row.normalized_data->>'first_names','')),'\s+',' ','g'));
    v_surname:=lower(regexp_replace(btrim(coalesce(v_row.normalized_data->>'surname','')),'\s+',' ','g'));
    v_email:=nullif(lower(btrim(coalesce(v_row.normalized_data->>'email',''))),'');
    v_mobile:=nullif(regexp_replace(coalesce(v_row.normalized_data->>'mobile',''),'[^0-9]+','','g'),'');
    v_whatsapp:=nullif(regexp_replace(coalesce(v_row.normalized_data->>'whatsapp',''),'[^0-9]+','','g'),'');
    v_home_phone:=nullif(regexp_replace(coalesce(v_row.normalized_data->>'home_phone',''),'[^0-9]+','','g'),'');
    v_work_phone:=nullif(regexp_replace(coalesce(v_row.normalized_data->>'work_phone',''),'[^0-9]+','','g'),'');
    v_learner_id:=null; v_guardian_id:=null; v_guardian_first_names:=null; v_guardian_surname:=null; v_contact_match_count:=0;

    if v_admission is null then
      update public.import_rows set resolution='error',matched_entity_type=null,matched_entity_id=null,
        issues=issues||jsonb_build_array(jsonb_build_object('level','error','field','learner_admission_number','message','Learner admission number is required for guardian import.')),updated_at=now()
      where id=v_row.id;
      v_error:=v_error+1; continue;
    end if;

    select sli.learner_id into v_learner_id
    from public.school_learner_identifiers sli
    where sli.school_id=v_batch.school_id and upper(btrim(sli.admission_number))=v_admission
    limit 1;
    if v_learner_id is null then
      update public.import_rows set resolution='error',matched_entity_type=null,matched_entity_id=null,
        issues=issues||jsonb_build_array(jsonb_build_object('level','error','field','learner_admission_number','message','No learner in this school matches the supplied admission number.')),updated_at=now()
      where id=v_row.id;
      v_error:=v_error+1; continue;
    end if;

    if v_identity is not null then
      select gp.id,
             lower(regexp_replace(btrim(gp.first_names),'\s+',' ','g')),
             lower(regexp_replace(btrim(gp.surname),'\s+',' ','g'))
      into v_guardian_id,v_guardian_first_names,v_guardian_surname
      from public.guardian_profiles gp
      where gp.tenant_id=v_batch.tenant_id and lower(btrim(gp.identity_number))=v_identity
      limit 1;

      if v_guardian_id is null then
        update public.import_rows set resolution='create',matched_entity_type='learner',matched_entity_id=v_learner_id,updated_at=now() where id=v_row.id;
        v_create:=v_create+1;
      elsif v_guardian_first_names<>v_first_names or v_guardian_surname<>v_surname then
        update public.import_rows set resolution='review',matched_entity_type='guardian',matched_entity_id=v_guardian_id,
          issues=issues||jsonb_build_array(jsonb_build_object('level','warning','field','identity_number','message','This identity number already belongs to a guardian whose recorded name differs from the file. Confirm the existing guardian rather than replacing identity data.')),updated_at=now()
        where id=v_row.id;
        v_review:=v_review+1;
      else
        update public.import_rows set resolution='link',matched_entity_type='guardian',matched_entity_id=v_guardian_id,
          issues=issues||jsonb_build_array(jsonb_build_object('level','warning','field','identity_number','message','Existing guardian identity matched exactly and will be reused for this learner relationship.')),updated_at=now()
        where id=v_row.id;
        v_link:=v_link+1;
      end if;
    else
      if v_email is null and v_mobile is null and v_whatsapp is null and v_home_phone is null and v_work_phone is null then
        update public.import_rows set resolution='error',matched_entity_type=null,matched_entity_id=null,
          issues=issues||jsonb_build_array(jsonb_build_object('level','error','field','contact','message','Guardian rows without an identity number require at least one contact value.')),updated_at=now()
        where id=v_row.id;
        v_error:=v_error+1; continue;
      end if;

      with candidates as (
        select distinct gp.id
        from public.guardian_profiles gp
        join public.guardian_contacts gc on gc.guardian_id=gp.id and gc.effective_to is null
        where gp.tenant_id=v_batch.tenant_id
          and lower(regexp_replace(btrim(gp.first_names),'\s+',' ','g'))=v_first_names
          and lower(regexp_replace(btrim(gp.surname),'\s+',' ','g'))=v_surname
          and (
            (v_email is not null and gc.contact_type='email' and lower(btrim(gc.contact_value))=v_email)
            or
            (gc.contact_type in ('mobile','phone','whatsapp') and regexp_replace(gc.contact_value,'[^0-9]+','','g') in (v_mobile,v_whatsapp,v_home_phone,v_work_phone))
          )
      )
      select count(*),min(id) into v_contact_match_count,v_guardian_id from candidates;

      if v_contact_match_count=0 then
        update public.import_rows set resolution='create',matched_entity_type='learner',matched_entity_id=v_learner_id,updated_at=now() where id=v_row.id;
        v_create:=v_create+1;
      elsif v_contact_match_count=1 then
        update public.import_rows set resolution='review',matched_entity_type='guardian',matched_entity_id=v_guardian_id,
          issues=issues||jsonb_build_array(jsonb_build_object('level','warning','field','contact','message','An existing guardian has the same name and contact details. Confirm this match before linking because no identity number was supplied.')),updated_at=now()
        where id=v_row.id;
        v_review:=v_review+1;
      else
        update public.import_rows set resolution='error',matched_entity_type=null,matched_entity_id=null,
          issues=issues||jsonb_build_array(jsonb_build_object('level','error','field','contact','message','Multiple guardians match the supplied name and contact evidence. Resolve this row manually; ScolaPro will not guess.')),updated_at=now()
        where id=v_row.id;
        v_error:=v_error+1;
      end if;
    end if;
  end loop;

  update public.import_batches b set
    total_rows=(select count(*) from public.import_rows r where r.batch_id=b.id),
    valid_rows=(select count(*) from public.import_rows r where r.batch_id=b.id and r.resolution in ('create','link','skip')),
    warning_rows=(select count(*) from public.import_rows r where r.batch_id=b.id and jsonb_array_length(r.issues)>0 and r.resolution<>'error'),
    error_rows=(select count(*) from public.import_rows r where r.batch_id=b.id and r.resolution='error'),
    status='review',updated_at=now()
  where b.id=v_batch.id;

  return jsonb_build_object('create',v_create,'link',v_link,'review',v_review,'error',v_error);
end;
$$;

revoke all on function public.reconcile_guardian_import_batch(uuid) from public,anon;
grant execute on function public.reconcile_guardian_import_batch(uuid) to authenticated;

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
  v_identity text;
  v_first_names text;
  v_surname text;
  v_email text;
  v_mobile text;
  v_whatsapp text;
  v_home_phone text;
  v_work_phone text;
  v_match_count bigint;
  v_existing boolean;
  v_created integer:=0;
  v_linked integer:=0;
  v_skipped integer:=0;
  v_address_type text;
  v_address_value text;
  v_address_primary boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_batch from public.import_batches where id=p_batch_id for update;
  if not found then raise exception 'Import batch not found'; end if;
  if v_batch.import_type<>'guardians' then raise exception 'This commit function only supports guardian imports'; end if;
  if not app_private.has_school_role(v_batch.school_id,array['school_admin']) and not app_private.has_platform_role(array['platform_admin']) then raise exception 'Only a school administrator can commit guardian imports'; end if;
  if v_batch.status<>'ready' then raise exception 'Import batch must be ready before commit'; end if;
  if exists(select 1 from public.import_rows where batch_id=v_batch.id and resolution in ('review','error','update')) then raise exception 'Guardian import contains unresolved rows'; end if;

  update public.import_batches set status='committing',updated_at=now() where id=v_batch.id;

  for v_row in select * from public.import_rows where batch_id=v_batch.id order by row_number loop
    if v_row.resolution='skip' then
      insert into public.import_commit_results(batch_id,import_row_id,outcome,message)
      values(v_batch.id,v_row.id,'skipped','Skipped during guardian import review') on conflict(import_row_id) do nothing;
      v_skipped:=v_skipped+1; continue;
    end if;

    select sli.learner_id into v_learner_id
    from public.school_learner_identifiers sli
    where sli.school_id=v_batch.school_id and upper(btrim(sli.admission_number))=upper(btrim(v_row.normalized_data->>'learner_admission_number'))
    limit 1;
    if v_learner_id is null then raise exception 'Learner for row % can no longer be resolved',v_row.row_number; end if;

    v_guardian_id:=case when v_row.resolution='link' then v_row.matched_entity_id else null end;
    v_identity:=nullif(lower(btrim(coalesce(v_row.normalized_data->>'identity_number',''))),'');
    v_first_names:=lower(regexp_replace(btrim(coalesce(v_row.normalized_data->>'first_names','')),'\s+',' ','g'));
    v_surname:=lower(regexp_replace(btrim(coalesce(v_row.normalized_data->>'surname','')),'\s+',' ','g'));
    v_email:=nullif(lower(btrim(coalesce(v_row.normalized_data->>'email',''))),'');
    v_mobile:=nullif(regexp_replace(coalesce(v_row.normalized_data->>'mobile',''),'[^0-9]+','','g'),'');
    v_whatsapp:=nullif(regexp_replace(coalesce(v_row.normalized_data->>'whatsapp',''),'[^0-9]+','','g'),'');
    v_home_phone:=nullif(regexp_replace(coalesce(v_row.normalized_data->>'home_phone',''),'[^0-9]+','','g'),'');
    v_work_phone:=nullif(regexp_replace(coalesce(v_row.normalized_data->>'work_phone',''),'[^0-9]+','','g'),'');
    v_existing:=v_guardian_id is not null;

    if v_guardian_id is null and v_identity is not null then
      select gp.id into v_guardian_id from public.guardian_profiles gp
      where gp.tenant_id=v_batch.tenant_id and lower(btrim(gp.identity_number))=v_identity limit 1;
      v_existing:=v_guardian_id is not null;
    end if;

    -- A previous sibling row in this same batch may have created the guardian.
    -- Reuse it only when name + current contact evidence identify one guardian exactly.
    if v_guardian_id is null and v_identity is null then
      with candidates as (
        select distinct gp.id
        from public.guardian_profiles gp
        join public.guardian_contacts gc on gc.guardian_id=gp.id and gc.effective_to is null
        where gp.tenant_id=v_batch.tenant_id
          and lower(regexp_replace(btrim(gp.first_names),'\s+',' ','g'))=v_first_names
          and lower(regexp_replace(btrim(gp.surname),'\s+',' ','g'))=v_surname
          and (
            (v_email is not null and gc.contact_type='email' and lower(btrim(gc.contact_value))=v_email)
            or
            (gc.contact_type in ('mobile','phone','whatsapp') and regexp_replace(gc.contact_value,'[^0-9]+','','g') in (v_mobile,v_whatsapp,v_home_phone,v_work_phone))
          )
      )
      select count(*),min(id) into v_match_count,v_guardian_id from candidates;
      if v_match_count>1 then raise exception 'Guardian contact match became ambiguous for row %',v_row.row_number; end if;
      v_existing:=v_guardian_id is not null;
    end if;

    v_contacts:='[]'::jsonb;
    if v_email is not null then v_contacts:=v_contacts||jsonb_build_array(jsonb_build_object('type','email','value',btrim(v_row.normalized_data->>'email'),'primary',true)); end if;
    if v_mobile is not null then v_contacts:=v_contacts||jsonb_build_array(jsonb_build_object('type','mobile','value',btrim(v_row.normalized_data->>'mobile'),'primary',true)); end if;
    if v_whatsapp is not null then v_contacts:=v_contacts||jsonb_build_array(jsonb_build_object('type','whatsapp','value',btrim(v_row.normalized_data->>'whatsapp'),'primary',true)); end if;
    if v_home_phone is not null then v_contacts:=v_contacts||jsonb_build_array(jsonb_build_object('type','phone','label','Home','value',btrim(v_row.normalized_data->>'home_phone'),'primary',false)); end if;
    if v_work_phone is not null then v_contacts:=v_contacts||jsonb_build_array(jsonb_build_object('type','phone','label','Work','value',btrim(v_row.normalized_data->>'work_phone'),'primary',false)); end if;

    v_guardian_id:=public.upsert_guardian_relationship(
      v_learner_id,v_guardian_id,
      case when v_existing then null else nullif(btrim(v_row.normalized_data->>'first_names'),'') end,
      case when v_existing then null else nullif(btrim(v_row.normalized_data->>'surname'),'') end,
      case when v_existing then null else nullif(btrim(v_row.normalized_data->>'preferred_name'),'') end,
      case when v_existing then null else nullif(btrim(v_row.normalized_data->>'identity_number'),'') end,
      coalesce(nullif(lower(btrim(v_row.normalized_data->>'relationship_type')),''),'parent'),
      coalesce((v_row.normalized_data->>'is_legal_guardian')::boolean,false),
      coalesce((v_row.normalized_data->>'is_emergency_contact')::boolean,false),
      coalesce((v_row.normalized_data->>'is_pickup_authorized')::boolean,false),
      coalesce(nullif(v_row.normalized_data->>'priority','')::smallint,1::smallint)::smallint,
      v_contacts
    );

    foreach v_address_type in array array['physical','postal','work'] loop
      v_address_value:=case v_address_type
        when 'physical' then nullif(btrim(coalesce(v_row.normalized_data->>'physical_address','')),'')
        when 'postal' then nullif(btrim(coalesce(v_row.normalized_data->>'postal_address','')),'')
        when 'work' then nullif(btrim(coalesce(v_row.normalized_data->>'work_address','')),'')
      end;
      if v_address_value is null then continue; end if;
      if exists(select 1 from public.guardian_addresses ga where ga.guardian_id=v_guardian_id and ga.address_type=v_address_type and lower(btrim(ga.address_line_1))=lower(v_address_value) and ga.effective_to is null) then continue; end if;
      v_address_primary:=not exists(select 1 from public.guardian_addresses ga where ga.guardian_id=v_guardian_id and ga.address_type=v_address_type and ga.is_primary and ga.effective_to is null);
      insert into public.guardian_addresses(tenant_id,guardian_id,address_type,label,address_line_1,country,is_primary,created_by_user_id)
      values(v_batch.tenant_id,v_guardian_id,v_address_type,initcap(v_address_type),v_address_value,'Namibia',v_address_primary,auth.uid());
    end loop;

    insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message)
    values(v_batch.id,v_row.id,'guardian',v_guardian_id,
      case when v_existing then 'linked' else 'created' end,
      case when v_existing then 'Linked existing guardian to learner' else 'Created guardian and learner relationship' end);

    update public.import_rows set resolution=case when v_existing then 'link' else 'create' end,
      matched_entity_type='guardian',matched_entity_id=v_guardian_id,updated_at=now() where id=v_row.id;

    if v_existing then v_linked:=v_linked+1; else v_created:=v_created+1; end if;
  end loop;

  update public.import_batches set status='completed',committed_at=now(),updated_at=now() where id=v_batch.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_batch.tenant_id,v_batch.school_id,auth.uid(),'import.guardians.committed','import_batch',v_batch.id,
    jsonb_build_object('created',v_created,'linked',v_linked,'skipped',v_skipped,'total_rows',v_batch.total_rows,'addresses_supported',true));
  return jsonb_build_object('batch_id',v_batch.id,'created',v_created,'linked',v_linked,'skipped',v_skipped);
end;
$$;

revoke all on function public.commit_guardian_import_batch(uuid) from public,anon;
grant execute on function public.commit_guardian_import_batch(uuid) to authenticated;

comment on function public.reconcile_guardian_import_batch(uuid) is
'Reconciles guardian imports using identity when available, otherwise exact normalized name plus contact evidence. Ambiguous contact matches fail closed for manual resolution.';
comment on function public.commit_guardian_import_batch(uuid) is
'Commits many-to-many guardian relationships, reuses sibling guardians safely, imports contact details and structured physical/postal/work addresses, and preserves existing guardian identity data.';
