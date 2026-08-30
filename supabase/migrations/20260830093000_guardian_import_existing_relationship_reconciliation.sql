-- Guardian enrichment imports may arrive after learner/guardian relationships already exist.
-- Reuse an exact guardian already linked to the same learner instead of creating a
-- duplicate merely because canonical contact history is still empty. This is scoped
-- to the learner relationship and never turns names into a tenant-wide identity key.

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

    select sli.learner_id into learner_id from public.school_learner_identifiers sli
    where sli.school_id=b.school_id and upper(btrim(sli.admission_number))=admission limit 1;
    if learner_id is null then
      update public.import_rows set resolution='error',matched_entity_type=null,matched_entity_id=null,
        issues=issues||jsonb_build_array(jsonb_build_object('level','error','field','learner_admission_number','message','No learner in this school matches the supplied admission number.')),updated_at=now() where id=r.id;
      n_error:=n_error+1; continue;
    end if;

    select coalesce(array_agg(gp.id order by gp.created_at),array[]::uuid[])
      into linked_name_matches
    from public.learner_guardians lg
    join public.guardian_profiles gp on gp.id=lg.guardian_id and gp.tenant_id=b.tenant_id
    where lg.tenant_id=b.tenant_id
      and lg.learner_id=learner_id
      and lg.effective_to is null
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
        update public.import_rows set resolution='create',matched_entity_type='learner',matched_entity_id=learner_id,updated_at=now() where id=r.id;
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

comment on function public.reconcile_guardian_import_batch(uuid) is
'Reconciles guardian imports by stable identity/contact evidence and may safely reuse an exact-name guardian already actively linked to the same learner. Names are never tenant-wide identity keys.';
