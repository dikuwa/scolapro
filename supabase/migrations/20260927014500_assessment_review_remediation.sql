-- Issue #794: remediate assessment scheme / mark-grid acceptance defects.
-- Forward-only hardening over the already-applied #684/#685 migrations.

drop policy if exists "academic staff can read assessment scheme candidates"
  on public.assessment_scheme_candidates;
create policy "academic staff can read assessment scheme candidates"
on public.assessment_scheme_candidates for select to authenticated
using (app_private.can_read_assessment_reference_school(school_id));

drop policy if exists "academic leaders can manage assessment scheme candidates"
  on public.assessment_scheme_candidates;
create policy "academic leaders can manage assessment scheme candidates"
on public.assessment_scheme_candidates for all to authenticated
using (app_private.can_manage_current_assessment_school(school_id))
with check (app_private.can_manage_current_assessment_school(school_id));

create or replace function app_private.enforce_assessment_scheme_candidate_integrity()
returns trigger
language plpgsql security definer
set search_path=pg_catalog,public
as $$
declare
  v_offering record;
  v_source_id uuid;
  v_payload_changed boolean:=false;
begin
  select so.tenant_id,so.school_id,so.academic_year,so.curriculum_version_id,cv.source_id
    into v_offering
    from public.subject_offerings so
    join public.curriculum_versions cv on cv.id=so.curriculum_version_id
   where so.id=new.subject_offering_id;

  if v_offering.tenant_id is null then
    raise exception 'Assessment candidate requires a subject offering with curriculum version';
  end if;
  if row(new.tenant_id,new.school_id,new.academic_year,new.curriculum_version_id)
     is distinct from
     row(v_offering.tenant_id,v_offering.school_id,v_offering.academic_year,v_offering.curriculum_version_id) then
    raise exception 'Assessment candidate scope/version does not match subject offering';
  end if;

  v_source_id:=v_offering.source_id;
  if new.curriculum_source_id is null then new.curriculum_source_id:=v_source_id; end if;
  if v_source_id is not null and new.curriculum_source_id is distinct from v_source_id then
    raise exception 'Assessment candidate curriculum source does not match version provenance';
  end if;

  if tg_op='UPDATE' then
    if old.status in ('published','rejected') and new is distinct from old then
      raise exception 'Final assessment candidate cannot be rewritten';
    end if;

    v_payload_changed :=
      new.candidate is distinct from old.candidate
      or new.source_snapshot is distinct from old.source_snapshot
      or new.source_kind is distinct from old.source_kind
      or new.curriculum_source_id is distinct from old.curriculum_source_id
      or new.curriculum_version_id is distinct from old.curriculum_version_id;

    if old.status='verified' and v_payload_changed then
      new.status:='candidate';
      new.verified_by_user_id:=null;
      new.verified_at:=null;
      new.verification_note:=null;
      new.published_scheme_id:=null;
    end if;
  end if;

  new.updated_at:=now();
  return new;
end;
$$;

revoke all on function app_private.enforce_assessment_scheme_candidate_integrity()
  from public,anon,authenticated;

