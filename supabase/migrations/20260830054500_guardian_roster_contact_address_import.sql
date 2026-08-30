-- Support real school guardian rosters where identity numbers are not always available.
-- Identity remains the strongest deterministic key. Without identity, ScolaPro only
-- considers exact normalized guardian name + current contact evidence, and refuses
-- ambiguous matches instead of guessing.

create or replace function app_private.guardian_import_contact_matches(
  p_tenant_id uuid,
  p_first_names text,
  p_surname text,
  p_email text,
  p_phones text[]
)
returns uuid[]
language sql
stable
security definer
set search_path=public,app_private
as $$
  select coalesce(array_agg(distinct gp.id order by gp.id),'{}'::uuid[])
  from public.guardian_profiles gp
  join public.guardian_contacts gc on gc.guardian_id=gp.id and gc.effective_to is null
  where gp.tenant_id=p_tenant_id
    and lower(regexp_replace(btrim(gp.first_names),'\s+',' ','g'))=lower(regexp_replace(btrim(coalesce(p_first_names,'')),'\s+',' ','g'))
    and lower(regexp_replace(btrim(gp.surname),'\s+',' ','g'))=lower(regexp_replace(btrim(coalesce(p_surname,'')),'\s+',' ','g'))
    and (
      (p_email is not null and gc.contact_type='email' and lower(btrim(gc.contact_value))=lower(btrim(p_email)))
      or
      (gc.contact_type in ('mobile','phone','whatsapp') and regexp_replace(gc.contact_value,'[^0-9]+','','g')=any(coalesce(p_phones,'{}'::text[])))
    );
$$;
revoke all on function app_private.guardian_import_contact_matches(uuid,text,text,text,text[]) from public,anon,authenticated;

