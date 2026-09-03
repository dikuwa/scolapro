-- Guardian relationship reuse must follow current effective-period semantics.
-- Future-start relationships are not current identity/link evidence, while finite
-- relationships that are effective today remain valid. Explicit link/upsert
-- operations are current actions, so an existing open future relationship is
-- advanced to today rather than reporting success while remaining inactive.

create or replace function public.reconcile_guardian_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  b public.import_batches%rowtype;
  r public.import_rows%rowtype;
  v_learner_id uuid;
  guardian_id uuid;
  linked_name_matches uuid[];
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

    select sli.learner_id into v_learner_id from public.school_learner_identifiers sli
    where sli.school_id=b.school_id and upper(btrim(sli.admission_number))=admission limit 1;
    if v_learner_id is null then
      update public.import_rows set resolution='error',matched_entity_type=null,matched_entity_id=null,
        issues=issues||jsonb_build_array(jsonb_build_object('level','error','field','learner_admission_number','message','No learner in this school matches the supplied admission number.')),updated_at=now() where id=r.id;
      n_error:=n_error+1; continue;
    end if;

    select coalesce(array_agg(gp.id order by gp.created_at),array[]::uuid[])
      into linked_name_matches
    from public.learner_guardians lg
    join public.guardian_profiles gp on gp.id=lg.guardian_id and gp.tenant_id=b.tenant_id
    where lg.tenant_id=b.tenant_id
      and lg.learner_id=v_learner_id
      and lg.effective_from<=current_date
      and (lg.effective_to is null or lg.effective_to>=current_date)
      and lower(regexp_replace(btrim(gp.first_names),'\s+',' ','g'))=lower(regexp_replace(first_value,'\s+',' ','g'))
      and lower(regexp_replace(btrim(gp.surname),'\s+',' ','g'))=lower(regexp_replace(surname_value,'\s+',' ','g'));

    if identity_value is not null then
      select gp.id,gp.first_names,gp.surname into guardian_id,existing_first,existing_surname
      from public.guardian_profiles gp where gp.tenant_id=b.tenant_id and lower(btrim(gp.identity_number))=identity_value limit 1;
      if guardian_id is not null then
        if lower(regexp_replace(btrim(existing_first),'\s+',' ','g'))<>lower(regexp_replace(first_value,'\s+',' ','g'))
           or lower(regexp_replace(btrim(existing_surname),'\s+',' ','g'))<>lower(regexp_replace(surname_value,'\s+',' ','g')) then
          update public.import_rows set resolution='review',matched_entity_type='guardian',matched_entity_id=guardian_id,
            issues=issues||jsonb_build_array(jsonb_build_object('level','warning','field','identity_number','message','This identity number belongs to an existing guardian with a different recorded name. Confirm the existing guardian; identity data will not be overwritten.')),updated_at=now() where id=r.id;
          n_review:=n_review+1;
        else
          update public.import_rows set resolution='link',matched_entity_type='guardian',matched_entity_id=guardian_id,updated_at=now() where id=r.id;
          n_link:=n_link+1;
        end if;
      elsif cardinality(linked_name_matches)=1 then
        update public.import_rows set resolution='review',matched_entity_type='guardian',matched_entity_id=linked_name_matches[1],
          issues=issues||jsonb_build_array(jsonb_build_object('level','warning','field','identity_number','message','This learner already has an exact-name guardian link, but the imported identity number is not on that guardian. Confirm the existing guardian before enriching contacts; identity data will not be overwritten.')),updated_at=now() where id=r.id;
        n_review:=n_review+1;
      elsif cardinality(linked_name_matches)>1 then
        update public.import_rows set resolution='error',matched_entity_type=null,matched_entity_id=null,
          issues=issues||jsonb_build_array(jsonb_build_object('level','error','field','guardian','message','Multiple active guardians with this exact name are already linked to the learner. Resolve manually; ScolaPro will not guess.')),updated_at=now() where id=r.id;
        n_error:=n_error+1;
      else
        update public.import_rows set resolution='create',matched_entity_type='learner',matched_entity_id=v_learner_id,updated_at=now() where id=r.id;
        n_create:=n_create+1;
      end if;
    elsif cardinality(linked_name_matches)=1 then
      update public.import_rows set resolution='link',matched_entity_type='guardian',matched_entity_id=linked_name_matches[1],
        issues=case when email_value is null and cardinality(phones)=0
          then issues||jsonb_build_array(jsonb_build_object('level','warning','field','contact','message','Existing learner-linked guardian matched by exact recorded name. No new contact evidence was supplied.'))
          else issues end,
        updated_at=now() where id=r.id;
      n_link:=n_link+1;
    elsif cardinality(linked_name_matches)>1 then
      update public.import_rows set resolution='error',matched_entity_type=null,matched_entity_id=null,
        issues=issues||jsonb_build_array(jsonb_build_object('level','error','field','guardian','message','Multiple active guardians with this exact name are already linked to the learner. Resolve manually; ScolaPro will not guess.')),updated_at=now() where id=r.id;
      n_error:=n_error+1;
    elsif email_value is null and cardinality(phones)=0 then
      update public.import_rows set resolution='error',matched_entity_type=null,matched_entity_id=null,
        issues=issues||jsonb_build_array(jsonb_build_object('level','error','field','contact','message','A new guardian without an identity number requires at least one email or phone contact.')),updated_at=now() where id=r.id;
      n_error:=n_error+1;
    else
      matches:=app_private.guardian_import_contact_matches(b.tenant_id,first_value,surname_value,email_value,phones);
      if cardinality(matches)=0 then
        update public.import_rows set resolution='create',matched_entity_type='learner',matched_entity_id=v_learner_id,updated_at=now() where id=r.id; n_create:=n_create+1;
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

