-- Issue #851: bounded existing-roster reconciliation for learner + guardian imports.
-- Reuses import_batches/import_rows and the canonical guardian import commit path.
-- Matched learners keep their UUIDs; legal first_names and identity documents are never
-- replaced from the NHS preferred-name roster source.

create or replace function public.reconcile_existing_learner_roster_batch(
  p_batch_id uuid,
  p_academic_year integer
)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  b public.import_batches%rowtype;
  r public.import_rows%rowtype;
  v_admission text;
  v_class_code text;
  v_learner_id uuid;
  v_enrolment public.enrolments%rowtype;
  v_target_class public.register_classes%rowtype;
  v_learner public.learners%rowtype;
  v_resolution text;
  v_issues jsonb;
  v_identity_review boolean;
  n_matched integer:=0;
  n_unmatched integer:=0;
  n_review integer:=0;
  n_unchanged integer:=0;
  n_update integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_academic_year is null or p_academic_year<2000 or p_academic_year>2200 then raise exception 'Academic year is invalid'; end if;

  select * into b from public.import_batches where id=p_batch_id for update;
  if not found then raise exception 'Import batch not found'; end if;
  if b.import_type<>'learners' then raise exception 'Existing-roster reconciliation requires a learner batch'; end if;
  if not app_private.can_manage_school_imports(b.school_id) then raise exception 'Permission denied'; end if;
  if b.status not in ('staging','validating','review') then raise exception 'Import batch is not editable'; end if;

  update public.import_batches set status='validating',updated_at=now() where id=b.id;

  for r in select * from public.import_rows where batch_id=b.id order by row_number loop
    if r.resolution='skip' then continue; end if;

    v_issues:=coalesce(r.issues,'[]'::jsonb);
    v_admission:=nullif(upper(btrim(coalesce(r.normalized_data->>'admission_number',r.normalized_data->>'learner_admission_number',''))),'');
    v_class_code:=nullif(upper(regexp_replace(btrim(coalesce(r.normalized_data->>'register_class_code',r.normalized_data->>'register_class','')),'[^A-Za-z0-9]+','','g')),'');
    v_learner_id:=null;
    v_identity_review:=false;

    if v_admission is null then
      update public.import_rows
      set resolution='error',matched_entity_type=null,matched_entity_id=null,
          issues=v_issues||jsonb_build_array(jsonb_build_object('level','error','field','admission_number','message','Admission number is required for existing-roster reconciliation.')),
          updated_at=now()
      where id=r.id;
      n_review:=n_review+1;
      continue;
    end if;

    select sli.learner_id into v_learner_id
    from public.school_learner_identifiers sli
    where sli.school_id=b.school_id and upper(btrim(sli.admission_number))=v_admission
    limit 1;

    if v_learner_id is null then
      update public.import_rows
      set resolution='review',matched_entity_type=null,matched_entity_id=null,
          issues=v_issues||jsonb_build_array(jsonb_build_object(
            'level','warning','field','admission_number',
            'message','Source learner is not present in this school. Do not auto-create from a preferred-name roster; resolve through the governed learner registration workflow.'
          )),
          updated_at=now()
      where id=r.id;
      n_unmatched:=n_unmatched+1;
      n_review:=n_review+1;
      continue;
    end if;
    n_matched:=n_matched+1;

    select * into v_learner from public.learners where id=v_learner_id and tenant_id=b.tenant_id;
    if not found then raise exception 'Matched learner is outside batch tenant'; end if;

    select * into v_enrolment
    from public.enrolments e
    where e.school_id=b.school_id
      and e.learner_id=v_learner_id
      and e.academic_year=p_academic_year
      and e.enrolled_from<=current_date
      and (e.enrolled_to is null or e.enrolled_to>=current_date)
      and e.status='current'
    order by e.enrolled_from desc
    limit 1;

    if not found then
      update public.import_rows
      set resolution='review',matched_entity_type='learner',matched_entity_id=v_learner_id,
          issues=v_issues||jsonb_build_array(jsonb_build_object('level','warning','field','enrolment','message','Matched learner has no current enrolment for the requested academic year.')),
          updated_at=now()
      where id=r.id;
      n_review:=n_review+1;
      continue;
    end if;

    if v_class_code is null then
      update public.import_rows
      set resolution='error',matched_entity_type='learner',matched_entity_id=v_learner_id,
          issues=v_issues||jsonb_build_array(jsonb_build_object('level','error','field','register_class','message','Register class is required.')),
          updated_at=now()
      where id=r.id;
      n_review:=n_review+1;
      continue;
    end if;

    select rc.* into v_target_class
    from public.register_classes rc
    where rc.school_id=b.school_id
      and rc.tenant_id=b.tenant_id
      and rc.academic_year=p_academic_year
      and upper(regexp_replace(coalesce(rc.class_code,rc.display_name,''),'[^A-Za-z0-9]+','','g'))=v_class_code
    order by case when upper(regexp_replace(coalesce(rc.class_code,''),'[^A-Za-z0-9]+','','g'))=v_class_code then 0 else 1 end
    limit 1;

    if not found then
      update public.import_rows
      set resolution='error',matched_entity_type='learner',matched_entity_id=v_learner_id,
          issues=v_issues||jsonb_build_array(jsonb_build_object('level','error','field','register_class','message','Register class does not resolve to the current school/year structure.')),
          updated_at=now()
      where id=r.id;
      n_review:=n_review+1;
      continue;
    end if;

    -- Legal first_names and identity numbers are intentionally outside this source contract.
    if nullif(btrim(coalesce(r.normalized_data->>'surname','')),'') is not null
       and lower(regexp_replace(btrim(v_learner.surname),'\s+',' ','g'))
           <> lower(regexp_replace(btrim(r.normalized_data->>'surname'),'\s+',' ','g')) then
      v_identity_review:=true;
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('level','warning','field','surname','message','Source surname differs from the canonical learner surname. Confirm before update.'));
    end if;
    if nullif(r.normalized_data->>'date_of_birth','') is not null
       and v_learner.date_of_birth is not null
       and v_learner.date_of_birth<>(r.normalized_data->>'date_of_birth')::date then
      v_identity_review:=true;
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('level','warning','field','date_of_birth','message','Source date of birth differs from the canonical learner record. Confirm before update.'));
    end if;
    if nullif(lower(btrim(coalesce(r.normalized_data->>'sex',''))),'') is not null
       and lower(coalesce(v_learner.sex,''))<>lower(r.normalized_data->>'sex') then
      v_identity_review:=true;
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('level','warning','field','sex','message','Source sex differs from the canonical learner record. Confirm before update.'));
    end if;

    if v_identity_review then
      v_resolution:='review';
      n_review:=n_review+1;
    elsif v_enrolment.register_class_id is distinct from v_target_class.id
       or v_enrolment.grade_id is distinct from v_target_class.grade_id
       or (
          nullif(btrim(coalesce(r.normalized_data->>'preferred_name','')),'') is not null
          and lower(regexp_replace(btrim(coalesce(v_learner.preferred_name,'')),'\s+',' ','g'))
              <> lower(regexp_replace(btrim(r.normalized_data->>'preferred_name'),'\s+',' ','g'))
       ) then
      v_resolution:='update';
      n_update:=n_update+1;
    else
      v_resolution:='link';
      n_unchanged:=n_unchanged+1;
    end if;

    update public.import_rows
    set resolution=v_resolution,
        matched_entity_type='learner',
        matched_entity_id=v_learner_id,
        normalized_data=normalized_data||jsonb_build_object(
          'academic_year',p_academic_year,
          'target_grade_id',v_target_class.grade_id,
          'target_register_class_id',v_target_class.id,
          'current_enrolment_id',v_enrolment.id
        ),
        issues=v_issues,
        updated_at=now()
    where id=r.id;
  end loop;

  update public.import_batches x set
    total_rows=(select count(*) from public.import_rows q where q.batch_id=x.id),
    valid_rows=(select count(*) from public.import_rows q where q.batch_id=x.id and q.resolution in ('update','link','skip')),
    warning_rows=(select count(*) from public.import_rows q where q.batch_id=x.id and jsonb_array_length(q.issues)>0 and q.resolution<>'error'),
    error_rows=(select count(*) from public.import_rows q where q.batch_id=x.id and q.resolution='error'),
    status='review',updated_at=now()
  where x.id=b.id;

  return jsonb_build_object(
    'matched',n_matched,
    'unmatched',n_unmatched,
    'review',n_review,
    'unchanged',n_unchanged,
    'update',n_update
  );
