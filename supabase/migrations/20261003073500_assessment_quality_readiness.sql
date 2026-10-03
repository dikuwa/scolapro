-- Issue #994: Assessment quality and readiness analysis.
-- Read-only analysis over canonical schemes, instances, current mark revisions and moderation lifecycle.
-- No second marks/results store and no teacher ranking/score is introduced.

create or replace function public.get_assessment_quality_readiness(
  p_school_id uuid,
  p_academic_year integer,
  p_term_number smallint default null
)
returns table(
  assessment_instance_id uuid,
  assessment_scheme_id uuid,
  capture_mode text,
  assessment_component_id uuid,
  component_name text,
  component_type text,
  component_category text,
  component_required boolean,
  moderation_required boolean,
  subject_offering_id uuid,
  subject_id uuid,
  subject_name text,
  grade_name text,
  register_class_id uuid,
  class_name text,
  teacher_staff_member_id uuid,
  teacher_name text,
  term_number smallint,
  instance_status text,
  readiness_status text,
  expected_learners integer,
  captured_records integer,
  numeric_records integer,
  status_records integer,
  missing_required_records integer,
  completion_percent numeric,
  average_percent numeric,
  median_percent numeric,
  high_percent numeric,
  low_percent numeric,
  mark_status_counts jsonb,
  analysis_status text
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $quality_readiness$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_school_id is null or p_academic_year is null then
    raise exception 'School and academic year are required';
  end if;
  if p_academic_year<2000 or p_academic_year>2200 then
    raise exception 'Academic year is invalid';
  end if;
  if p_term_number is not null and p_term_number not between 1 and 6 then
    raise exception 'Term number is invalid';
  end if;
  if not app_private.user_current_school_matches(auth.uid(),p_school_id) then
    raise exception 'Permission denied';
  end if;

  return query
  with scoped as (
    select
      ai.*,
      sc.capture_mode,
      ac.display_name as component_name,
      ac.component_type,
      coalesce(ac.required,false) as component_required,
      coalesce(ac.moderation_required,false) as moderation_required,
      coalesce(ai.raw_max,ac.raw_max) as effective_raw_max,
      so.subject_id,
      subject.display_name as subject_name,
      grade.display_name as grade_name,
      rc.display_name as class_name,
      ta.staff_member_id as teacher_staff_member_id,
      concat_ws(' ',staff.first_name,staff.last_name) as teacher_name
    from public.assessment_instances ai
    join public.assessment_schemes sc on sc.id=ai.assessment_scheme_id
    join public.subject_offerings so on so.id=ai.subject_offering_id
    join public.subjects subject on subject.id=so.subject_id
    join public.grades grade on grade.id=so.grade_id
    join public.register_classes rc on rc.id=ai.register_class_id
    left join public.assessment_components ac on ac.id=ai.assessment_component_id
    left join public.teacher_allocations ta on ta.id=ai.teacher_allocation_id
    left join public.staff_members staff on staff.id=ta.staff_member_id
    where ai.school_id=p_school_id
      and ai.academic_year=p_academic_year
      and (p_term_number is null or ai.term_number=p_term_number)
      and (
        app_private.has_school_role(
          p_school_id,
          array['school_admin','principal','deputy_principal']
        )
        or (
          app_private.has_school_role(p_school_id,array['hod'])
          and app_private.hod_responsible_for_subject(p_school_id,so.subject_id)
        )
        or exists(
          select 1
          from public.school_memberships membership
          where membership.school_id=p_school_id
            and membership.user_id=auth.uid()
            and membership.staff_member_id=ta.staff_member_id
            and membership.active_from<=current_date
            and (membership.active_to is null or membership.active_to>=current_date)
        )
      )
  )
  select
    s.id,
    s.assessment_scheme_id,
    s.capture_mode,
    s.assessment_component_id,
    case when s.capture_mode='final_result' then null else s.component_name end,
    case when s.capture_mode='final_result' then 'final_result' else s.component_type end,
    case
      when s.capture_mode='final_result' then 'final_result'
      when s.component_type in ('exam_paper','exam_total') then 'exam'
      when s.component_type='final_result' then 'final_result'
      else 'ca'
    end,
    case when s.capture_mode='final_result' then false else s.component_required end,
    case when s.capture_mode='final_result' then false else s.moderation_required end,
    s.subject_offering_id,
    s.subject_id,
    s.subject_name,
    s.grade_name,
    s.register_class_id,
    s.class_name,
    s.teacher_staff_member_id,
    nullif(btrim(coalesce(s.teacher_name,'')),''),
    s.term_number,
    s.status,
    case
      when s.status in ('not_open','open') then 'draft'
      when s.status in ('submitted','review') then 'submitted'
      when s.status='returned' then 'returned'
      when s.status='verified' then 'verified'
      when s.status='locked' then 'locked'
      else 'cancelled'
    end,
    eligible.expected_learners,
    marks.captured_records,
    marks.numeric_records,
    marks.status_records,
    case
      when s.capture_mode='final_result' or not s.component_required then 0
      else greatest(eligible.expected_learners-marks.captured_records,0)
    end,
    case
      when s.capture_mode='final_result' then null
      when eligible.expected_learners=0 then null
      else round((marks.captured_records::numeric/eligible.expected_learners::numeric)*100,1)
    end,
    case when s.capture_mode='final_result' then null else marks.average_percent end,
    case when s.capture_mode='final_result' then null else marks.median_percent end,
    case when s.capture_mode='final_result' then null else marks.high_percent end,
    case when s.capture_mode='final_result' then null else marks.low_percent end,
    marks.mark_status_counts,
    case
      when s.capture_mode='final_result' then 'final_result_only'
      when marks.numeric_records=0 then 'no_numeric_marks'
      else 'component_analysis'
    end
  from scoped s
  cross join lateral (
    select count(*)::integer as expected_learners
    from public.enrolments enrolment
    where enrolment.school_id=s.school_id
      and enrolment.academic_year=s.academic_year
      and enrolment.register_class_id=s.register_class_id
      and enrolment.enrolled_from<=coalesce(s.assessment_date,current_date)
      and (enrolment.enrolled_to is null or enrolment.enrolled_to>=coalesce(s.assessment_date,current_date))
      and (
        s.assessment_date is not null
        or enrolment.status='current'
      )
      and app_private.learner_subject_registered_on(
        enrolment.id,
        s.subject_offering_id,
        coalesce(s.assessment_date,current_date)
      )
  ) eligible
  cross join lateral (
    select
      count(*) filter(where mark.numeric_mark is not null or mark.mark_status is not null)::integer as captured_records,
      count(*) filter(where mark.numeric_mark is not null)::integer as numeric_records,
      count(*) filter(where mark.mark_status is not null)::integer as status_records,
      case
        when s.effective_raw_max is null or s.effective_raw_max<=0
          or count(*) filter(where mark.numeric_mark is not null)=0
        then null
        else round(avg(
          case when mark.numeric_mark is not null
            then (mark.numeric_mark/s.effective_raw_max)*100
          end
        ),1)
      end as average_percent,
      case
        when s.effective_raw_max is null or s.effective_raw_max<=0
          or count(*) filter(where mark.numeric_mark is not null)=0
        then null
        else round((
          percentile_cont(0.5) within group (
            order by case when mark.numeric_mark is not null
              then ((mark.numeric_mark/s.effective_raw_max)*100)::double precision
            end
          )
        )::numeric,1)
      end as median_percent,
      case
        when s.effective_raw_max is null or s.effective_raw_max<=0 then null
        else round(max(mark.numeric_mark)/s.effective_raw_max*100,1)
      end as high_percent,
      case
        when s.effective_raw_max is null or s.effective_raw_max<=0 then null
        else round(min(mark.numeric_mark)/s.effective_raw_max*100,1)
      end as low_percent,
      jsonb_build_object(
        'absent',count(*) filter(where mark.mark_status='absent'),
        'exempt',count(*) filter(where mark.mark_status='exempt'),
        'incomplete',count(*) filter(where mark.mark_status='incomplete'),
        'withheld',count(*) filter(where mark.mark_status='withheld')
      ) as mark_status_counts
    from public.learner_marks_current mark
    where mark.assessment_instance_id=s.id
  ) marks
  order by s.grade_name,s.class_name,s.subject_name,s.term_number,s.component_name,s.id;
end;
$quality_readiness$;

revoke all on function public.get_assessment_quality_readiness(uuid,integer,smallint)
from public,anon;
grant execute on function public.get_assessment_quality_readiness(uuid,integer,smallint)
to authenticated;

comment on function public.get_assessment_quality_readiness(uuid,integer,smallint) is
'Read-only Assessment quality/readiness analysis derived from canonical schemes, instances, eligible enrolments and learner_marks_current. Component statistics are descriptive review indicators only; final-result-only schemes explicitly return no component statistics and no teacher score/ranking is produced.';