create or replace function public.upsert_guardian_relationship(
  p_learner_id uuid,
  p_guardian_id uuid default null,
  p_first_names text default null,
  p_surname text default null,
  p_preferred_name text default null,
  p_identity_number text default null,
  p_relationship_type text default 'guardian',
  p_is_legal_guardian boolean default false,
  p_is_emergency_contact boolean default false,
  p_is_pickup_authorized boolean default false,
  p_priority smallint default 1,
  p_contacts jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_learner public.learners%rowtype;
  v_guardian public.guardian_profiles%rowtype;
  v_contact jsonb;
  v_type text;
  v_value text;
  v_primary boolean;
  v_same_contact_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_learner from public.learners where id=p_learner_id;
  if not found then raise exception 'Learner not found'; end if;
  if not app_private.can_manage_guardians_for_learner(p_learner_id) then raise exception 'Permission denied'; end if;
  if btrim(coalesce(p_relationship_type,''))='' then raise exception 'Relationship type is required'; end if;
  if p_priority<1 or p_priority>20 then raise exception 'Priority must be between 1 and 20'; end if;
  if jsonb_typeof(coalesce(p_contacts,'[]'::jsonb))<>'array' then raise exception 'Contacts must be an array'; end if;

  if p_guardian_id is null then
    if btrim(coalesce(p_first_names,''))='' or btrim(coalesce(p_surname,''))='' then raise exception 'Guardian first names and surname are required'; end if;
    insert into public.guardian_profiles(tenant_id,first_names,surname,preferred_name,identity_number)
    values(v_learner.tenant_id,btrim(p_first_names),btrim(p_surname),nullif(btrim(coalesce(p_preferred_name,'')),''),nullif(btrim(coalesce(p_identity_number,'')),''))
    returning * into v_guardian;
  else
    select * into v_guardian from public.guardian_profiles where id=p_guardian_id;
    if not found or v_guardian.tenant_id<>v_learner.tenant_id then raise exception 'Guardian not found in learner tenant'; end if;
    if (p_first_names is not null and nullif(btrim(p_first_names),'') is distinct from v_guardian.first_names)
       or (p_surname is not null and nullif(btrim(p_surname),'') is distinct from v_guardian.surname)
       or (p_preferred_name is not null and nullif(btrim(p_preferred_name),'') is distinct from v_guardian.preferred_name)
       or (p_identity_number is not null and nullif(btrim(p_identity_number),'') is distinct from v_guardian.identity_number) then
      raise exception 'Existing guardian identity changes require the reviewed profile-change workflow';
    end if;
  end if;

  insert into public.learner_guardians(
    tenant_id,learner_id,guardian_id,relationship_type,
    is_legal_guardian,is_emergency_contact,is_pickup_authorized,priority
  ) values(
    v_learner.tenant_id,v_learner.id,v_guardian.id,lower(btrim(p_relationship_type)),
    p_is_legal_guardian,p_is_emergency_contact,p_is_pickup_authorized,p_priority
  )
  on conflict (learner_id,guardian_id,relationship_type) where effective_to is null
  do update set
    effective_from=least(public.learner_guardians.effective_from,excluded.effective_from),
    is_legal_guardian=excluded.is_legal_guardian,
    is_emergency_contact=excluded.is_emergency_contact,
    is_pickup_authorized=excluded.is_pickup_authorized,
    priority=excluded.priority;

  for v_contact in select value from jsonb_array_elements(coalesce(p_contacts,'[]'::jsonb)) loop
    v_type:=lower(btrim(coalesce(v_contact->>'type','')));
    v_value:=btrim(coalesce(v_contact->>'value',''));
    v_primary:=coalesce((v_contact->>'primary')::boolean,false);
    if v_type not in ('email','mobile','phone','whatsapp','address') then raise exception 'Unsupported guardian contact type: %',v_type; end if;
    if v_value='' then continue; end if;
    select gc.id into v_same_contact_id
    from public.guardian_contacts gc
    where gc.guardian_id=v_guardian.id
      and gc.contact_type=v_type
      and lower(btrim(gc.contact_value))=lower(v_value)
      and gc.effective_from<=current_date
      and (gc.effective_to is null or gc.effective_to>=current_date)
    order by gc.is_primary desc,gc.effective_from desc,gc.created_at desc
    limit 1;
    if v_same_contact_id is not null then
      if v_primary then
        update public.guardian_contacts
        set is_primary=(id=v_same_contact_id)
        where guardian_id=v_guardian.id
          and contact_type=v_type
          and effective_from<=current_date
          and (effective_to is null or effective_to>=current_date)
          and (is_primary=true or id=v_same_contact_id);
      end if;
      v_same_contact_id:=null;
      continue;
    end if;
    if v_primary then
      update public.guardian_contacts
      set effective_to=current_date-1
      where guardian_id=v_guardian.id
        and contact_type=v_type
        and is_primary=true
        and effective_from<current_date
        and (effective_to is null or effective_to>=current_date);
      delete from public.guardian_contacts
      where guardian_id=v_guardian.id
        and contact_type=v_type
        and is_primary=true
        and effective_from=current_date
        and (effective_to is null or effective_to>=current_date);
    end if;
    insert into public.guardian_contacts(tenant_id,guardian_id,contact_type,label,contact_value,is_primary,created_by_user_id)
    values(v_learner.tenant_id,v_guardian.id,v_type,nullif(btrim(coalesce(v_contact->>'label','')),''),v_value,v_primary,auth.uid());
  end loop;

  insert into public.audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_learner.tenant_id,auth.uid(),'guardian.relationship.upserted','learner',v_learner.id,
    jsonb_build_object('guardian_id',v_guardian.id,'relationship_type',lower(btrim(p_relationship_type))));
  return v_guardian.id;