create or replace function public.reconcile_guardian_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  b public.import_batches%rowtype;
  r public.import_rows%rowtype;
  learner_id uuid;
  guardian_id uuid;
  matches uuid[];
  admission text;
  identity_value text;
  first_value text;
  surname_value text;
  email_value text;
  phones text[];
  existing_first text;
  existing_surname text;
  n_create int:=0; n_link int:=0; n_review int:=0; n_error int:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into b from public.import_batches where id=p_batch_id for update;
  if not found then raise exception 'Import batch not found'; end if;
  if b.import_type<>'guardians' then raise exception 'Only guardian batches can be reconciled'; end if;
  if not app_private.can_manage_school_imports(b.school_id) then raise exception 'Permission denied'; end if;
  if b.status not in ('staging','validating','review') then raise exception 'Import batch is not editable'; end if;
  update public.import_batches set status='validating',updated_at=now() where id=b.id;

  for r in select * from public.import_rows where batch_id=b.id order by row_number loop
    if r.resolution='error' then n_error:=n_error+1; continue; end if;
    if r.resolution='skip' then continue; end if;

    admission:=nullif(upper(btrim(coalesce(r.normalized_data->>'learner_admission_number',''))),'');
    identity_value:=nullif(lower(btrim(coalesce(r.normalized_data->>'identity_number',''))),'');
    first_value:=btrim(coalesce(r.normalized_data->>'first_names',''));
    surname_value:=btrim(coalesce(r.normalized_data->>'surname',''));
    email_value:=nullif(lower(btrim(coalesce(r.normalized_data->>'email',''))),'');
    phones:=array_remove(array[
      nullif(regexp_replace(coalesce(r.normalized_data->>'mobile',''),'[^0-9]+','','g'),''),
      nullif(regexp_replace(coalesce(r.normalized_data->>'whatsapp',''),'[^0-9]+','','g'),''),
      nullif(regexp_replace(coalesce(r.normalized_data->>'home_phone',''),'[^0-9]+','','g'),''),
      nullif(regexp_replace(coalesce(r.normalized_data->>'work_phone',''),'[^0-9]+','','g'),'')
    ],null);

    if admission is null then
      update public.import_rows set resolution='error',matched_entity_type=null,matched_entity_id=null,
        issues=issues||jsonb_build_array(jsonb_build_object('level','error','field','learner_admission_number','message','Learner admission number is required for guardian import.')),updated_at=now() where id=r.id;
      n_error:=n_error+1; continue;
    end if;

    select sli.learner_id into learner_id from public.school_learner_identifiers sli
    where sli.school_id=b.school_id and upper(btrim(sli.admission_number))=admission limit 1;
    if learner_id is null then
      update public.import_rows set resolution='error',matched_entity_type=null,matched_entity_id=null,
        issues=issues||jsonb_build_array(jsonb_build_object('level','error','field','learner_admission_number','message','No learner in this school matches the supplied admission number.')),updated_at=now() where id=r.id;
      n_error:=n_error+1; continue;
    end if;

    if identity_value is not null then
      select gp.id,gp.first_names,gp.surname into guardian_id,existing_first,existing_surname
      from public.guardian_profiles gp where gp.tenant_id=b.tenant_id and lower(btrim(gp.identity_number))=identity_value limit 1;
      if guardian_id is null then
        update public.import_rows set resolution='create',matched_entity_type='learner',matched_entity_id=learner_id,updated_at=now() where id=r.id; n_create:=n_create+1;
      elsif lower(regexp_replace(btrim(existing_first),'\s+',' ','g'))<>lower(regexp_replace(first_value,'\s+',' ','g'))
         or lower(regexp_replace(btrim(existing_surname),'\s+',' ','g'))<>lower(regexp_replace(surname_value,'\s+',' ','g')) then
        update public.import_rows set resolution='review',matched_entity_type='guardian',matched_entity_id=guardian_id,
          issues=issues||jsonb_build_array(jsonb_build_object('level','warning','field','identity_number','message','This identity number belongs to an existing guardian with a different recorded name. Confirm the existing guardian; identity data will not be overwritten.')),updated_at=now() where id=r.id; n_review:=n_review+1;
      else
        update public.import_rows set resolution='link',matched_entity_type='guardian',matched_entity_id=guardian_id,updated_at=now() where id=r.id; n_link:=n_link+1;
      end if;
    else
      if email_value is null and cardinality(phones)=0 then
        update public.import_rows set resolution='error',matched_entity_type=null,matched_entity_id=null,
          issues=issues||jsonb_build_array(jsonb_build_object('level','error','field','contact','message','Without an identity number, provide at least one email or phone contact.')),updated_at=now() where id=r.id; n_error:=n_error+1; continue;
      end if;
      matches:=app_private.guardian_import_contact_matches(b.tenant_id,first_value,surname_value,email_value,phones);
      if cardinality(matches)=0 then
        update public.import_rows set resolution='create',matched_entity_type='learner',matched_entity_id=learner_id,updated_at=now() where id=r.id; n_create:=n_create+1;
      elsif cardinality(matches)=1 then
        update public.import_rows set resolution='review',matched_entity_type='guardian',matched_entity_id=matches[1],
          issues=issues||jsonb_build_array(jsonb_build_object('level','warning','field','contact','message','An existing guardian has the same name and contact evidence. Confirm the match because no identity number was supplied.')),updated_at=now() where id=r.id; n_review:=n_review+1;
      else
        update public.import_rows set resolution='error',matched_entity_type=null,matched_entity_id=null,
          issues=issues||jsonb_build_array(jsonb_build_object('level','error','field','contact','message','Multiple guardians match this name and contact evidence. Resolve manually; ScolaPro will not guess.')),updated_at=now() where id=r.id; n_error:=n_error+1;
      end if;
    end if;
  end loop;

  update public.import_batches x set
    total_rows=(select count(*) from public.import_rows q where q.batch_id=x.id),
    valid_rows=(select count(*) from public.import_rows q where q.batch_id=x.id and q.resolution in ('create','link','skip')),
    warning_rows=(select count(*) from public.import_rows q where q.batch_id=x.id and jsonb_array_length(q.issues)>0 and q.resolution<>'error'),
    error_rows=(select count(*) from public.import_rows q where q.batch_id=x.id and q.resolution='error'),
    status='review',updated_at=now() where x.id=b.id;
  return jsonb_build_object('create',n_create,'link',n_link,'review',n_review,'error',n_error);
