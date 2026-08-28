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
  v_age_distribution jsonb;
  v_class_distribution jsonb;
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
    where e.school_id=v_school.id and e.academic_year=p_academic_year
      and e.enrolled_from<=p_reference_date and (e.enrolled_to is null or e.enrolled_to>=p_reference_date)
      and e.status in ('current','transferred','completed')
  )
  select count(*),count(*) filter(where lower(coalesce(sex,''))='female'),count(*) filter(where lower(coalesce(sex,''))='male'),count(*) filter(where lower(coalesce(sex,'')) not in ('female','male'))
  into v_learners,v_female,v_male,v_other_sex from current_enrolments;

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

  select coalesce(jsonb_agg(jsonb_build_object('grade_id',x.grade_id,'grade_code',x.grade_code,'grade_name',x.display_name,'learners',x.learners) order by x.grade_code),'[]'::jsonb)
  into v_enrolment_by_grade
  from (
    select g.id grade_id,g.grade_code,g.display_name,count(e.id) learners
    from public.grades g
    left join public.enrolments e on e.grade_id=g.id and e.school_id=g.school_id and e.academic_year=g.academic_year and e.enrolled_from<=p_reference_date and (e.enrolled_to is null or e.enrolled_to>=p_reference_date)
    where g.school_id=v_school.id and g.academic_year=p_academic_year
    group by g.id,g.grade_code,g.display_name
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('age',x.age,'female',x.female,'male',x.male,'other_or_unspecified',x.other_sex,'total',x.total) order by x.age),'[]'::jsonb)
  into v_age_distribution
  from (
    select extract(year from age(p_reference_date,l.date_of_birth))::integer age,
      count(*) filter(where lower(coalesce(l.sex,''))='female') female,
      count(*) filter(where lower(coalesce(l.sex,''))='male') male,
      count(*) filter(where lower(coalesce(l.sex,'')) not in ('female','male')) other_sex,
      count(*) total
    from public.enrolments e join public.learners l on l.id=e.learner_id
    where e.school_id=v_school.id and e.academic_year=p_academic_year and l.date_of_birth is not null and e.enrolled_from<=p_reference_date and (e.enrolled_to is null or e.enrolled_to>=p_reference_date)
    group by extract(year from age(p_reference_date,l.date_of_birth))::integer
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('class_id',x.id,'class_code',x.class_code,'class_name',x.display_name,'learners',x.learners) order by x.class_code),'[]'::jsonb)
  into v_class_distribution
  from (
    select rc.id,rc.class_code,rc.display_name,count(e.id) learners
    from public.register_classes rc
    left join public.enrolments e on e.register_class_id=rc.id and e.school_id=rc.school_id and e.academic_year=rc.academic_year and e.enrolled_from<=p_reference_date and (e.enrolled_to is null or e.enrolled_to>=p_reference_date)
    where rc.school_id=v_school.id and rc.academic_year=p_academic_year
    group by rc.id,rc.class_code,rc.display_name
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('staff_member_id',x.staff_member_id,'teacher_name',x.teacher_name,'allocations',x.allocations,'planned_periods_per_cycle',x.periods) order by x.teacher_name),'[]'::jsonb)
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
    'school',jsonb_build_object('id',v_school.id,'name',v_school.name,'emis_number',v_school.emis_number,'region',v_school.region,'town',v_school.town),
    'learners',jsonb_build_object('total',v_learners,'female',v_female,'male',v_male,'other_or_unspecified',v_other_sex,'by_grade',v_enrolment_by_grade,'age_distribution',v_age_distribution,'by_class',v_class_distribution),
    'structure',jsonb_build_object('grades',v_grades,'register_classes',v_classes,'subject_offerings',v_subject_offerings),
    'staffing',jsonb_build_object('active_staff',v_staff,'allocated_teachers',v_teachers,'teacher_allocations',v_allocations,'workload',v_teacher_workload),
    'attendance',jsonb_build_object('expected_school_days_to_reference_date',v_expected_days,'absence_exception_events',v_absent_events),
    'learning_resources',jsonb_build_object('active_titles',v_resource_titles,'tracked_copies',v_resource_copies,'open_or_overdue_loans',v_open_loans)
  );
end;
$$;

revoke all on function public.build_school_operational_snapshot(uuid,integer,date) from public,anon;
grant execute on function public.build_school_operational_snapshot(uuid,integer,date) to authenticated;

create or replace function public.generate_statutory_snapshot(p_reporting_cycle_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_cycle public.statutory_reporting_cycles%rowtype;
  v_values jsonb;
  v_number integer;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_cycle from public.statutory_reporting_cycles where id=p_reporting_cycle_id for update;
  if not found then raise exception 'Reporting cycle not found'; end if;
  if not app_private.can_manage_statutory(v_cycle.school_id) then raise exception 'Permission denied'; end if;
  if v_cycle.status in ('certified','locked','submitted','archived') then raise exception 'Reporting cycle is no longer open for a new provisional snapshot'; end if;

  v_values:=public.build_school_operational_snapshot(v_cycle.school_id,v_cycle.academic_year,v_cycle.reference_date);
  select coalesce(max(snapshot_number),0)+1 into v_number from public.statutory_snapshots where reporting_cycle_id=v_cycle.id;
  insert into public.statutory_snapshots(tenant_id,school_id,reporting_cycle_id,snapshot_number,values,source_summary,generated_by_user_id,status)
  values(v_cycle.tenant_id,v_cycle.school_id,v_cycle.id,v_number,v_values,jsonb_build_object('generator','school-operational-v1','generated_from','live_operational_tables','reference_date',v_cycle.reference_date),auth.uid(),'provisional')
  returning id into v_id;

  update public.statutory_reporting_cycles set status='review',updated_at=now() where id=v_cycle.id and status='open';
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_cycle.tenant_id,v_cycle.school_id,auth.uid(),'statutory.snapshot.generated','statutory_snapshot',v_id,jsonb_build_object('reporting_cycle_id',v_cycle.id,'snapshot_number',v_number,'reference_date',v_cycle.reference_date));
  return v_id;
end;
$$;

revoke all on function public.generate_statutory_snapshot(uuid) from public,anon;
grant execute on function public.generate_statutory_snapshot(uuid) to authenticated;

comment on function public.build_school_operational_snapshot(uuid,integer,date) is 'Reusable source snapshot for EMIS/AEC-style reporting. It derives known operational facts at a fixed reference date; form-specific mappings remain versioned separately.';
comment on function public.generate_statutory_snapshot(uuid) is 'Creates a numbered provisional statutory snapshot from live source tables without asking users to re-enter data the system already holds.';