end;
$$;

create or replace function public.link_existing_guardian_to_learner(
  p_learner_id uuid,
  p_guardian_id uuid,
  p_relationship_type text,
  p_is_legal_guardian boolean default false,
  p_is_emergency_contact boolean default false,
  p_is_pickup_authorized boolean default false,
  p_priority smallint default 1
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_learner public.learners%rowtype;
  v_guardian public.guardian_profiles%rowtype;
  v_school_id uuid;
  v_relationship_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_guardians_for_learner(p_learner_id) then raise exception 'Permission denied'; end if;
  if btrim(coalesce(p_relationship_type,''))='' then raise exception 'Relationship type is required'; end if;
  if p_priority<1 or p_priority>20 then raise exception 'Priority must be between 1 and 20'; end if;

  select * into v_learner from public.learners where id=p_learner_id;
  if not found then raise exception 'Learner not found'; end if;
  select * into v_guardian from public.guardian_profiles where id=p_guardian_id and status='active';
  if not found then raise exception 'Guardian not found or inactive'; end if;
  if v_guardian.tenant_id<>v_learner.tenant_id then raise exception 'Guardian and learner must belong to the same tenant'; end if;

  select e.school_id into v_school_id
  from public.enrolments e
  where e.learner_id=p_learner_id and (e.enrolled_to is null or e.enrolled_to>=current_date)
  order by e.enrolled_from desc limit 1;

  select id into v_relationship_id
  from public.learner_guardians
  where learner_id=p_learner_id
    and guardian_id=p_guardian_id
    and relationship_type=lower(btrim(p_relationship_type))
    and effective_to is null
  limit 1;

  if v_relationship_id is null then
    insert into public.learner_guardians(
      tenant_id,learner_id,guardian_id,relationship_type,
      is_legal_guardian,is_emergency_contact,is_pickup_authorized,priority
    ) values(
      v_learner.tenant_id,p_learner_id,p_guardian_id,lower(btrim(p_relationship_type)),
      p_is_legal_guardian,p_is_emergency_contact,p_is_pickup_authorized,p_priority
    ) returning id into v_relationship_id;
  else
    update public.learner_guardians
    set effective_from=least(effective_from,current_date),
        is_legal_guardian=p_is_legal_guardian,
        is_emergency_contact=p_is_emergency_contact,
        is_pickup_authorized=p_is_pickup_authorized,
        priority=p_priority
    where id=v_relationship_id;
  end if;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_learner.tenant_id,v_school_id,auth.uid(),'guardian.relationship.linked_existing','learner_guardian',v_relationship_id,
    jsonb_build_object('learner_id',p_learner_id,'guardian_id',p_guardian_id,'relationship_type',lower(btrim(p_relationship_type))));
  return v_relationship_id;
