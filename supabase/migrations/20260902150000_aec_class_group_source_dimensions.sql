create or replace function public.build_school_operational_snapshot(
  p_school_id uuid,
  p_academic_year integer,
  p_reference_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_school public.schools%rowtype;
  v_learners integer;
  v_female integer;
  v_male integer;
  v_other_sex integer;
  v_classes integer;
  v_grades integer;
  v_staff integer;
  v_teachers integer;
  v_allocations integer;
  v_subject_offerings integer;
  v_resource_titles integer;
  v_resource_copies integer;
  v_open_loans integer;
  v_expected_days integer;
  v_absent_events integer;
  v_enrolment_by_grade jsonb;
  v_enrolment_by_grade_and_sex jsonb;
  v_age_distribution jsonb;
  v_class_distribution jsonb;
  v_class_distribution_and_sex jsonb;
  v_unassigned_grade jsonb;
  v_unassigned_register_class jsonb;
  v_teacher_workload jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_school from public.schools where id=p_school_id;
  if not found then raise exception 'School not found'; end if;
  if not app_private.can_manage_statutory(v_school.id) then raise exception 'Permission denied'; end if;

  with current_enrolments as (
    select e.*,l.date_of_birth,l.sex
    from public.enrolments e
    join public.learners l on l.id=e.learner_id
    where e.school_id=v_school.id
      and e.academic_year=p_academic_year
      and e.enrolled_from<=p_reference_date
      and (e.enrolled_to is null or e.enrolled_to>=p_reference_date)
      and e.status in ('current','transferred','completed')
  )
  select count(*),
    count(*) filter(where lower(coalesce(sex,''))='female'),
    count(*) filter(where lower(coalesce(sex,''))='male'),
    count(*) filter(where lower(coalesce(sex,'')) not in ('female','male'))
  into v_learners,v_female,v_male,v_other_sex
  from current_enrolments;

  select count(*) into v_classes from public.register_classes where school_id=v_school.id and academic_year=p_academic_year;
  select count(*) into v_grades from public.grades where school_id=v_school.id and academic_year=p_academic_year;
  select count(distinct sm.staff_member_id) into v_staff from public.school_memberships sm where sm.school_id=v_school.id and sm.staff_member_id is not null and sm.active_from<=p_reference_date and (sm.active_to is null or sm.active_to>=p_reference_date);
  select count(distinct ta.staff_member_id) into v_teachers from public.teacher_allocations ta where ta.school_id=v_school.id and ta.academic_year=p_academic_year and ta.active_from<=p_reference_date and (ta.active_to is null or ta.active_to>=p_reference_date);
  select count(*) into v_allocations from public.teacher_allocations ta where ta.school_id=v_school.id and ta.academic_year=p_academic_year and ta.active_from<=p_reference_date and (ta.active_to is null or ta.active_to>=p_reference_date);
  select count(*) into v_subject_offerings from public.subject_offerings where school_id=v_school.id and academic_year=p_academic_year and status='active';
  select count(*) into v_resource_titles from public.learning_resource_titles where school_id=v_school.id and status='active';
  select count(*) into v_resource_copies from public.learning_resource_copies where school_id=v_school.id and availability<>'withdrawn';
  select count(*) into v_open_loans from public.learning_resource_loans where school_id=v_school.id and status in ('open','overdue');
  select count(*) into v_expected_days from generate_series(make_date(p_academic_year,1,1),p_reference_date,interval '1 day') d where app_private.is_expected_school_day(v_school.id,d::date);
  select count(*) into v_absent_events from public.attendance_events ae where ae.school_id=v_school.id and ae.academic_year=p_academic_year and ae.attendance_date<=p_reference_date and ae.observation_type='daily_register' and ae.status='absent';

  select coalesce(jsonb_agg(jsonb_build_object(
    'grade_id',x.grade_id,
    'grade_code',x.grade_code,
    'grade_name',x.display_name,
    'learners',x.learners
  ) order by x.grade_code),'[]'::jsonb)
  into v_enrolment_by_grade
  from (
    select g.id grade_id,g.grade_code,g.display_name,count(e.id) learners
    from public.grades g
    left join public.enrolments e
      on e.grade_id=g.id
      and e.school_id=g.school_id
      and e.academic_year=g.academic_year
      and e.enrolled_from<=p_reference_date
      and (e.enrolled_to is null or e.enrolled_to>=p_reference_date)
      and e.status in ('current','transferred','completed')
    where g.school_id=v_school.id and g.academic_year=p_academic_year
    group by g.id,g.grade_code,g.display_name
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'grade_id',x.grade_id,
    'grade_code',x.grade_code,
    'grade_name',x.display_name,
    'female',x.female,
    'male',x.male,
    'other_or_unspecified',x.other_sex,
    'total',x.total
  ) order by x.grade_code),'[]'::jsonb)
  into v_enrolment_by_grade_and_sex
  from (
    select
      g.id grade_id,
      g.grade_code,
      g.display_name,
      count(e.id) filter(where lower(coalesce(l.sex,''))='female') female,
      count(e.id) filter(where lower(coalesce(l.sex,''))='male') male,
      count(e.id) filter(where e.id is not null and lower(coalesce(l.sex,'')) not in ('female','male')) other_sex,
      count(e.id) total
    from public.grades g
    left join public.enrolments e
      on e.grade_id=g.id
      and e.school_id=g.school_id
      and e.academic_year=g.academic_year
      and e.enrolled_from<=p_reference_date
      and (e.enrolled_to is null or e.enrolled_to>=p_reference_date)
      and e.status in ('current','transferred','completed')
    left join public.learners l on l.id=e.learner_id
    where g.school_id=v_school.id and g.academic_year=p_academic_year
    group by g.id,g.grade_code,g.display_name
  ) x;

  select jsonb_build_object(
    'female',count(*) filter(where lower(coalesce(l.sex,''))='female'),
    'male',count(*) filter(where lower(coalesce(l.sex,''))='male'),
    'other_or_unspecified',count(*) filter(where lower(coalesce(l.sex,'')) not in ('female','male')),
    'total',count(*)
  )
  into v_unassigned_grade
  from public.enrolments e
  join public.learners l on l.id=e.learner_id
  where e.school_id=v_school.id
    and e.academic_year=p_academic_year
    and e.grade_id is null
    and e.enrolled_from<=p_reference_date
    and (e.enrolled_to is null or e.enrolled_to>=p_reference_date)
    and e.status in ('current','transferred','completed');

  select coalesce(jsonb_agg(jsonb_build_object(
    'age',x.age,
    'female',x.female,
    'male',x.male,
    'other_or_unspecified',x.other_sex,
    'total',x.total
  ) order by x.age),'[]'::jsonb)
  into v_age_distribution
  from (
    select extract(year from age(p_reference_date,l.date_of_birth))::integer age,
      count(*) filter(where lower(coalesce(l.sex,''))='female') female,
      count(*) filter(where lower(coalesce(l.sex,''))='male') male,
      count(*) filter(where lower(coalesce(l.sex,'')) not in ('female','male')) other_sex,
      count(*) total
    from public.enrolments e
    join public.learners l on l.id=e.learner_id
    where e.school_id=v_school.id
      and e.academic_year=p_academic_year
      and l.date_of_birth is not null
      and e.enrolled_from<=p_reference_date
      and (e.enrolled_to is null or e.enrolled_to>=p_reference_date)
      and e.status in ('current','transferred','completed')
    group by extract(year from age(p_reference_date,l.date_of_birth))::integer
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'class_id',x.id,
    'class_code',x.class_code,
    'class_name',x.display_name,
    'learners',x.learners
  ) order by x.grade_code,x.class_code),'[]'::jsonb)
  into v_class_distribution
  from (
    select rc.id,rc.class_code,rc.display_name,g.grade_code,count(e.id) learners
    from public.register_classes rc
    join public.grades g on g.id=rc.grade_id
    left join public.enrolments e
      on e.register_class_id=rc.id
      and e.school_id=rc.school_id
      and e.academic_year=rc.academic_year
      and e.enrolled_from<=p_reference_date
      and (e.enrolled_to is null or e.enrolled_to>=p_reference_date)
      and e.status in ('current','transferred','completed')
    where rc.school_id=v_school.id and rc.academic_year=p_academic_year
    group by rc.id,rc.class_code,rc.display_name,g.grade_code
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'class_id',x.class_id,
    'class_code',x.class_code,
    'class_name',x.class_name,
    'grade_id',x.grade_id,
    'grade_code',x.grade_code,
    'grade_name',x.grade_name,
    'female',x.female,
    'male',x.male,
    'other_or_unspecified',x.other_sex,
    'total',x.total
  ) order by x.grade_code,x.class_code),'[]'::jsonb)
  into v_class_distribution_and_sex
  from (
    select
      rc.id class_id,
      rc.class_code,
      rc.display_name class_name,
      g.id grade_id,
      g.grade_code,
      g.display_name grade_name,
      count(e.id) filter(where lower(coalesce(l.sex,''))='female') female,
      count(e.id) filter(where lower(coalesce(l.sex,''))='male') male,
      count(e.id) filter(where e.id is not null and lower(coalesce(l.sex,'')) not in ('female','male')) other_sex,
      count(e.id) total
    from public.register_classes rc
    join public.grades g on g.id=rc.grade_id
    left join public.enrolments e
      on e.register_class_id=rc.id
      and e.school_id=rc.school_id
      and e.academic_year=rc.academic_year
      and e.enrolled_from<=p_reference_date
      and (e.enrolled_to is null or e.enrolled_to>=p_reference_date)
      and e.status in ('current','transferred','completed')
    left join public.learners l on l.id=e.learner_id
    where rc.school_id=v_school.id and rc.academic_year=p_academic_year
    group by rc.id,rc.class_code,rc.display_name,g.id,g.grade_code,g.display_name
  ) x;

  select jsonb_build_object(
    'female',count(*) filter(where lower(coalesce(l.sex,''))='female'),
    'male',count(*) filter(where lower(coalesce(l.sex,''))='male'),
    'other_or_unspecified',count(*) filter(where lower(coalesce(l.sex,'')) not in ('female','male')),
    'total',count(*)
  )
  into v_unassigned_register_class
  from public.enrolments e
  join public.learners l on l.id=e.learner_id
  where e.school_id=v_school.id
    and e.academic_year=p_academic_year
    and e.register_class_id is null
    and e.enrolled_from<=p_reference_date
    and (e.enrolled_to is null or e.enrolled_to>=p_reference_date)
    and e.status in ('current','transferred','completed');

  select coalesce(jsonb_agg(jsonb_build_object(
    'staff_member_id',x.staff_member_id,
    'teacher_name',x.teacher_name,
    'allocations',x.allocations,
    'planned_periods_per_cycle',x.periods
  ) order by x.teacher_name),'[]'::jsonb)
  into v_teacher_workload
  from (
    select ta.staff_member_id,trim(concat(sm.first_name,' ',sm.last_name)) teacher_name,count(*) allocations,coalesce(sum(so.periods_per_cycle),0) periods
    from public.teacher_allocations ta
    join public.staff_members sm on sm.id=ta.staff_member_id
    join public.subject_offerings so on so.id=ta.subject_offering_id
    where ta.school_id=v_school.id and ta.academic_year=p_academic_year and ta.active_from<=p_reference_date and (ta.active_to is null or ta.active_to>=p_reference_date)
    group by ta.staff_member_id,sm.first_name,sm.last_name
  ) x;

  return jsonb_build_object(
    'reference_date',p_reference_date,
    'academic_year',p_academic_year,
    'school',jsonb_build_object(
      'id',v_school.id,
      'name',v_school.name,
      'emis_number',v_school.emis_number,
      'region',v_school.region,
      'town',v_school.town
    ),
    'learners',jsonb_build_object(
      'total',v_learners,
      'female',v_female,
      'male',v_male,
      'other_or_unspecified',v_other_sex,
      'by_grade',v_enrolment_by_grade,
      'by_grade_and_sex',v_enrolment_by_grade_and_sex,
      'age_distribution',v_age_distribution,
      'by_class',v_class_distribution,
      'by_class_and_sex',v_class_distribution_and_sex,
      'assignment_gaps',jsonb_build_object(
        'unassigned_grade',coalesce(v_unassigned_grade,'{"female":0,"male":0,"other_or_unspecified":0,"total":0}'::jsonb),
        'unassigned_register_class',coalesce(v_unassigned_register_class,'{"female":0,"male":0,"other_or_unspecified":0,"total":0}'::jsonb)
      )
    ),
    'structure',jsonb_build_object('grades',v_grades,'register_classes',v_classes,'subject_offerings',v_subject_offerings),
    'staffing',jsonb_build_object('active_staff',v_staff,'allocated_teachers',v_teachers,'teacher_allocations',v_allocations,'workload',v_teacher_workload),
    'attendance',jsonb_build_object('expected_school_days_to_reference_date',v_expected_days,'absence_exception_events',v_absent_events),
    'learning_resources',jsonb_build_object('active_titles',v_resource_titles,'tracked_copies',v_resource_copies,'open_or_overdue_loans',v_open_loans)
  );
end;
$$;

revoke all on function public.build_school_operational_snapshot(uuid,integer,date) from public,anon;
grant execute on function public.build_school_operational_snapshot(uuid,integer,date) to authenticated;

comment on function public.build_school_operational_snapshot(uuid,integer,date) is
  'Reusable source snapshot for statutory reporting. Includes grade/class learner distributions by sex and explicit assignment gaps for AEC-style reconciliation while keeping form-specific codes and mappings versioned separately.';