end;
$$;

create or replace function public.mark_existing_learner_roster_batch_ready(p_batch_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare b public.import_batches%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into b from public.import_batches where id=p_batch_id for update;
  if not found then raise exception 'Import batch not found'; end if;
  if b.import_type<>'learners' then raise exception 'Existing-roster reconciliation requires a learner batch'; end if;
  if not app_private.can_manage_school_imports(b.school_id) then raise exception 'Permission denied'; end if;
  if b.status='ready' then return true; end if;
  if b.status<>'review' then raise exception 'Only a reviewed learner reconciliation batch can be marked ready'; end if;
  if exists(select 1 from public.import_rows where batch_id=b.id and resolution in ('create','review','error')) then
    raise exception 'Resolve every unmatched/review/error learner row before marking the reconciliation ready';
  end if;
  update public.import_batches set status='ready',updated_at=now() where id=b.id;
  return true;
end;
$$;

create or replace function public.parent_learner_reconciliation_summary(
  p_learner_batch_id uuid,
  p_guardian_batch_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,app_private
as $$
declare
  lb public.import_batches%rowtype;
  gb public.import_batches%rowtype;
  v_stale integer:=0;
  v_existing_relationships integer:=0;
  v_relationship_adds integer:=0;
  v_contact_adds integer:=0;
  v_address_adds integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into lb from public.import_batches where id=p_learner_batch_id;
  select * into gb from public.import_batches where id=p_guardian_batch_id;
  if lb.id is null or gb.id is null then raise exception 'Both reconciliation batches are required'; end if;
  if lb.school_id<>gb.school_id or lb.tenant_id<>gb.tenant_id then raise exception 'Reconciliation batches must belong to the same school and tenant'; end if;
  if lb.import_type<>'learners' or gb.import_type<>'guardians' then raise exception 'Expected learner and guardian batches'; end if;
  if not app_private.can_manage_school_imports(lb.school_id) then raise exception 'Permission denied'; end if;

  with source_learners as (
    select distinct ir.matched_entity_id learner_id
    from public.import_rows ir
    where ir.batch_id=lb.id
      and ir.matched_entity_type='learner'
      and ir.matched_entity_id is not null
      and ir.resolution<>'skip'
  ),
  covered as (
    select distinct sli.learner_id, ir.matched_entity_id guardian_id
    from public.import_rows ir
    join public.school_learner_identifiers sli
      on sli.school_id=gb.school_id
     and upper(btrim(sli.admission_number))=upper(btrim(ir.normalized_data->>'learner_admission_number'))
    where ir.batch_id=gb.id
      and ir.resolution='link'
      and ir.matched_entity_type='guardian'
      and ir.matched_entity_id is not null
  ),
  stale as (
    select lg.id
    from public.learner_guardians lg
    join source_learners sl on sl.learner_id=lg.learner_id
    where lg.effective_from<=current_date
      and (lg.effective_to is null or lg.effective_to>=current_date)
      and not exists(select 1 from covered c where c.learner_id=lg.learner_id and c.guardian_id=lg.guardian_id)
      and not exists(
        select 1
        from public.import_rows ir
        join public.school_learner_identifiers sli
          on sli.school_id=gb.school_id
         and upper(btrim(sli.admission_number))=upper(btrim(ir.normalized_data->>'learner_admission_number'))
        join public.guardian_profiles gp on gp.id=lg.guardian_id
        where ir.batch_id=gb.id
          and sli.learner_id=lg.learner_id
          and lower(regexp_replace(btrim(concat_ws(' ',gp.first_names,gp.surname)),'\s+',' ','g'))
              =lower(regexp_replace(btrim(concat_ws(' ',ir.normalized_data->>'first_names',ir.normalized_data->>'surname')),'\s+',' ','g'))
      )
  )
  select count(*) into v_stale from stale;

  select count(*) into v_existing_relationships
  from public.import_rows ir
  join public.school_learner_identifiers sli
    on sli.school_id=gb.school_id
   and upper(btrim(sli.admission_number))=upper(btrim(ir.normalized_data->>'learner_admission_number'))
  join public.learner_guardians lg
    on lg.learner_id=sli.learner_id
   and lg.guardian_id=ir.matched_entity_id
   and lg.effective_from<=current_date
   and (lg.effective_to is null or lg.effective_to>=current_date)
  where ir.batch_id=gb.id and ir.resolution='link' and ir.matched_entity_type='guardian';

  select count(*) into v_relationship_adds
  from public.import_rows ir
  where ir.batch_id=gb.id
    and (
      ir.resolution='create'
      or (
        ir.resolution='link'
        and ir.matched_entity_type='guardian'
        and not exists(
          select 1
          from public.school_learner_identifiers sli
          join public.learner_guardians lg on lg.learner_id=sli.learner_id
          where sli.school_id=gb.school_id
            and upper(btrim(sli.admission_number))=upper(btrim(ir.normalized_data->>'learner_admission_number'))
            and lg.guardian_id=ir.matched_entity_id
            and lg.effective_from<=current_date
            and (lg.effective_to is null or lg.effective_to>=current_date)
        )
      )
    );

  select coalesce(sum(
    case
      when ir.resolution='create' then
        (case when nullif(btrim(coalesce(ir.normalized_data->>'email','')),'') is not null then 1 else 0 end)+
        (case when nullif(regexp_replace(coalesce(ir.normalized_data->>'mobile',''),'[^0-9]+','','g'),'') is not null then 1 else 0 end)+
        (case when nullif(regexp_replace(coalesce(ir.normalized_data->>'whatsapp',''),'[^0-9]+','','g'),'') is not null then 1 else 0 end)+
        (case when nullif(regexp_replace(coalesce(ir.normalized_data->>'home_phone',''),'[^0-9]+','','g'),'') is not null then 1 else 0 end)+
        (case when nullif(regexp_replace(coalesce(ir.normalized_data->>'work_phone',''),'[^0-9]+','','g'),'') is not null then 1 else 0 end)
      when ir.resolution='link' and ir.matched_entity_type='guardian' and ir.matched_entity_id is not null then
        (case when nullif(btrim(coalesce(ir.normalized_data->>'email','')),'') is not null
          and not exists(select 1 from public.guardian_contacts gc where gc.guardian_id=ir.matched_entity_id and gc.contact_type='email' and lower(btrim(gc.contact_value))=lower(btrim(ir.normalized_data->>'email')) and gc.effective_from<=current_date and (gc.effective_to is null or gc.effective_to>=current_date))
          then 1 else 0 end)+
        (case when nullif(regexp_replace(coalesce(ir.normalized_data->>'mobile',''),'[^0-9]+','','g'),'') is not null
          and not exists(select 1 from public.guardian_contacts gc where gc.guardian_id=ir.matched_entity_id and gc.contact_type in ('mobile','phone','whatsapp') and regexp_replace(gc.contact_value,'[^0-9]+','','g')=regexp_replace(ir.normalized_data->>'mobile','[^0-9]+','','g') and gc.effective_from<=current_date and (gc.effective_to is null or gc.effective_to>=current_date))
          then 1 else 0 end)+
        (case when nullif(regexp_replace(coalesce(ir.normalized_data->>'whatsapp',''),'[^0-9]+','','g'),'') is not null
          and not exists(select 1 from public.guardian_contacts gc where gc.guardian_id=ir.matched_entity_id and gc.contact_type in ('mobile','phone','whatsapp') and regexp_replace(gc.contact_value,'[^0-9]+','','g')=regexp_replace(ir.normalized_data->>'whatsapp','[^0-9]+','','g') and gc.effective_from<=current_date and (gc.effective_to is null or gc.effective_to>=current_date))
          then 1 else 0 end)+
        (case when nullif(regexp_replace(coalesce(ir.normalized_data->>'home_phone',''),'[^0-9]+','','g'),'') is not null
          and not exists(select 1 from public.guardian_contacts gc where gc.guardian_id=ir.matched_entity_id and gc.contact_type in ('mobile','phone','whatsapp') and regexp_replace(gc.contact_value,'[^0-9]+','','g')=regexp_replace(ir.normalized_data->>'home_phone','[^0-9]+','','g') and gc.effective_from<=current_date and (gc.effective_to is null or gc.effective_to>=current_date))
          then 1 else 0 end)+
        (case when nullif(regexp_replace(coalesce(ir.normalized_data->>'work_phone',''),'[^0-9]+','','g'),'') is not null
          and not exists(select 1 from public.guardian_contacts gc where gc.guardian_id=ir.matched_entity_id and gc.contact_type in ('mobile','phone','whatsapp') and regexp_replace(gc.contact_value,'[^0-9]+','','g')=regexp_replace(ir.normalized_data->>'work_phone','[^0-9]+','','g') and gc.effective_from<=current_date and (gc.effective_to is null or gc.effective_to>=current_date))
          then 1 else 0 end)
      else 0
    end
  ),0)::integer into v_contact_adds
  from public.import_rows ir
  where ir.batch_id=gb.id and ir.resolution in ('create','link');

  select coalesce(sum(
    case
      when ir.resolution='create' then
        (case when nullif(btrim(coalesce(ir.normalized_data->>'physical_address','')),'') is not null then 1 else 0 end)+
        (case when nullif(btrim(coalesce(ir.normalized_data->>'postal_address','')),'') is not null then 1 else 0 end)+
        (case when nullif(btrim(coalesce(ir.normalized_data->>'work_address','')),'') is not null then 1 else 0 end)
      when ir.resolution='link' and ir.matched_entity_type='guardian' and ir.matched_entity_id is not null then
        (case when nullif(btrim(coalesce(ir.normalized_data->>'physical_address','')),'') is not null
          and not exists(select 1 from public.guardian_addresses ga where ga.guardian_id=ir.matched_entity_id and ga.address_type='physical' and lower(btrim(ga.address_line_1))=lower(btrim(ir.normalized_data->>'physical_address')) and ga.effective_from<=current_date and (ga.effective_to is null or ga.effective_to>=current_date))
          then 1 else 0 end)+
        (case when nullif(btrim(coalesce(ir.normalized_data->>'postal_address','')),'') is not null
          and not exists(select 1 from public.guardian_addresses ga where ga.guardian_id=ir.matched_entity_id and ga.address_type='postal' and lower(btrim(ga.address_line_1))=lower(btrim(ir.normalized_data->>'postal_address')) and ga.effective_from<=current_date and (ga.effective_to is null or ga.effective_to>=current_date))
          then 1 else 0 end)+
        (case when nullif(btrim(coalesce(ir.normalized_data->>'work_address','')),'') is not null
          and not exists(select 1 from public.guardian_addresses ga where ga.guardian_id=ir.matched_entity_id and ga.address_type='work' and lower(btrim(ga.address_line_1))=lower(btrim(ir.normalized_data->>'work_address')) and ga.effective_from<=current_date and (ga.effective_to is null or ga.effective_to>=current_date))
          then 1 else 0 end)
      else 0
    end
  ),0)::integer into v_address_adds
  from public.import_rows ir
  where ir.batch_id=gb.id and ir.resolution in ('create','link');

  return jsonb_build_object(
    'source_learners',(select count(*) from public.import_rows where batch_id=lb.id),
    'matched_learners',(select count(*) from public.import_rows where batch_id=lb.id and matched_entity_type='learner' and matched_entity_id is not null),
    'new_or_unmatched_learners',(select count(*) from public.import_rows where batch_id=lb.id and matched_entity_id is null and resolution<>'skip'),
    'learner_review_rows',(select count(*) from public.import_rows where batch_id=lb.id and resolution in ('review','error')),
    'class_unchanged',(select count(*) from public.import_rows where batch_id=lb.id and resolution='link'),
    'class_or_profile_updates',(select count(*) from public.import_rows where batch_id=lb.id and resolution='update'),
    'guardian_reuse',(select count(*) from public.import_rows where batch_id=gb.id and resolution='link'),
    'guardian_create_candidates',(select count(*) from public.import_rows where batch_id=gb.id and resolution='create'),
    'ambiguous_guardian_reviews',(select count(*) from public.import_rows where batch_id=gb.id and resolution in ('review','error')),
    'existing_relationships',v_existing_relationships,
    'relationship_add_candidates',v_relationship_adds,
    'stale_relationship_candidates',v_stale,
    'new_guardian_contact_values',v_contact_adds,
    'new_guardian_address_values',v_address_adds,
    'blocked_rows',
      (select count(*) from public.import_rows where batch_id=lb.id and resolution in ('review','error','create'))
      +(select count(*) from public.import_rows where batch_id=gb.id and resolution in ('review','error'))
  );
end;
$$;

create or replace function public.commit_existing_learner_roster_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  b public.import_batches%rowtype;
  r public.import_rows%rowtype;
  v_learner public.learners%rowtype;
  v_enrolment public.enrolments%rowtype;
  v_target_class public.register_classes%rowtype;
  v_updated integer:=0;
  v_linked integer:=0;
  v_skipped integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into b from public.import_batches where id=p_batch_id for update;
  if not found then raise exception 'Import batch not found'; end if;
  if b.import_type<>'learners' then raise exception 'Existing-roster reconciliation requires a learner batch'; end if;
  if not app_private.can_manage_school_imports(b.school_id) then raise exception 'Permission denied'; end if;
  if b.status='completed' then
    return jsonb_build_object(
      'batch_id',b.id,
      'updated',(select count(*) from public.import_commit_results where batch_id=b.id and outcome='updated'),
      'linked',(select count(*) from public.import_commit_results where batch_id=b.id and outcome='linked'),
      'skipped',(select count(*) from public.import_commit_results where batch_id=b.id and outcome='skipped'),
      'already_completed',true
    );
  end if;
  if b.status<>'ready' then raise exception 'Learner reconciliation batch must be ready'; end if;
  if exists(select 1 from public.import_rows where batch_id=b.id and resolution in ('create','review','error')) then
    raise exception 'Learner reconciliation still has unresolved rows';
  end if;

  update public.import_batches set status='committing',updated_at=now() where id=b.id;

  for r in select * from public.import_rows where batch_id=b.id order by row_number loop
    if r.resolution='skip' then
      insert into public.import_commit_results(batch_id,import_row_id,outcome,message)
      values(b.id,r.id,'skipped','Skipped during existing-roster reconciliation')
      on conflict(import_row_id) do nothing;
      v_skipped:=v_skipped+1;
      continue;
    end if;

    if r.matched_entity_type<>'learner' or r.matched_entity_id is null then raise exception 'Row % lost its matched learner',r.row_number; end if;
    select * into v_learner from public.learners where id=r.matched_entity_id and tenant_id=b.tenant_id for update;
    if not found then raise exception 'Matched learner for row % is no longer available',r.row_number; end if;

    select * into v_enrolment from public.enrolments
    where id=nullif(r.normalized_data->>'current_enrolment_id','')::uuid
      and learner_id=v_learner.id and school_id=b.school_id
    for update;
    if not found or v_enrolment.status<>'current' or v_enrolment.enrolled_to is not null and v_enrolment.enrolled_to<current_date then
      raise exception 'Current enrolment changed after reconciliation for row %',r.row_number;
    end if;

    select * into v_target_class from public.register_classes
    where id=nullif(r.normalized_data->>'target_register_class_id','')::uuid
      and school_id=b.school_id and tenant_id=b.tenant_id;
    if not found then raise exception 'Target class changed after reconciliation for row %',r.row_number; end if;

    if r.resolution='update' then
      update public.learners
      set surname=coalesce(nullif(btrim(r.normalized_data->>'surname'),''),surname),
          date_of_birth=coalesce(nullif(r.normalized_data->>'date_of_birth','')::date,date_of_birth),
          sex=coalesce(nullif(lower(btrim(r.normalized_data->>'sex')),''),sex),
          updated_at=now()
      where id=v_learner.id;

      update public.enrolments
      set grade_id=v_target_class.grade_id,
          register_class_id=v_target_class.id,
          updated_at=now()
      where id=v_enrolment.id;

      insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message)
      values(b.id,r.id,'learner',v_learner.id,'updated','Reconciled approved existing learner fields/current class while preserving learner UUID, legal first_names, preferred_name, and identity documents')
      on conflict(import_row_id) do nothing;
      v_updated:=v_updated+1;
    else
      insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message)
      values(b.id,r.id,'learner',v_learner.id,'linked','Existing learner already matches the reconciled roster')
      on conflict(import_row_id) do nothing;
      v_linked:=v_linked+1;
    end if;
  end loop;

  update public.import_batches set status='completed',committed_at=now(),updated_at=now() where id=b.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(b.tenant_id,b.school_id,auth.uid(),'import.learners.reconciled_existing','import_batch',b.id,
    jsonb_build_object('updated',v_updated,'linked',v_linked,'skipped',v_skipped,'preserved_existing_learner_ids',true));

  return jsonb_build_object('batch_id',b.id,'updated',v_updated,'linked',v_linked,'skipped',v_skipped);