end;
$$;

revoke all on function public.reconcile_guardian_import_batch(uuid) from public,anon;
grant execute on function public.reconcile_guardian_import_batch(uuid) to authenticated;
revoke all on function public.upsert_guardian_relationship(uuid,uuid,text,text,text,text,text,boolean,boolean,boolean,smallint,jsonb) from public,anon;
grant execute on function public.upsert_guardian_relationship(uuid,uuid,text,text,text,text,text,boolean,boolean,boolean,smallint,jsonb) to authenticated;
revoke all on function public.link_existing_guardian_to_learner(uuid,uuid,text,boolean,boolean,boolean,smallint) from public,anon;
grant execute on function public.link_existing_guardian_to_learner(uuid,uuid,text,boolean,boolean,boolean,smallint) to authenticated;

comment on function public.reconcile_guardian_import_batch(uuid) is
'Reconciles guardian imports using current effective-period relationship and contact evidence; future-start links are not treated as current identity evidence.';
comment on function public.upsert_guardian_relationship(uuid,uuid,text,text,text,text,text,boolean,boolean,boolean,smallint,jsonb) is
'Creates or links a reusable guardian with current effective-period semantics. Explicit link/upsert makes an open scheduled relationship effective no later than today.';
comment on function public.link_existing_guardian_to_learner(uuid,uuid,text,boolean,boolean,boolean,smallint) is
'Links an existing active same-tenant guardian to a learner effective now; an open future-scheduled matching relationship is advanced to today.';
