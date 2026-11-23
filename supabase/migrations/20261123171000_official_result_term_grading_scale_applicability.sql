-- #1316 candidate term-based grading-scale effective-date governance.
-- Governing date = school-configured academic term.ends_on for the result's
-- school, year and term (never the approval action date). This preserves
-- retrospective corrections without silently applying today's scale.
-- If term-end metadata is missing or the scale does not cover it, fail closed.
-- School leadership may configure the missing date via Academic Setup.
-- No national grading threshold or externally imposed policy is hard-coded.
-- CANDIDATE: leave this PR draft pending independent academic policy review.
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
  v_previous public.official_results%rowtype;
  v_calc jsonb;
  v_result numeric;
  v_symbol text;
  v_id uuid;
  v_required integer;
  v_verified integer;
  v_correction_authorization_id uuid;
  v_reissue_required boolean:=false;
  v_term_end date;
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
  -- Official subject results belong to their academic term, not to the
  -- calendar date on which a staff member clicks Approve. Resolve the
  -- school-governed final day for that year/term. The same reference date
  -- applies to original approval and any retrospective authorized reissue.
  select t.ends_on into v_term_end
  from public.academic_terms t
  join public.academic_years y on y.id=t.academic_year_id
  where t.school_id=v_scheme.school_id
    and y.school_id=v_scheme.school_id
    and y.year=v_scheme.academic_year
    and t.term_number=p_term_number;
  if v_term_end is null then
    raise exception 'Configure the academic term end date before approving official results';
  end if;
  if v_scale.effective_from>v_term_end
     or (v_scale.effective_to is not null and v_scale.effective_to<v_term_end) then
    raise exception 'The selected grading scale does not cover the academic term end date';
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
    and ai.correction_pending=false
    and ac.contributes_to_report=true
    and ac.required=true
    and p_term_number=any(ac.term_numbers);

  if v_required=0 or v_verified<>v_required then
    raise exception 'All required contributing assessments must be verified before official result approval';
  end if;

  -- Required-only readiness is insufficient: an optional *contributing*
  -- component can change the calculated result while still awaiting HOD
  -- correction re-verification. Never lock provisional corrected marks.
  if exists(
    select 1
    from public.assessment_instances ai
    join public.assessment_components ac on ac.id=ai.assessment_component_id
    where ai.assessment_scheme_id=v_scheme.id
      and ai.register_class_id=v_enrolment.register_class_id
      and ai.term_number=p_term_number
      and ai.status<>'cancelled'
      and ac.contributes_to_report=true
      and p_term_number=any(ac.term_numbers)
      and ai.correction_pending=true
  ) then
    raise exception 'Contributing assessment corrections require re-verification before official result approval';
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

  select * into v_previous
  from public.official_results
  where enrolment_id=v_enrolment.id
    and subject_offering_id=v_scheme.subject_offering_id
    and term_number=p_term_number
    and superseded_at is null
  for update;

  if found then
    select reopen.id
      into v_correction_authorization_id
    from public.learner_marks mark
    join public.assessment_instances instance
      on instance.id=mark.assessment_instance_id
    join public.assessment_components corrected_component
      on corrected_component.id=instance.assessment_component_id
    join public.assessment_mark_reopen_authorizations reopen
      on reopen.id=mark.correction_authorization_id
    where mark.enrolment_id=v_enrolment.id
      and instance.assessment_scheme_id=v_scheme.id
      and instance.register_class_id=v_enrolment.register_class_id
      and instance.term_number=p_term_number
      and instance.status in ('verified','locked')
      and instance.correction_pending=false
      and corrected_component.contributes_to_report=true
      and p_term_number=any(corrected_component.term_numbers)
      and reopen.requires_reverification=true
      and mark.recorded_at>v_previous.approved_at
    order by mark.recorded_at desc,mark.id desc
    limit 1;

    if v_correction_authorization_id is null then
      raise exception 'Existing official result requires a governed corrected mark and re-verification before replacement';
    end if;

    select exists(
      select 1
      from public.report_card_snapshots snapshot
      where snapshot.enrolment_id=v_enrolment.id
        and snapshot.term_number=p_term_number
        and snapshot.status='published'
    ) into v_reissue_required;

    update public.official_results
       set superseded_at=now()
     where id=v_previous.id;
  end if;

  insert into public.official_results(
    tenant_id,school_id,academic_year,enrolment_id,learner_id,
    subject_offering_id,term_number,result_value,symbol,
    assessment_scheme_key,assessment_scheme_version,
    grading_scale_key,grading_scale_version,
    calculation_snapshot,approved_by_user_id,approved_at,locked_at,
    supersedes_result_id,correction_authorization_id
  ) values(
    v_scheme.tenant_id,v_scheme.school_id,v_enrolment.academic_year,
    v_enrolment.id,v_enrolment.learner_id,v_scheme.subject_offering_id,
    p_term_number,v_result,v_symbol,v_scheme.scheme_key,v_scheme.version,
    v_scale.scale_key,v_scale.version,
    v_calc||jsonb_build_object(
      'rounded_result',v_result,
      'symbol',v_symbol,
      'correction_authorization_id',v_correction_authorization_id,
      'supersedes_result_id',v_previous.id
    ),
    auth.uid(),now(),now(),
    v_previous.id,v_correction_authorization_id
  )
  returning id into v_id;

  if v_previous.id is not null then
    update public.official_results
       set superseded_by_result_id=v_id
     where id=v_previous.id;
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
    case when v_previous.id is null then 'official_result.approved' else 'official_result.corrected' end,
    'official_result',v_id,
    jsonb_build_object(
      'enrolment_id',v_enrolment.id,
      'subject_offering_id',v_scheme.subject_offering_id,
      'term_number',p_term_number,
      'result',v_result,
      'symbol',v_symbol,
      'scheme_version',v_scheme.version,
      'grading_scale_version',v_scale.version,
      'supersedes_result_id',v_previous.id,
      'correction_authorization_id',v_correction_authorization_id,
      'report_reissue_required',v_reissue_required
    )
  );

  if v_reissue_required then
    insert into public.audit_events(
      tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
    ) values(
      v_scheme.tenant_id,v_scheme.school_id,auth.uid(),
      'report_card.reissue_required','official_result',v_id,
      jsonb_build_object(
        'enrolment_id',v_enrolment.id,
        'term_number',p_term_number,
        'superseded_result_id',v_previous.id,
        'corrected_result_id',v_id
      )
    );
  end if;

  return v_id;
end;
$$;


revoke all on function public.approve_official_subject_result(uuid,uuid,smallint,uuid)
  from public,anon;
grant execute on function public.approve_official_subject_result(uuid,uuid,smallint,uuid)
  to authenticated;
