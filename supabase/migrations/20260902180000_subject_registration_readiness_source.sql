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
      count(r.id) filter(where lower(coalesce(l.sex,''))='female') female,
      count(r.id) filter(where lower(coalesce(l.sex,''))='male') male,
      count(r.id) filter(where r.id is not null and lower(coalesce(l.sex,'')) not in ('female','male')) other_sex,
      count(r.id) total
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

create or replace function public.get_subject_registration_readiness(
  p_school_id uuid,
  p_academic_year integer,
  p_reference_date date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,app_private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_school_access(p_school_id) then raise exception 'Permission denied'; end if;
  return app_private.build_subject_registration_readiness_source(p_school_id,p_academic_year,p_reference_date);
end;
$$;

revoke all on function public.get_subject_registration_readiness(uuid,integer,date) from public,anon;
grant execute on function public.get_subject_registration_readiness(uuid,integer,date) to authenticated;

create or replace function public.generate_statutory_snapshot(p_reporting_cycle_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
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
  if v_cycle.status in ('certified','locked','submitted','archived') then
    raise exception 'Reporting cycle is no longer open for a new provisional snapshot';
  end if;

  v_values:=public.build_school_operational_snapshot(v_cycle.school_id,v_cycle.academic_year,v_cycle.reference_date);
  v_values:=jsonb_set(
    v_values,
    '{structure,register_class_teacher_source}',
    app_private.build_register_class_teacher_statutory_source(v_cycle.school_id,v_cycle.academic_year),
    true
  );
  v_values:=jsonb_set(
    v_values,
    '{structure,subject_registration_source}',
    app_private.build_subject_registration_readiness_source(v_cycle.school_id,v_cycle.academic_year,v_cycle.reference_date),
    true
  );

  select coalesce(max(snapshot_number),0)+1 into v_number
  from public.statutory_snapshots
  where reporting_cycle_id=v_cycle.id;

  insert into public.statutory_snapshots(
    tenant_id,school_id,reporting_cycle_id,snapshot_number,values,source_summary,generated_by_user_id,status
  ) values(
    v_cycle.tenant_id,v_cycle.school_id,v_cycle.id,v_number,v_values,
    jsonb_build_object(
      'generator','school-operational-v3',
      'generated_from','live_operational_tables',
      'reference_date',v_cycle.reference_date,
      'includes',jsonb_build_array('register_class_teacher_source','subject_registration_source')
    ),
    auth.uid(),'provisional'
  ) returning id into v_id;

  update public.statutory_reporting_cycles
  set status='review',updated_at=now()
  where id=v_cycle.id and status='open';

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_cycle.tenant_id,v_cycle.school_id,auth.uid(),'statutory.snapshot.generated','statutory_snapshot',v_id,
    jsonb_build_object(
      'reporting_cycle_id',v_cycle.id,
      'snapshot_number',v_number,
      'reference_date',v_cycle.reference_date,
      'source_generator','school-operational-v3'
    )
  );
  return v_id;
end;
$$;

revoke all on function public.generate_statutory_snapshot(uuid) from public,anon;
grant execute on function public.generate_statutory_snapshot(uuid) to authenticated;

comment on function app_private.build_subject_registration_readiness_source(uuid,integer,date) is
  'Reference-date subject-choice readiness source: coverage across eligible enrolments plus registered learner counts by subject offering, grade and sex. It is informative and does not enforce mark/report-card completeness.';
comment on function public.get_subject_registration_readiness(uuid,integer,date) is
  'Returns school-scoped subject-choice coverage and offering counts for operational reconciliation without making registrations mandatory for historical academic records.';
