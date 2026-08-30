-- Subject-result calculation is learner-specific academic access. Teachers/class
-- teachers may calculate only for the exact subject offering and register class they
-- actively teach; leadership/HOD and Platform Admin retain governed oversight.

create or replace function app_private.can_calculate_subject_result(
  p_assessment_scheme_id uuid,
  p_enrolment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select exists(
    select 1
    from public.assessment_schemes s
    join public.subject_offerings so on so.id=s.subject_offering_id
    join public.enrolments e on e.id=p_enrolment_id
    where s.id=p_assessment_scheme_id
      and so.school_id=s.school_id
      and e.school_id=s.school_id
      and e.academic_year=so.academic_year
      and (
        app_private.has_platform_role(array['platform_admin'])
        or app_private.has_school_role(s.school_id,array['school_admin','principal','deputy_principal','hod'])
        or exists(
          select 1
          from public.school_memberships sm
          join public.staff_members staff on staff.id=sm.staff_member_id
          join public.teacher_allocations ta
            on ta.staff_member_id=staff.id
           and ta.school_id=s.school_id
           and ta.academic_year=so.academic_year
           and ta.subject_offering_id=s.subject_offering_id
           and ta.register_class_id=e.register_class_id
           and ta.active_from<=current_date
           and (ta.active_to is null or ta.active_to>=current_date)
          where sm.school_id=s.school_id
            and sm.user_id=(select auth.uid())
            and sm.role_key in ('teacher','class_teacher')
            and sm.active_from<=current_date
            and (sm.active_to is null or sm.active_to>=current_date)
            and staff.status='active'
        )
      )
  );
$$;

revoke all on function app_private.can_calculate_subject_result(uuid,uuid) from public,anon;
grant execute on function app_private.can_calculate_subject_result(uuid,uuid) to authenticated;

comment on function app_private.can_calculate_subject_result(uuid,uuid) is
'Teacher/class-teacher subject-result access requires an active teacher allocation for the exact subject offering and learner register class. Leadership/HOD and Platform Admin retain governed oversight.';

create or replace function public.calculate_subject_result(
  p_assessment_scheme_id uuid,
  p_enrolment_id uuid,
  p_term_number smallint
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,app_private
as $$
declare
  v_scheme public.assessment_schemes%rowtype;
  v_enrolment public.enrolments%rowtype;
  v_component record;
  v_mark record;
  v_total numeric := 0;
  v_weight_total numeric := 0;
  v_missing jsonb := '[]'::jsonb;
  v_non_numeric jsonb := '[]'::jsonb;
  v_inputs jsonb := '[]'::jsonb;
  v_raw_max numeric;
  v_contribution numeric;
  v_final numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_scheme from public.assessment_schemes where id=p_assessment_scheme_id;
  if not found then raise exception 'Assessment scheme not found'; end if;
  select * into v_enrolment from public.enrolments where id=p_enrolment_id;
  if not found or v_enrolment.school_id<>v_scheme.school_id then
    raise exception 'Enrolment is outside the assessment scheme school';
  end if;
  if not app_private.can_calculate_subject_result(v_scheme.id,v_enrolment.id) then
    raise exception 'Permission denied';
  end if;

  for v_component in
    select ac.*,ai.id as instance_id,ai.raw_max as instance_raw_max
    from public.assessment_components ac
    left join public.assessment_instances ai
      on ai.assessment_component_id=ac.id
     and ai.assessment_scheme_id=v_scheme.id
     and ai.register_class_id=v_enrolment.register_class_id
     and ai.term_number=p_term_number
     and ai.status<>'cancelled'
    where ac.assessment_scheme_id=v_scheme.id
      and ac.contributes_to_report=true
    order by ac.sort_order,ac.component_code
  loop
    if v_component.instance_id is null then
      if v_component.required then
        v_missing:=v_missing||jsonb_build_array(jsonb_build_object('component',v_component.component_code,'reason','assessment_instance_missing'));
      end if;
      continue;
    end if;
    select lm.numeric_mark,lm.mark_status,lm.recorded_at
      into v_mark
    from public.learner_marks_current lm
    where lm.assessment_instance_id=v_component.instance_id
      and lm.enrolment_id=v_enrolment.id;
    if v_mark.numeric_mark is null and v_mark.mark_status is null then
      if v_component.required then
        v_missing:=v_missing||jsonb_build_array(jsonb_build_object('component',v_component.component_code,'reason','mark_missing'));
      end if;
      continue;
    end if;
    if v_mark.mark_status is not null then
      v_non_numeric:=v_non_numeric||jsonb_build_array(jsonb_build_object('component',v_component.component_code,'status',v_mark.mark_status));
      if v_component.required then
        v_missing:=v_missing||jsonb_build_array(jsonb_build_object('component',v_component.component_code,'reason',v_mark.mark_status));
      end if;
      continue;
    end if;
    v_raw_max:=coalesce(v_component.instance_raw_max,v_component.raw_max);
    if v_raw_max is null or v_raw_max<=0 then raise exception 'Contributing component % has no valid raw maximum',v_component.component_code; end if;
    if v_component.weight is null then raise exception 'Contributing component % has no configured weight',v_component.component_code; end if;
    v_contribution:=(v_mark.numeric_mark/v_raw_max)*v_component.weight;
    v_total:=v_total+v_contribution;
    v_weight_total:=v_weight_total+v_component.weight;
    v_inputs:=v_inputs||jsonb_build_array(jsonb_build_object(
      'component',v_component.component_code,
      'assessment_instance_id',v_component.instance_id,
      'raw_mark',v_mark.numeric_mark,
      'raw_max',v_raw_max,
      'weight',v_component.weight,
      'contribution',v_contribution
    ));
  end loop;

  if jsonb_array_length(v_missing)>0 then
    return jsonb_build_object('complete',false,'result_status','incomplete','missing',v_missing,'non_numeric',v_non_numeric,'inputs',v_inputs,'weight_total',v_weight_total);
  end if;
  if v_weight_total<=0 then
    return jsonb_build_object('complete',false,'result_status','incomplete','missing',jsonb_build_array(jsonb_build_object('reason','no_contributing_weight')),'inputs',v_inputs);
  end if;
  v_final:=(v_total/v_weight_total)*100;
  return jsonb_build_object(
    'complete',true,
    'result_value',v_final,
    'weight_total',v_weight_total,
    'inputs',v_inputs,
    'assessment_scheme_key',v_scheme.scheme_key,
    'assessment_scheme_version',v_scheme.version,
    'term_number',p_term_number
  );
end;
$$;
