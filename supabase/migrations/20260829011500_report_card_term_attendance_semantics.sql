-- Refine report-card snapshot semantics without changing historical snapshots.
-- 1) Year-end progression is included only on the configured final academic term,
--    not by assuming term >= 3.
-- 2) Attendance distinguishes expected school days from recorded register days.

create or replace function public.build_report_card_snapshot(
  p_enrolment_id uuid,
  p_term_number smallint,
  p_template_version text default 'SCOLAPRO_TERM_REPORT_V1'
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_enrol public.enrolments%rowtype;
  v_learner public.learners%rowtype;
  v_class public.register_classes%rowtype;
  v_grade public.grades%rowtype;
  v_term public.academic_terms%rowtype;
  v_results jsonb;
  v_attendance jsonb;
  v_progression jsonb;
  v_guardians jsonb;
  v_version integer;
  v_snapshot_id uuid;
  v_previous uuid;
  v_final_term_number smallint;
  v_expected_school_days integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_term_number<1 or p_term_number>6 then raise exception 'Term number is invalid'; end if;
  if btrim(coalesce(p_template_version,''))='' then raise exception 'Template version is required'; end if;

  select * into v_enrol from public.enrolments where id=p_enrolment_id;
  if not found then raise exception 'Enrolment not found'; end if;
  if not app_private.has_school_role(v_enrol.school_id,array['school_admin','principal','deputy_principal','hod'])
     and not app_private.has_platform_role(array['platform_admin']) then
    raise exception 'Permission denied';
  end if;

  select * into v_learner from public.learners where id=v_enrol.learner_id;
  select * into v_class from public.register_classes where id=v_enrol.register_class_id;
  select * into v_grade from public.grades where id=v_enrol.grade_id;

  select t.* into v_term
  from public.academic_terms t
  join public.academic_years y on y.id=t.academic_year_id
  where t.school_id=v_enrol.school_id
    and y.year=v_enrol.academic_year
    and t.term_number=p_term_number;

  select max(t.term_number)::smallint into v_final_term_number
  from public.academic_terms t
  join public.academic_years y on y.id=t.academic_year_id
  where t.school_id=v_enrol.school_id and y.year=v_enrol.academic_year;

  select coalesce(jsonb_agg(jsonb_build_object(
    'official_result_id',r.id,
    'subject_offering_id',r.subject_offering_id,
    'subject_code',s.subject_code,
    'subject_name',s.display_name,
    'result_value',r.result_value,
    'result_status',r.result_status,
    'symbol',r.symbol,
    'assessment_scheme_key',r.assessment_scheme_key,
    'assessment_scheme_version',r.assessment_scheme_version,
    'academic_rule_set_key',r.academic_rule_set_key,
    'academic_rule_set_version',r.academic_rule_set_version,
    'calculation_snapshot',r.calculation_snapshot,
    'approved_at',r.approved_at
  ) order by s.display_name),'[]'::jsonb)
  into v_results
  from public.official_results r
  join public.subject_offerings so on so.id=r.subject_offering_id
  join public.subjects s on s.id=so.subject_id
  where r.enrolment_id=v_enrol.id and r.term_number=p_term_number;

  if jsonb_array_length(v_results)=0 then
    raise exception 'No approved official results exist for this learner and term';
  end if;

  if v_term.id is not null and v_term.starts_on is not null and v_term.ends_on is not null then
    select count(*)::integer into v_expected_school_days
    from generate_series(v_term.starts_on,v_term.ends_on,interval '1 day') g(day)
    where app_private.is_expected_school_day(v_enrol.school_id,g.day::date)
      and g.day::date >= v_enrol.enrolled_from
      and (v_enrol.enrolled_to is null or g.day::date <= v_enrol.enrolled_to);
  else
    v_expected_school_days:=null;
  end if;

  select jsonb_build_object(
    'expected_school_days',v_expected_school_days,
    'recorded_school_days',count(*),
    'register_coverage_complete',case when v_expected_school_days is null then null else count(*)>=v_expected_school_days end,
    'present',count(*) filter(where status='present'),
    'absent',count(*) filter(where status='absent'),
    'late',count(*) filter(where status='late'),
    'excused',count(*) filter(where status='excused'),
    'unknown',count(*) filter(where status='unknown')
  ) into v_attendance
  from public.daily_register_current d
  where d.enrolment_id=v_enrol.id
    and (
      v_term.id is null
      or (
        (v_term.starts_on is null or d.attendance_date>=v_term.starts_on)
        and (v_term.ends_on is null or d.attendance_date<=v_term.ends_on)
      )
    );

  if v_final_term_number is not null and p_term_number=v_final_term_number then
    select jsonb_build_object(
      'outcome',outcome,
      'rule_set_key',rule_set_key,
      'rule_set_version',rule_set_version,
      'status',status,
      'rationale',rationale
    ) into v_progression
    from public.year_end_progressions
    where enrolment_id=v_enrol.id;
  else
    v_progression:=null;
  end if;

  v_guardians:=app_private.report_card_guardians_snapshot(v_enrol.learner_id);

  select id,snapshot_version into v_previous,v_version
  from public.report_card_snapshots
  where enrolment_id=v_enrol.id and term_number=p_term_number
  order by snapshot_version desc
  limit 1;
  v_version:=coalesce(v_version,0)+1;

  insert into public.report_card_snapshots(
    tenant_id,school_id,learner_id,enrolment_id,academic_year,term_number,
    template_version,snapshot_version,data_snapshot,generated_by_user_id,supersedes_snapshot_id
  ) values(
    v_enrol.tenant_id,v_enrol.school_id,v_enrol.learner_id,v_enrol.id,v_enrol.academic_year,p_term_number,
    btrim(p_template_version),v_version,
    jsonb_build_object(
      'learner',jsonb_build_object(
        'id',v_learner.id,'first_names',v_learner.first_names,'surname',v_learner.surname,
        'preferred_name',v_learner.preferred_name,'date_of_birth',v_learner.date_of_birth,'sex',v_learner.sex
      ),
      'enrolment',jsonb_build_object(
        'id',v_enrol.id,'admission_number',v_enrol.admission_number,'academic_year',v_enrol.academic_year,
        'grade',v_grade.display_name,'register_class',v_class.display_name
      ),
      'term',jsonb_build_object(
        'number',p_term_number,'name',coalesce(v_term.display_name,'Term '||p_term_number),
        'starts_on',v_term.starts_on,'ends_on',v_term.ends_on,'is_final_term',v_final_term_number=p_term_number
      ),
      'results',v_results,
      'attendance',coalesce(v_attendance,'{}'::jsonb),
      'guardians',coalesce(v_guardians,'[]'::jsonb),
      'year_end_progression',v_progression
    ),
    auth.uid(),v_previous
  ) returning id into v_snapshot_id;

  if v_previous is not null then
    update public.report_card_snapshots set status='superseded' where id=v_previous and status='draft';
  end if;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_enrol.tenant_id,v_enrol.school_id,auth.uid(),'report_card.snapshot.generated','report_card_snapshot',v_snapshot_id,
    jsonb_build_object(
      'enrolment_id',v_enrol.id,
      'term_number',p_term_number,
      'snapshot_version',v_version,
      'guardian_count',jsonb_array_length(coalesce(v_guardians,'[]'::jsonb)),
      'expected_school_days',v_expected_school_days,
      'final_term_number',v_final_term_number
    )
  );

  return v_snapshot_id;
end;
$$;

revoke all on function public.build_report_card_snapshot(uuid,smallint,text) from public,anon;
grant execute on function public.build_report_card_snapshot(uuid,smallint,text) to authenticated;