end;
$$;

create or replace function public.commit_parent_learner_reconciliation(
  p_learner_batch_id uuid,
  p_guardian_batch_id uuid,
  p_stale_relationship_action text
)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  lb public.import_batches%rowtype;
  gb public.import_batches%rowtype;
  v_summary jsonb;
  v_learner_result jsonb;
  v_guardian_result jsonb;
  v_stale uuid[];
  v_stale_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_stale_relationship_action not in ('keep','end') then raise exception 'Stale relationship action must be keep or end'; end if;

  select * into lb from public.import_batches where id=p_learner_batch_id for update;
  select * into gb from public.import_batches where id=p_guardian_batch_id for update;
  if lb.id is null or gb.id is null then raise exception 'Both reconciliation batches are required'; end if;
  if lb.school_id<>gb.school_id or lb.tenant_id<>gb.tenant_id then raise exception 'Reconciliation batches must belong to the same school and tenant'; end if;
  if not app_private.can_manage_school_imports(lb.school_id) then raise exception 'Permission denied'; end if;

  if lb.status='completed' and gb.status='completed' then
    select ae.metadata->'learner_result',ae.metadata->'guardian_result'
      into v_learner_result,v_guardian_result
    from public.audit_events ae
    where ae.school_id=lb.school_id
      and ae.event_type='import.parent_learner_reconciliation.committed'
      and ae.entity_type='import_batch'
      and ae.entity_id=lb.id
      and ae.metadata->>'guardian_batch_id'=gb.id::text
    order by ae.occurred_at desc
    limit 1;
    if v_learner_result is null or v_guardian_result is null then
      raise exception 'Completed batches are not a recorded reconciliation pair';
    end if;
    return jsonb_build_object(
      'learner_result',v_learner_result,
      'guardian_result',v_guardian_result,
      'stale_relationship_action','already_completed',
      'stale_relationship_candidates',coalesce((
        select (ae.metadata->>'stale_relationship_candidates')::integer
        from public.audit_events ae
        where ae.school_id=lb.school_id
          and ae.event_type='import.parent_learner_reconciliation.committed'
          and ae.entity_type='import_batch'
          and ae.entity_id=lb.id
          and ae.metadata->>'guardian_batch_id'=gb.id::text
        order by ae.occurred_at desc
        limit 1
      ),0),
      'already_completed',true
    );
  end if;

  if lb.status<>'ready' or gb.status<>'ready' then raise exception 'Both reconciliation batches must be ready'; end if;

  v_summary:=public.parent_learner_reconciliation_summary(lb.id,gb.id);
  if coalesce((v_summary->>'blocked_rows')::integer,0)>0 then raise exception 'Reconciliation has blocked rows'; end if;

  with source_learners as (
    select distinct ir.matched_entity_id learner_id
    from public.import_rows ir
    where ir.batch_id=lb.id
      and ir.matched_entity_type='learner'
      and ir.matched_entity_id is not null
      and ir.resolution<>'skip'
  ),
  covered as (
    select distinct sli.learner_id, ir.matched_entity_id guardian_id
    from public.import_rows ir
    join public.school_learner_identifiers sli
      on sli.school_id=gb.school_id
     and upper(btrim(sli.admission_number))=upper(btrim(ir.normalized_data->>'learner_admission_number'))
    where ir.batch_id=gb.id
      and ir.resolution='link'
      and ir.matched_entity_type='guardian'
      and ir.matched_entity_id is not null
  )
  select coalesce(array_agg(lg.id order by lg.id),'{}'::uuid[])
  into v_stale
  from public.learner_guardians lg
  join source_learners sl on sl.learner_id=lg.learner_id
  where lg.effective_from<=current_date
    and (lg.effective_to is null or lg.effective_to>=current_date)
    and not exists(select 1 from covered c where c.learner_id=lg.learner_id and c.guardian_id=lg.guardian_id)
    and not exists(
      select 1
      from public.import_rows ir
      join public.school_learner_identifiers sli
        on sli.school_id=gb.school_id
       and upper(btrim(sli.admission_number))=upper(btrim(ir.normalized_data->>'learner_admission_number'))
      join public.guardian_profiles gp on gp.id=lg.guardian_id
      where ir.batch_id=gb.id
        and sli.learner_id=lg.learner_id
        and lower(regexp_replace(btrim(concat_ws(' ',gp.first_names,gp.surname)),'\s+',' ','g'))
            =lower(regexp_replace(btrim(concat_ws(' ',ir.normalized_data->>'first_names',ir.normalized_data->>'surname')),'\s+',' ','g'))
    );

  -- The NHS source only says PARENT 1 / PARENT 2. When a linked existing
  -- guardian already has a more specific relationship or verified permissions,
  -- preserve those facts instead of downgrading them to generic parent/false flags.
  with existing_rel as (
    select distinct on (ir.id)
      ir.id import_row_id,
      lg.relationship_type,
      lg.is_legal_guardian,
      lg.is_emergency_contact,
      lg.is_pickup_authorized
    from public.import_rows ir
    join public.school_learner_identifiers sli
      on sli.school_id=gb.school_id
     and upper(btrim(sli.admission_number))=upper(btrim(ir.normalized_data->>'learner_admission_number'))
    join public.learner_guardians lg
      on lg.learner_id=sli.learner_id
     and lg.guardian_id=ir.matched_entity_id
     and lg.effective_from<=current_date
     and (lg.effective_to is null or lg.effective_to>=current_date)
    where ir.batch_id=gb.id
      and ir.resolution='link'
      and ir.matched_entity_type='guardian'
      and ir.matched_entity_id is not null
    order by ir.id,lg.priority,lg.created_at
  )
  update public.import_rows ir
  set normalized_data=ir.normalized_data||jsonb_build_object(
        'relationship_type',rel.relationship_type,
        'is_legal_guardian',rel.is_legal_guardian,
        'is_emergency_contact',rel.is_emergency_contact,
        'is_pickup_authorized',rel.is_pickup_authorized
      ),
      updated_at=now()
  from existing_rel rel
  where ir.id=rel.import_row_id;

  v_learner_result:=public.commit_existing_learner_roster_batch(lb.id);
  v_guardian_result:=public.commit_guardian_import_batch(gb.id);

  if p_stale_relationship_action='end' then
    foreach v_stale_id in array v_stale loop
      update public.learner_guardians
      set effective_to=current_date-1
      where id=v_stale_id
        and effective_from<current_date
        and (effective_to is null or effective_to>=current_date);
    end loop;
  end if;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(lb.tenant_id,lb.school_id,auth.uid(),'import.parent_learner_reconciliation.committed','import_batch',lb.id,
    jsonb_build_object(
      'guardian_batch_id',gb.id,
      'stale_relationship_action',p_stale_relationship_action,
      'stale_relationship_candidates',cardinality(v_stale),
      'learner_result',v_learner_result,
      'guardian_result',v_guardian_result
    ));

  return jsonb_build_object(
    'learner_result',v_learner_result,
    'guardian_result',v_guardian_result,
    'stale_relationship_action',p_stale_relationship_action,
    'stale_relationship_candidates',cardinality(v_stale)
  );
