-- Promotion attendance must be evaluated only across the learner's actual
-- enrolment interval and only when the daily register covers every expected
-- school day in that interval. Missing register submissions must never be
-- interpreted as presence.

create or replace function public.evaluate_promotion_recommendation(
  p_enrolment_id uuid,
  p_promotion_rule_set_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_enrolment public.enrolments%rowtype;
  v_rules public.promotion_rule_sets%rowtype;
  v_condition record;
  v_subject_result numeric;
  v_subject_count integer;
  v_pass_count integer;
  v_fail_count integer;
  v_avg numeric;
  v_attendance_rate numeric;
  v_expected_days integer;
  v_recorded_days integer;
  v_absent_days integer;
  v_missing_days integer;
  v_failures jsonb := '[]'::jsonb;
  v_checks jsonb := '[]'::jsonb;
  v_pass boolean := true;
  v_condition_pass boolean;
  v_start date;
  v_end date;
  v_year_start date;
  v_year_end date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_enrolment from public.enrolments where id=p_enrolment_id;
  select * into v_rules from public.promotion_rule_sets where id=p_promotion_rule_set_id;
  if v_enrolment.id is null or v_rules.id is null then raise exception 'Enrolment or promotion rule set not found'; end if;
  if v_enrolment.school_id<>v_rules.school_id or v_enrolment.grade_id<>v_rules.grade_id or v_enrolment.academic_year<>v_rules.academic_year then
    raise exception 'Promotion rule set does not match enrolment scope';
  end if;
  if not app_private.has_school_role(v_rules.school_id,array['school_admin','principal','deputy_principal','hod']) then raise exception 'Permission denied'; end if;
  if v_rules.status<>'active' then raise exception 'Promotion rule set must be active'; end if;

  select coalesce(ay.starts_on,make_date(v_rules.academic_year,1,1)),
         coalesce(ay.ends_on,make_date(v_rules.academic_year,12,31))
  into v_year_start,v_year_end
  from public.academic_years ay
  where ay.school_id=v_rules.school_id and ay.year=v_rules.academic_year
  limit 1;
  v_year_start:=coalesce(v_year_start,make_date(v_rules.academic_year,1,1));
  v_year_end:=coalesce(v_year_end,make_date(v_rules.academic_year,12,31));

  select count(*),
         count(*) filter (where coalesce(gsb.pass_classification,'neutral')='pass'),
         count(*) filter (where coalesce(gsb.pass_classification,'neutral')='fail'),
         avg(or1.result_value)
  into v_subject_count,v_pass_count,v_fail_count,v_avg
  from public.official_results or1
  left join public.grading_scales gs on gs.school_id=or1.school_id and gs.scale_key=or1.grading_scale_key and gs.version=or1.grading_scale_version
  left join public.grading_scale_bands gsb on gsb.grading_scale_id=gs.id and or1.result_value>=gsb.minimum_value and (gsb.maximum_value is null or or1.result_value<=gsb.maximum_value)
  where or1.enrolment_id=v_enrolment.id and or1.term_number=v_rules.result_term_number;

  for v_condition in
    select * from public.promotion_rule_conditions
    where promotion_rule_set_id=v_rules.id
    order by sort_order,condition_code
  loop
    v_condition_pass:=true;

    if v_condition.condition_type='minimum_subject_result' then
      if nullif(btrim(coalesce(v_condition.subject_code,'')),'') is null or v_condition.threshold is null then raise exception 'Condition % is not fully configured',v_condition.condition_code; end if;
      select or1.result_value into v_subject_result
      from public.official_results or1
      join public.subject_offerings so on so.id=or1.subject_offering_id
      join public.subjects s on s.id=so.subject_id
      where or1.enrolment_id=v_enrolment.id and or1.term_number=v_rules.result_term_number and upper(s.subject_code)=upper(v_condition.subject_code)
      limit 1;
      v_condition_pass:=v_subject_result is not null and v_subject_result>=v_condition.threshold;

    elsif v_condition.condition_type='minimum_passed_subjects' then
      if v_condition.threshold is null then raise exception 'Condition % has no threshold',v_condition.condition_code; end if;
      v_condition_pass:=v_pass_count>=v_condition.threshold;

    elsif v_condition.condition_type='maximum_failed_subjects' then
      if v_condition.threshold is null then raise exception 'Condition % has no threshold',v_condition.condition_code; end if;
      v_condition_pass:=v_fail_count<=v_condition.threshold;

    elsif v_condition.condition_type='minimum_overall_average' then
      if v_condition.threshold is null then raise exception 'Condition % has no threshold',v_condition.condition_code; end if;
      v_condition_pass:=v_avg is not null and v_avg>=v_condition.threshold;

    elsif v_condition.condition_type='minimum_attendance_rate' then
      if v_condition.threshold is null then raise exception 'Condition % has no threshold',v_condition.condition_code; end if;

      -- Configuration may narrow the evaluation period but may never widen it
      -- beyond the academic year or the learner's actual enrolment interval.
      v_start:=greatest(
        coalesce(nullif(v_condition.configuration->>'starts_on','')::date,v_year_start),
        v_year_start,
        coalesce(v_enrolment.enrolled_from,v_year_start)
      );
      v_end:=least(
        coalesce(nullif(v_condition.configuration->>'ends_on','')::date,v_year_end),
        v_year_end,
        coalesce(v_enrolment.enrolled_to,v_year_end)
      );

      if v_end<v_start then
        v_expected_days:=0;
        v_recorded_days:=0;
        v_absent_days:=0;
        v_missing_days:=0;
        v_attendance_rate:=null;
        v_condition_pass:=false;
        v_failures:=v_failures||jsonb_build_array(jsonb_build_object(
          'code',v_condition.condition_code,
          'type','data_readiness',
          'reason','attendance_period_outside_enrolment'
        ));
      else
        select count(*) into v_expected_days
        from generate_series(v_start,v_end,interval '1 day') d
        where app_private.is_expected_school_day(v_rules.school_id,d::date);

        select count(distinct dr.attendance_date),
               count(distinct dr.attendance_date) filter (where dr.status='absent')
        into v_recorded_days,v_absent_days
        from public.daily_register_current dr
        where dr.enrolment_id=v_enrolment.id
          and dr.school_id=v_rules.school_id
          and dr.attendance_date between v_start and v_end
          and app_private.is_expected_school_day(v_rules.school_id,dr.attendance_date);

        v_missing_days:=greatest(v_expected_days-v_recorded_days,0);

        if v_expected_days=0 or v_recorded_days<v_expected_days then
          -- Incomplete evidence is a data-readiness failure. Do not infer that
          -- unrecorded days were attended.
          v_attendance_rate:=null;
          v_condition_pass:=false;
          v_failures:=v_failures||jsonb_build_array(jsonb_build_object(
            'code',v_condition.condition_code,
            'type','data_readiness',
            'reason',case when v_expected_days=0 then 'no_expected_school_days' else 'incomplete_attendance_register' end,
            'expected_school_days',v_expected_days,
            'recorded_school_days',v_recorded_days,
            'missing_register_days',v_missing_days
          ));
        else
          v_attendance_rate:=round(((v_expected_days-v_absent_days)::numeric/v_expected_days)*100,2);
          v_condition_pass:=v_attendance_rate>=v_condition.threshold;
        end if;
      end if;

    elsif v_condition.condition_type='manual_review_required' then
      v_condition_pass:=false;
    end if;

    v_checks:=v_checks||jsonb_build_array(
      jsonb_build_object(
        'code',v_condition.condition_code,
        'type',v_condition.condition_type,
        'required',v_condition.required,
        'passed',v_condition_pass,
        'threshold',v_condition.threshold,
        'subject_code',v_condition.subject_code
      ) || case when v_condition.condition_type='minimum_attendance_rate' then jsonb_build_object(
        'evaluation_starts_on',v_start,
        'evaluation_ends_on',v_end,
        'expected_school_days',v_expected_days,
        'recorded_school_days',v_recorded_days,
        'missing_register_days',v_missing_days,
        'attendance_rate',v_attendance_rate,
        'register_coverage_complete',coalesce(v_expected_days>0 and v_recorded_days>=v_expected_days,false)
      ) else '{}'::jsonb end
    );

    if v_condition.required and not v_condition_pass then
      v_pass:=false;
      -- Data-readiness failures above carry richer detail; keep the historical
      -- condition failure entry as well for backwards-compatible consumers.
      v_failures:=v_failures||jsonb_build_array(jsonb_build_object('code',v_condition.condition_code,'type',v_condition.condition_type));
    end if;
  end loop;

  if v_subject_count=0 then
    v_pass:=false;
    v_failures:=v_failures||jsonb_build_array(jsonb_build_object('code','no_official_results','type','data_readiness'));
  end if;

  return jsonb_build_object(
    'recommended_outcome',case when v_pass then v_rules.pass_outcome else v_rules.fail_outcome end,
    'passed',v_pass,
    'rule_set_key',v_rules.rule_set_key,
    'rule_set_version',v_rules.version,
    'result_term_number',v_rules.result_term_number,
    'subject_count',v_subject_count,
    'passed_subjects',v_pass_count,
    'failed_subjects',v_fail_count,
    'overall_average',v_avg,
    'attendance_rate',v_attendance_rate,
    'checks',v_checks,
    'failures',v_failures
  );
end;
$$;

revoke all on function public.evaluate_promotion_recommendation(uuid,uuid) from public,anon;
grant execute on function public.evaluate_promotion_recommendation(uuid,uuid) to authenticated;

comment on function public.evaluate_promotion_recommendation(uuid,uuid) is
'Evaluates configured promotion rules. Attendance rules are clamped to enrolment/calendar dates and fail safely when daily-register coverage is incomplete.';