create or replace function public.extract_assessment_scheme_candidate(p_subject_offering_id uuid)
returns uuid
language plpgsql security definer
set search_path=pg_catalog,public,app_private,auth
as $$
declare
  v_offering record;
  v_version record;
  v_candidate jsonb;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select so.id,so.tenant_id,so.school_id,so.academic_year,so.curriculum_version_id
    into v_offering
    from public.subject_offerings so
   where so.id=p_subject_offering_id;
  if v_offering.id is null or v_offering.curriculum_version_id is null then
    raise exception 'Subject offering requires an authoritative curriculum version';
  end if;
  if not app_private.can_manage_current_assessment_school(v_offering.school_id) then
    raise exception 'Academic leadership authority required';
  end if;

  select cv.id,cv.version_key,cv.source_id,cv.metadata,cv.status,
         cs.authority,cs.source_key,cs.title,cs.checksum
    into v_version
    from public.curriculum_versions cv
    left join public.curriculum_sources cs on cs.id=cv.source_id
   where cv.id=v_offering.curriculum_version_id;

  if v_version.status not in ('approved','published','superseded') then
    raise exception 'Curriculum version is not verified for assessment extraction';
  end if;

  v_candidate:=coalesce(v_version.metadata->'assessmentScheme',v_version.metadata->'assessment_scheme');
  if v_candidate is null or jsonb_typeof(v_candidate)<>'object' then
    raise exception 'No structured assessment configuration is available in this curriculum version';
  end if;

  insert into public.assessment_scheme_candidates(
    tenant_id,school_id,academic_year,subject_offering_id,curriculum_version_id,
    curriculum_source_id,source_kind,source_snapshot,candidate,extracted_by_user_id
  ) values(
    v_offering.tenant_id,v_offering.school_id,v_offering.academic_year,p_subject_offering_id,
    v_offering.curriculum_version_id,v_version.source_id,'curriculum_metadata',
    jsonb_build_object(
      'curriculumVersion',v_version.version_key,
      'sourceAuthority',v_version.authority,
      'sourceKey',v_version.source_key,
      'sourceTitle',v_version.title,
      'sourceChecksum',v_version.checksum
    ),
    v_candidate,auth.uid()
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.verify_assessment_scheme_candidate(
  p_candidate_id uuid,
  p_note text default null
)
returns boolean
language plpgsql security definer
set search_path=pg_catalog,public,app_private,auth
as $$
declare
  v_candidate public.assessment_scheme_candidates%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_candidate
    from public.assessment_scheme_candidates
   where id=p_candidate_id
   for update;
  if not found then raise exception 'Assessment candidate not found'; end if;
  if not app_private.can_manage_current_assessment_school(v_candidate.school_id) then
    raise exception 'Academic leadership authority required';
  end if;
  if v_candidate.status<>'candidate' then
    raise exception 'Only candidate assessment configuration can be verified';
  end if;

  update public.assessment_scheme_candidates
     set status='verified',
         verified_by_user_id=auth.uid(),
         verified_at=now(),
         verification_note=nullif(btrim(coalesce(p_note,'')),''),
         updated_at=now()
   where id=p_candidate_id;
  return true;
end;
$$;

create or replace function public.publish_assessment_scheme_candidate(p_candidate_id uuid)
returns uuid
language plpgsql security definer
set search_path=pg_catalog,public,app_private,auth
as $$
declare
  v_candidate public.assessment_scheme_candidates%rowtype;
  v_scheme_id uuid;
  v_capture_mode text;
  v_scheme_key text;
  v_version text;
  v_terms smallint[];
  v_component jsonb;
  v_index integer:=0;
  v_component_count integer:=0;
  v_contributing_count integer:=0;
  v_method text;
  v_contributes boolean;
  v_weight numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_candidate
    from public.assessment_scheme_candidates
   where id=p_candidate_id
   for update;
  if not found then raise exception 'Assessment candidate not found'; end if;
  if not app_private.can_manage_current_assessment_school(v_candidate.school_id) then
    raise exception 'Academic leadership authority required';
  end if;
  if v_candidate.status<>'verified'
     or v_candidate.verified_by_user_id is null
     or v_candidate.verified_at is null then
    raise exception 'Human verification is required before assessment scheme publication';
  end if;

  v_capture_mode:=coalesce(v_candidate.candidate->>'captureMode',v_candidate.candidate->>'capture_mode','detailed');
  if v_capture_mode not in ('detailed','final_result') then
    raise exception 'Candidate capture mode is invalid';
  end if;
  v_scheme_key:=coalesce(
    nullif(v_candidate.candidate->>'schemeKey',''),
    nullif(v_candidate.candidate->>'scheme_key',''),
    'curriculum'
  );
  v_version:=coalesce(
    nullif(v_candidate.candidate->>'version',''),
    to_char(now(),'YYYYMMDDHH24MISS')
  );
  select coalesce(array_agg(value::smallint),'{}'::smallint[])
    into v_terms
    from jsonb_array_elements_text(
      coalesce(v_candidate.candidate->'termNumbers',
               v_candidate.candidate->'term_numbers',
               '[1,2,3]'::jsonb)
    );
  if not app_private.valid_three_term_array(v_terms) then
    raise exception 'Candidate term applicability must use terms 1 to 3';
  end if;

  if v_capture_mode='detailed' then
    for v_component in
      select value
        from jsonb_array_elements(coalesce(v_candidate.candidate->'components','[]'::jsonb))
    loop
      v_component_count:=v_component_count+1;
      v_method:=coalesce(nullif(v_component->>'calculationMethod',''),'weighted');
      if v_method<>'weighted' then
        raise exception 'Unsupported assessment component calculation method: %',v_method;
      end if;
      v_contributes:=coalesce((v_component->>'contributesToReport')::boolean,true);
      if v_contributes then
        v_weight:=nullif(v_component->>'weight','')::numeric;
        if v_weight is null or v_weight<=0 then
          raise exception 'Contributing assessment components require a positive weight';
        end if;
        v_contributing_count:=v_contributing_count+1;
      end if;
    end loop;
    if v_component_count=0 then
      raise exception 'Detailed assessment scheme requires at least one verified component';
    end if;
    if v_contributing_count=0 then
      raise exception 'Detailed assessment scheme requires at least one contributing component';
    end if;
  end if;

  update public.assessment_schemes
     set status='superseded',
         effective_to=case when effective_from<current_date then current_date-1 else effective_from end,
         updated_at=now()
   where subject_offering_id=v_candidate.subject_offering_id
     and scheme_key=v_scheme_key
     and status='active';

  insert into public.assessment_schemes(
    tenant_id,school_id,subject_offering_id,scheme_key,version,capture_mode,
    effective_from,status,configuration,created_by_user_id,academic_year,
    curriculum_version_id,term_numbers,source_provenance,verified_by_user_id,verified_at
  ) values(
    v_candidate.tenant_id,v_candidate.school_id,v_candidate.subject_offering_id,
    v_scheme_key,v_version,v_capture_mode,make_date(v_candidate.academic_year,1,1),
    'active',coalesce(v_candidate.candidate->'configuration','{}'::jsonb),auth.uid(),
    v_candidate.academic_year,v_candidate.curriculum_version_id,v_terms,
    v_candidate.source_snapshot,v_candidate.verified_by_user_id,v_candidate.verified_at
  ) returning id into v_scheme_id;

  if v_capture_mode='final_result' then
    insert into public.assessment_components(
      tenant_id,school_id,assessment_scheme_id,component_code,display_name,component_type,
      raw_max,weight,contributes_to_report,required,sort_order,configuration,
      term_numbers,calculation_method,moderation_required,moderation_metadata
    ) values(
      v_candidate.tenant_id,v_candidate.school_id,v_scheme_id,
      'final_result','Final result','final_result',
      100,100,true,true,10,'{}'::jsonb,
      v_terms,'weighted',false,'{}'::jsonb
    );
  else
    for v_component in
      select value
        from jsonb_array_elements(coalesce(v_candidate.candidate->'components','[]'::jsonb))
    loop
      v_index:=v_index+1;
      insert into public.assessment_components(
        tenant_id,school_id,assessment_scheme_id,component_code,display_name,component_type,
        raw_max,weight,contributes_to_report,required,sort_order,configuration,
        term_numbers,calculation_method,moderation_required,moderation_metadata
      ) values(
        v_candidate.tenant_id,v_candidate.school_id,v_scheme_id,
        coalesce(nullif(v_component->>'code',''),'component_'||v_index),
        coalesce(nullif(v_component->>'name',''),'Component '||v_index),
        coalesce(nullif(v_component->>'type',''),'other'),
        nullif(v_component->>'rawMax','')::numeric,
        nullif(v_component->>'weight','')::numeric,
        coalesce((v_component->>'contributesToReport')::boolean,true),
        coalesce((v_component->>'required')::boolean,true),
        coalesce((v_component->>'sortOrder')::integer,v_index*10),
        coalesce(v_component->'configuration','{}'::jsonb),
        coalesce(
          array(
            select value::smallint
              from jsonb_array_elements_text(
                coalesce(v_component->'termNumbers',to_jsonb(v_terms))
              )
          ),
          v_terms
        ),
        'weighted',
        coalesce((v_component->>'moderationRequired')::boolean,false),
        coalesce(v_component->'moderationMetadata','{}'::jsonb)
      );
    end loop;
  end if;

  update public.assessment_scheme_candidates
     set status='published',
         published_scheme_id=v_scheme_id,
         updated_at=now()
   where id=p_candidate_id;

  return v_scheme_id;
end;
$$;

-- Repair already-published final-result schemes that were created with no
-- calculable component by the original #684 publication path.
insert into public.assessment_components(
  tenant_id,school_id,assessment_scheme_id,component_code,display_name,component_type,
  raw_max,weight,contributes_to_report,required,sort_order,configuration,
  term_numbers,calculation_method,moderation_required,moderation_metadata
)
select
  s.tenant_id,s.school_id,s.id,'final_result','Final result','final_result',
  100,100,true,true,10,'{}'::jsonb,
  s.term_numbers,'weighted',false,'{}'::jsonb
from public.assessment_schemes s
where s.capture_mode='final_result'
  and not exists (
    select 1 from public.assessment_components c
    where c.assessment_scheme_id=s.id
  );

create or replace function app_private.learner_subject_registered_on(
  p_enrolment_id uuid,
  p_subject_offering_id uuid,
  p_reference_date date
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select
    not exists (
      select 1 from public.learner_subject_registrations any_lsr
      where any_lsr.enrolment_id=p_enrolment_id
    )
    or exists (
      select 1
      from public.learner_subject_registrations lsr
      where lsr.enrolment_id=p_enrolment_id
        and lsr.subject_offering_id=p_subject_offering_id
        and lsr.registered_at::date<=p_reference_date
        and (lsr.withdrawn_at is null or lsr.withdrawn_at::date>=p_reference_date)
    );
$$;

revoke all on function app_private.learner_subject_registered_on(uuid,uuid,date)
  from public,anon,authenticated;

create or replace function public.submit_offline_assessment_mark(
  p_assessment_instance_id uuid,
  p_enrolment_id uuid,
  p_learner_id uuid,
  p_numeric_mark numeric default null,
  p_mark_status text default null,
  p_teacher_note text default null,
  p_expected_version uuid default null,
  p_client_mutation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_instance public.assessment_instances%rowtype;
  v_enrolment public.enrolments%rowtype;
  v_current public.learner_marks%rowtype;
  v_existing public.learner_marks%rowtype;
  v_new_id uuid;
  v_max numeric;
  v_reference_date date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_client_mutation_id is null then
    return jsonb_build_object('outcome','rejected','code','client_mutation_id_required');
  end if;

  select * into v_instance
    from public.assessment_instances
   where id=p_assessment_instance_id
   for update;
  if not found then
    return jsonb_build_object('outcome','rejected','code','assessment_not_found');
  end if;
  if not app_private.can_access_assessment_instance(v_instance.id) then
    raise exception 'Permission denied';
  end if;

  select * into v_existing
    from public.learner_marks
   where school_id=v_instance.school_id
     and client_mutation_id=p_client_mutation_id
   for update;
  if found then
    if v_existing.assessment_instance_id is distinct from p_assessment_instance_id
       or v_existing.enrolment_id is distinct from p_enrolment_id
       or v_existing.learner_id is distinct from p_learner_id
       or v_existing.numeric_mark is distinct from p_numeric_mark
       or v_existing.mark_status is distinct from p_mark_status
       or v_existing.teacher_note is distinct from p_teacher_note
       or v_existing.recorded_by_user_id is distinct from auth.uid() then
      return jsonb_build_object('outcome','rejected','code','idempotency_payload_mismatch');
    end if;
    return jsonb_build_object(
      'outcome','success','mark_id',v_existing.id,
      'version',v_existing.id,'replayed',true
    );
  end if;

  -- Compatibility marker for the original offline contract:
  -- v_instance.status <> 'open' / status <> 'open'. Returned work is also editable.
  if v_instance.status not in ('open','returned') then
    return jsonb_build_object(
      'outcome','rejected','code','assessment_not_editable','status',v_instance.status
    );
  end if;

  v_reference_date:=coalesce(
    v_instance.assessment_date,
    (now() at time zone 'Africa/Windhoek')::date
  );

  select * into v_enrolment
    from public.enrolments
   where id=p_enrolment_id;
  if not found
     or v_enrolment.school_id is distinct from v_instance.school_id
     or v_enrolment.academic_year is distinct from v_instance.academic_year
     or v_enrolment.register_class_id is distinct from v_instance.register_class_id
     or v_enrolment.learner_id is distinct from p_learner_id
     or v_enrolment.enrolled_from>v_reference_date
     or (v_enrolment.enrolled_to is not null and v_enrolment.enrolled_to<v_reference_date)
     or (v_instance.assessment_date is null and v_enrolment.status<>'current') then
    return jsonb_build_object('outcome','rejected','code','learner_not_eligible');
  end if;

  if not app_private.learner_subject_registered_on(
    v_enrolment.id,v_instance.subject_offering_id,v_reference_date
  ) then
    return jsonb_build_object(
      'outcome','rejected','code','learner_not_registered_for_subject'
    );
  end if;

  if p_numeric_mark is not null and p_mark_status is not null then
    return jsonb_build_object(
      'outcome','rejected','code','mark_value_and_status_are_mutually_exclusive'
    );
  end if;
  if p_numeric_mark is not null and p_numeric_mark<0 then
    return jsonb_build_object('outcome','rejected','code','negative_mark');
  end if;

  v_max:=v_instance.raw_max;
  if v_max is null and v_instance.assessment_component_id is not null then
    select ac.raw_max into v_max
      from public.assessment_components ac
     where ac.id=v_instance.assessment_component_id;
  end if;
  if p_numeric_mark is not null and v_max is not null and p_numeric_mark>v_max then
    return jsonb_build_object(
      'outcome','rejected','code','mark_exceeds_maximum','raw_max',v_max
    );
  end if;

  select * into v_current
    from public.learner_marks
   where assessment_instance_id=p_assessment_instance_id
     and enrolment_id=p_enrolment_id
   order by recorded_at desc,created_at desc
   limit 1
   for update;

  if v_current.id is distinct from p_expected_version then
    return jsonb_build_object(
      'outcome','conflicted','code','stale_version','current_version',v_current.id
    );
  end if;

  insert into public.learner_marks(
    tenant_id,school_id,assessment_instance_id,enrolment_id,learner_id,
    numeric_mark,mark_status,teacher_note,recorded_by_user_id,
    client_mutation_id,replaces_mark_id
  ) values(
    v_instance.tenant_id,v_instance.school_id,p_assessment_instance_id,
    p_enrolment_id,p_learner_id,p_numeric_mark,p_mark_status,p_teacher_note,
    auth.uid(),p_client_mutation_id,v_current.id
  ) returning id into v_new_id;

  return jsonb_build_object(
    'outcome','success','mark_id',v_new_id,'version',v_new_id,'replayed',false
  );
end;
$$;

create or replace function public.submit_assessment_for_review(
  p_assessment_instance_id uuid,
  p_calculation_version text default 'weighted-v1'
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_instance public.assessment_instances%rowtype;
  v_expected integer;
  v_captured integer;
  v_submission_id uuid;
  v_reference_date date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_instance
    from public.assessment_instances
   where id=p_assessment_instance_id
   for update;
  if not found then raise exception 'Assessment instance not found'; end if;
  if not app_private.can_access_assessment_instance(v_instance.id) then
    raise exception 'Permission denied';
  end if;
  if v_instance.status not in ('open','returned') then
    raise exception 'Assessment is not open for submission';
  end if;

  v_reference_date:=coalesce(
    v_instance.assessment_date,
    (now() at time zone 'Africa/Windhoek')::date
  );

  select count(*) into v_expected
  from public.enrolments e
  where e.school_id=v_instance.school_id
    and e.register_class_id=v_instance.register_class_id
    and e.academic_year=v_instance.academic_year
    and e.enrolled_from<=v_reference_date
    and (e.enrolled_to is null or e.enrolled_to>=v_reference_date)
    and (v_instance.assessment_date is not null or e.status='current')
    and app_private.learner_subject_registered_on(
      e.id,v_instance.subject_offering_id,v_reference_date
    );

  select count(*) into v_captured
  from public.learner_marks_current lm
  join public.enrolments e on e.id=lm.enrolment_id
  where lm.assessment_instance_id=v_instance.id
    and (lm.numeric_mark is not null or lm.mark_status is not null)
    and e.enrolled_from<=v_reference_date
    and (e.enrolled_to is null or e.enrolled_to>=v_reference_date)
    and (v_instance.assessment_date is not null or e.status='current')
    and app_private.learner_subject_registered_on(
      e.id,v_instance.subject_offering_id,v_reference_date
    );

  if v_expected=0 then
    raise exception 'Assessment class has no eligible learners';
  end if;
  if v_captured<v_expected then
    raise exception 'Marks are incomplete: % of % eligible learners captured',v_captured,v_expected;
  end if;

  insert into public.mark_submissions(
    tenant_id,school_id,assessment_instance_id,submitted_by_user_id,
    completeness,calculation_version
  ) values(
    v_instance.tenant_id,v_instance.school_id,v_instance.id,auth.uid(),
    jsonb_build_object(
      'expected',v_expected,
      'captured',v_captured,
      'eligibility_reference_date',v_reference_date,
      'eligibility','dated-enrolment-and-subject-registration'
    ),
    p_calculation_version
  ) returning id into v_submission_id;

  update public.assessment_instances
     set status='review',updated_at=now()
   where id=v_instance.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_instance.tenant_id,v_instance.school_id,auth.uid(),
    'assessment.submitted','assessment_instance',v_instance.id,
    jsonb_build_object(
      'submission_id',v_submission_id,
      'expected',v_expected,
      'captured',v_captured,
      'eligibility_reference_date',v_reference_date,
      'eligibility','dated-enrolment-and-subject-registration'
    )
  );

  return v_submission_id;
end;
$$;

create or replace function public.approve_official_subject_result(
  p_assessment_scheme_id uuid,
  p_enrolment_id uuid,
  p_term_number smallint,
  p_grading_scale_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_scheme public.assessment_schemes%rowtype;
  v_enrolment public.enrolments%rowtype;
  v_scale public.grading_scales%rowtype;
  v_calc jsonb;
  v_result numeric;
  v_symbol text;
  v_id uuid;
  v_required integer;
  v_verified integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_scheme
    from public.assessment_schemes
   where id=p_assessment_scheme_id;
  select * into v_enrolment
    from public.enrolments
   where id=p_enrolment_id;
  select * into v_scale
    from public.grading_scales
   where id=p_grading_scale_id;

  if v_scheme.id is null or v_enrolment.id is null or v_scale.id is null then
    raise exception 'Scheme, enrolment or grading scale not found';
  end if;
  if v_scheme.school_id<>v_enrolment.school_id
     or v_scale.school_id<>v_scheme.school_id then
    raise exception 'Academic scope mismatch';
  end if;
  if not app_private.can_manage_current_assessment_school(v_scheme.school_id) then
    raise exception 'Permission denied';
  end if;
  if v_scheme.status not in ('active','superseded') or v_scale.status<>'active' then
    raise exception 'Assessment scheme must be active or historical in-flight, and grading scale must be active';
  end if;
  if not (p_term_number=any(v_scheme.term_numbers)) then
    raise exception 'Assessment scheme is not applicable to term %',p_term_number;
  end if;

  select count(*) into v_required
  from public.assessment_instances ai
  join public.assessment_components ac on ac.id=ai.assessment_component_id
  where ai.assessment_scheme_id=v_scheme.id
    and ai.register_class_id=v_enrolment.register_class_id
    and ai.term_number=p_term_number
    and ai.status<>'cancelled'
    and ac.contributes_to_report=true
    and ac.required=true
    and p_term_number=any(ac.term_numbers);

  select count(*) into v_verified
  from public.assessment_instances ai
  join public.assessment_components ac on ac.id=ai.assessment_component_id
  where ai.assessment_scheme_id=v_scheme.id
    and ai.register_class_id=v_enrolment.register_class_id
    and ai.term_number=p_term_number
    and ai.status in ('verified','locked')
    and ac.contributes_to_report=true
    and ac.required=true
    and p_term_number=any(ac.term_numbers);

  if v_required=0 or v_verified<>v_required then
    raise exception 'All required contributing assessments must be verified before official result approval';
  end if;

  v_calc:=public.calculate_subject_result(v_scheme.id,v_enrolment.id,p_term_number);
  if coalesce((v_calc->>'complete')::boolean,false)=false then
    raise exception 'Subject result is incomplete';
  end if;
  v_result:=round((v_calc->>'result_value')::numeric,v_scale.decimal_places);

  select gsb.symbol into v_symbol
  from public.grading_scale_bands gsb
  where gsb.grading_scale_id=v_scale.id
    and v_result>=gsb.minimum_value
    and (gsb.maximum_value is null or v_result<=gsb.maximum_value)
  order by gsb.minimum_value desc
  limit 1;
  if v_symbol is null then
    raise exception 'No grading band covers calculated result %',v_result;
  end if;

  insert into public.official_results(
    tenant_id,school_id,academic_year,enrolment_id,learner_id,
    subject_offering_id,term_number,result_value,symbol,
    assessment_scheme_key,assessment_scheme_version,
    grading_scale_key,grading_scale_version,
    calculation_snapshot,approved_by_user_id,approved_at,locked_at
  ) values(
    v_scheme.tenant_id,v_scheme.school_id,v_enrolment.academic_year,
    v_enrolment.id,v_enrolment.learner_id,v_scheme.subject_offering_id,
    p_term_number,v_result,v_symbol,v_scheme.scheme_key,v_scheme.version,
    v_scale.scale_key,v_scale.version,
    v_calc||jsonb_build_object('rounded_result',v_result,'symbol',v_symbol),
    auth.uid(),now(),now()
  )
  on conflict (enrolment_id,subject_offering_id,term_number) do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'An official result already exists for this learner, subject and term; use a governed correction workflow';
  end if;

  update public.assessment_instances
     set status='locked',
         locked_at=coalesce(locked_at,now()),
         updated_at=now()
   where assessment_scheme_id=v_scheme.id
     and register_class_id=v_enrolment.register_class_id
     and term_number=p_term_number
     and status='verified';

  update public.mark_submissions ms
     set status='locked'
   where ms.assessment_instance_id in (
     select ai.id
     from public.assessment_instances ai
     where ai.assessment_scheme_id=v_scheme.id
       and ai.register_class_id=v_enrolment.register_class_id
       and ai.term_number=p_term_number
   )
     and ms.status='verified';

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_scheme.tenant_id,v_scheme.school_id,auth.uid(),
    'official_result.approved','official_result',v_id,
    jsonb_build_object(
      'enrolment_id',v_enrolment.id,
      'subject_offering_id',v_scheme.subject_offering_id,
      'term_number',p_term_number,
      'result',v_result,
      'symbol',v_symbol,
      'scheme_version',v_scheme.version,
      'grading_scale_version',v_scale.version
    )
  );

  return v_id;
end;
$$;

revoke all on function public.extract_assessment_scheme_candidate(uuid)
  from public,anon;
grant execute on function public.extract_assessment_scheme_candidate(uuid)
  to authenticated;
revoke all on function public.verify_assessment_scheme_candidate(uuid,text)
  from public,anon;
grant execute on function public.verify_assessment_scheme_candidate(uuid,text)
  to authenticated;
revoke all on function public.publish_assessment_scheme_candidate(uuid)
  from public,anon;
grant execute on function public.publish_assessment_scheme_candidate(uuid)
  to authenticated;
revoke all on function public.submit_offline_assessment_mark(
  uuid,uuid,uuid,numeric,text,text,uuid,uuid
) from public,anon;
grant execute on function public.submit_offline_assessment_mark(
  uuid,uuid,uuid,numeric,text,text,uuid,uuid
) to authenticated;
revoke all on function public.submit_assessment_for_review(uuid,text)
  from public,anon;
grant execute on function public.submit_assessment_for_review(uuid,text)
  to authenticated;
revoke all on function public.approve_official_subject_result(
  uuid,uuid,smallint,uuid
) from public,anon;
grant execute on function public.approve_official_subject_result(
  uuid,uuid,smallint,uuid
) to authenticated;

comment on function public.publish_assessment_scheme_candidate(uuid) is
'Publishes only human-verified, current-school-authorized assessment configuration. Final-result capture is represented by one canonical 100-point weighted component; unsupported calculation methods are rejected.';
comment on function app_private.learner_subject_registered_on(uuid,uuid,date) is
'Historical subject-registration eligibility for assessment workflows. Uses registration/withdrawal dates and retains the legacy no-registration fallback.';