end;
$$;

revoke all on function public.reconcile_existing_learner_roster_batch(uuid,integer) from public,anon;
grant execute on function public.reconcile_existing_learner_roster_batch(uuid,integer) to authenticated;
revoke all on function public.mark_existing_learner_roster_batch_ready(uuid) from public,anon;
grant execute on function public.mark_existing_learner_roster_batch_ready(uuid) to authenticated;
revoke all on function public.parent_learner_reconciliation_summary(uuid,uuid) from public,anon;
grant execute on function public.parent_learner_reconciliation_summary(uuid,uuid) to authenticated;
revoke all on function public.commit_existing_learner_roster_batch(uuid) from public,anon;
grant execute on function public.commit_existing_learner_roster_batch(uuid) to authenticated;
revoke all on function public.commit_parent_learner_reconciliation(uuid,uuid,text) from public,anon;
grant execute on function public.commit_parent_learner_reconciliation(uuid,uuid,text) to authenticated;

comment on function public.reconcile_existing_learner_roster_batch(uuid,integer) is
'Reconciles an existing-school learner roster by stable school admission number and current register class. It never auto-creates an unmatched learner and never replaces legal first_names or identity documents.';
comment on function public.commit_parent_learner_reconciliation(uuid,uuid,text) is
'Atomically commits a ready existing-learner reconciliation plus the canonical guardian import batch; stale current guardian relationships require an explicit keep/end decision.';