end;
$$;
revoke all on function public.reconcile_guardian_import_batch(uuid) from public,anon;
grant execute on function public.reconcile_guardian_import_batch(uuid) to authenticated;

create or replace function public.commit_guardian_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  b public.import_batches%rowtype;
  r public.import_rows%rowtype;
  learner_id uuid; guardian_id uuid; matches uuid[]; contacts jsonb;
  identity_value text; first_value text; surname_value text; email_value text; phones text[];
  existing boolean; created_count int:=0; linked_count int:=0; skipped_count int:=0;
  address_type text; address_value text; address_primary boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into b from public.import_batches where id=p_batch_id for update;
  if not found then raise exception 'Import batch not found'; end if;
  if b.import_type<>'guardians' then raise exception 'This commit function only supports guardian imports'; end if;
  if not app_private.has_school_role(b.school_id,array['school_admin']) and not app_private.has_platform_role(array['platform_admin']) then raise exception 'Only a school administrator can commit guardian imports'; end if;
  if b.status<>'ready' then raise exception 'Import batch must be ready before commit'; end if;
  if exists(select 1 from public.import_rows where batch_id=b.id and resolution in ('review','error','update')) then raise exception 'Guardian import contains unresolved rows'; end if;
  update public.import_batches set status='committing',updated_at=now() where id=b.id;

  for r in select * from public.import_rows where batch_id=b.id order by row_number loop
    if r.resolution='skip' then
      insert into public.import_commit_results(batch_id,import_row_id,outcome,message) values(b.id,r.id,'skipped','Skipped during guardian import review') on conflict(import_row_id) do nothing;
      skipped_count:=skipped_count+1; continue;
    end if;
    select sli.learner_id into learner_id from public.school_learner_identifiers sli
    where sli.school_id=b.school_id and upper(btrim(sli.admission_number))=upper(btrim(r.normalized_data->>'learner_admission_number')) limit 1;
    if learner_id is null then raise exception 'Learner for row % can no longer be resolved',r.row_number; end if;

    guardian_id:=case when r.resolution='link' then r.matched_entity_id else null end;
    identity_value:=nullif(lower(btrim(coalesce(r.normalized_data->>'identity_number',''))),'');
    first_value:=btrim(coalesce(r.normalized_data->>'first_names',''));
    surname_value:=btrim(coalesce(r.normalized_data->>'surname',''));
    email_value:=nullif(lower(btrim(coalesce(r.normalized_data->>'email',''))),'');
    phones:=array_remove(array[
      nullif(regexp_replace(coalesce(r.normalized_data->>'mobile',''),'[^0-9]+','','g'),''),
      nullif(regexp_replace(coalesce(r.normalized_data->>'whatsapp',''),'[^0-9]+','','g'),''),
      nullif(regexp_replace(coalesce(r.normalized_data->>'home_phone',''),'[^0-9]+','','g'),''),
      nullif(regexp_replace(coalesce(r.normalized_data->>'work_phone',''),'[^0-9]+','','g'),'')
    ],null);
    existing:=guardian_id is not null;

    if guardian_id is null and identity_value is not null then
      select gp.id into guardian_id from public.guardian_profiles gp where gp.tenant_id=b.tenant_id and lower(btrim(gp.identity_number))=identity_value limit 1;
      existing:=guardian_id is not null;
    elsif guardian_id is null then
      matches:=app_private.guardian_import_contact_matches(b.tenant_id,first_value,surname_value,email_value,phones);
      if cardinality(matches)>1 then raise exception 'Guardian contact match became ambiguous for row %',r.row_number; end if;
      if cardinality(matches)=1 then guardian_id:=matches[1]; existing:=true; end if;
    end if;

    contacts:='[]'::jsonb;
    if email_value is not null then contacts:=contacts||jsonb_build_array(jsonb_build_object('type','email','value',r.normalized_data->>'email','primary',true)); end if;
    if nullif(btrim(coalesce(r.normalized_data->>'mobile','')),'') is not null then contacts:=contacts||jsonb_build_array(jsonb_build_object('type','mobile','value',r.normalized_data->>'mobile','primary',true)); end if;
    if nullif(btrim(coalesce(r.normalized_data->>'whatsapp','')),'') is not null then contacts:=contacts||jsonb_build_array(jsonb_build_object('type','whatsapp','value',r.normalized_data->>'whatsapp','primary',true)); end if;
    if nullif(btrim(coalesce(r.normalized_data->>'home_phone','')),'') is not null then contacts:=contacts||jsonb_build_array(jsonb_build_object('type','phone','label','Home','value',r.normalized_data->>'home_phone','primary',false)); end if;
    if nullif(btrim(coalesce(r.normalized_data->>'work_phone','')),'') is not null then contacts:=contacts||jsonb_build_array(jsonb_build_object('type','phone','label','Work','value',r.normalized_data->>'work_phone','primary',false)); end if;

    guardian_id:=public.upsert_guardian_relationship(
      learner_id,guardian_id,
      case when existing then null else first_value end,
      case when existing then null else surname_value end,
      case when existing then null else nullif(btrim(coalesce(r.normalized_data->>'preferred_name','')),'') end,
      case when existing then null else nullif(btrim(coalesce(r.normalized_data->>'identity_number','')),'') end,
      coalesce(nullif(lower(btrim(r.normalized_data->>'relationship_type')),''),'parent'),
      coalesce((r.normalized_data->>'is_legal_guardian')::boolean,false),
      coalesce((r.normalized_data->>'is_emergency_contact')::boolean,false),
      coalesce((r.normalized_data->>'is_pickup_authorized')::boolean,false),
      coalesce(nullif(r.normalized_data->>'priority','')::smallint,1::smallint),contacts);

    foreach address_type in array array['physical','postal','work'] loop
      address_value:=case address_type when 'physical' then nullif(btrim(coalesce(r.normalized_data->>'physical_address','')),'') when 'postal' then nullif(btrim(coalesce(r.normalized_data->>'postal_address','')),'') else nullif(btrim(coalesce(r.normalized_data->>'work_address','')),'') end;
      if address_value is null then continue; end if;
      if exists(select 1 from public.guardian_addresses ga where ga.guardian_id=guardian_id and ga.address_type=address_type and lower(btrim(ga.address_line_1))=lower(address_value) and ga.effective_to is null) then continue; end if;
      address_primary:=not exists(select 1 from public.guardian_addresses ga where ga.guardian_id=guardian_id and ga.address_type=address_type and ga.is_primary and ga.effective_to is null);
      insert into public.guardian_addresses(tenant_id,guardian_id,address_type,label,address_line_1,country,is_primary,created_by_user_id)
      values(b.tenant_id,guardian_id,address_type,initcap(address_type),address_value,'Namibia',address_primary,auth.uid());
    end loop;

    insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message)
    values(b.id,r.id,'guardian',guardian_id,case when existing then 'linked' else 'created' end,case when existing then 'Linked existing guardian to learner' else 'Created guardian and learner relationship' end);
    update public.import_rows set resolution=case when existing then 'link' else 'create' end,matched_entity_type='guardian',matched_entity_id=guardian_id,updated_at=now() where id=r.id;
    if existing then linked_count:=linked_count+1; else created_count:=created_count+1; end if;
  end loop;

  update public.import_batches set status='completed',committed_at=now(),updated_at=now() where id=b.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(b.tenant_id,b.school_id,auth.uid(),'import.guardians.committed','import_batch',b.id,jsonb_build_object('created',created_count,'linked',linked_count,'skipped',skipped_count,'addresses_supported',true));
  return jsonb_build_object('batch_id',b.id,'created',created_count,'linked',linked_count,'skipped',skipped_count);
end;
$$;
revoke all on function public.commit_guardian_import_batch(uuid) from public,anon;
grant execute on function public.commit_guardian_import_batch(uuid) to authenticated;

comment on function public.reconcile_guardian_import_batch(uuid) is 'Uses guardian identity when available; otherwise exact name plus contact evidence. Ambiguous matches fail closed for manual review.';
comment on function public.commit_guardian_import_batch(uuid) is 'Commits many-to-many guardian relationships plus contacts and structured physical/postal/work addresses while preserving existing guardian identity and primary address records.';
