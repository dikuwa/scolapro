create or replace function app_private.build_subject_registration_readiness_source(
  p_school_id uuid,
  p_academic_year integer,
  p_reference_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $$
declare
  v_school_tenant uuid;
  v_eligible integer;
  v_with_subjects integer;
  v_without_subjects integer;
  v_active_registrations integer;
  v_offerings jsonb;
begin
  select s.tenant_id into v_school_tenant
  from public.schools s where s.id=p_school_id;
  if v_school_tenant is null then raise exception 'School not found'; end if;

  with eligible as (
    select e.id
    from public.enrolments e
    where e.school_id=p_school_id
      and e.academic_year=p_academic_year
      and e.enrolled_from<=p_reference_date
      and (e.enrolled_to is null or e.enrolled_to>=p_reference_date)
      and e.status in ('current','transferred','completed')
  ), registered as (
    select distinct r.enrolment_id
    from public.learner_subject_registrations r
    join eligible e on e.id=r.enrolment_id
    where r.registered_at::date<=p_reference_date
      and (r.status='active' or r.withdrawn_at::date>p_reference_date)
  )
  select count(*)::integer,
         count(*) filter(where r.enrolment_id is not null)::integer,
         count(*) filter(where r.enrolment_id is null)::integer
  into v_eligible,v_with_subjects,v_without_subjects
  from eligible e
  left join registered r on r.enrolment_id=e.id;

  select count(*)::integer into v_active_registrations
  from public.learner_subject_registrations r
  join public.enrolments e on e.id=r.enrolment_id
  where r.school_id=p_school_id
    and r.academic_year=p_academic_year
    and e.enrolled_from<=p_reference_date
    and (e.enrolled_to is null or e.enrolled_to>=p_reference_date)
    and e.status in ('current','transferred','completed')
    and r.registered_at::date<=p_reference_date
    and (r.status='active' or r.withdrawn_at::date>p_reference_date);

  select coalesce(jsonb_agg(jsonb_build_object(
    'subject_offering_id',x.subject_offering_id,
    'subject_id',x.subject_id,
    'subject_code',x.subject_code,
    'subject_name',x.subject_name,
    'grade_id',x.grade_id,
    'grade_code',x.grade_code,
    'grade_name',x.grade_name,
    'offering_status',x.offering_status,
    'female',x.female,
    'male',x.male,
    'other_or_unspecified',x.other_sex,
    'registered_learners',x.total
  ) order by x.grade_code,x.subject_code),'[]'::jsonb)
  into v_offerings
  from (
    select
      so.id subject_offering_id,
      s.id subject_id,
      s.subject_code,
      s.display_name subject_name,
      g.id grade_id,
      g.grade_code,
      g.display_name grade_name,
      so.status offering_status,
      count(e.id) filter(where lower(coalesce(l.sex,''))='female') female,
      count(e.id) filter(where lower(coalesce(l.sex,''))='male') male,
      count(e.id) filter(where e.id is not null and lower(coalesce(l.sex,'')) not in ('female','male')) other_sex,
      count(e.id) total
    from public.subject_offerings so
    join public.subjects s on s.id=so.subject_id
    join public.grades g on g.id=so.grade_id
    left join public.learner_subject_registrations r
      on r.subject_offering_id=so.id
      and r.registered_at::date<=p_reference_date
      and (r.status='active' or r.withdrawn_at::date>p_reference_date)
    left join public.enrolments e
      on e.id=r.enrolment_id
      and e.school_id=p_school_id
      and e.academic_year=p_academic_year
      and e.enrolled_from<=p_reference_date
      and (e.enrolled_to is null or e.enrolled_to>=p_reference_date)
      and e.status in ('current','transferred','completed')
    left join public.learners l on l.id=e.learner_id
    where so.school_id=p_school_id
      and so.academic_year=p_academic_year
    group by so.id,s.id,s.subject_code,s.display_name,g.id,g.grade_code,g.display_name,so.status
  ) x;

  return jsonb_build_object(
    'reference_date',p_reference_date,
    'academic_year',p_academic_year,
    'eligible_enrolments',coalesce(v_eligible,0),
    'enrolments_with_registered_subjects',coalesce(v_with_subjects,0),
    'enrolments_without_registered_subjects',coalesce(v_without_subjects,0),
    'active_registrations',coalesce(v_active_registrations,0),
    'configured_offerings',jsonb_array_length(v_offerings),
    'offerings',v_offerings,
    'coverage_status',case
      when jsonb_array_length(v_offerings)=0 then 'not_configured'
      when coalesce(v_without_subjects,0)=0 then 'complete'
      else 'incomplete'
    end
  );
end;
$$;

revoke all on function app_private.build_subject_registration_readiness_source(uuid,integer,date) from public,anon,authenticated;

comment on function app_private.build_subject_registration_readiness_source(uuid,integer,date) is
  'Reference-date subject-choice readiness source. Offering counts include only enrolments eligible at the reporting date; ended or otherwise ineligible enrolments remain historical but do not inflate current statutory counts.';
