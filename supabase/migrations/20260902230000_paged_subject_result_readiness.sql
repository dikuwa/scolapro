create or replace function public.list_learner_subject_result_readiness_page(
  p_school_id uuid,
  p_academic_year integer,
  p_term_number integer,
  p_query text default null,
  p_grade_id uuid default null,
  p_class_id uuid default null,
  p_reconciliation_status text default 'all',
  p_page integer default 1,
  p_page_size integer default 50
)
returns table(
  enrolment_id uuid,
  learner_id uuid,
  first_names text,
  surname text,
  admission_number text,
  grade_id uuid,
  grade_name text,
  register_class_id uuid,
  class_name text,
  reconciliation_status text,
  registered_subject_count integer,
  official_result_count integer,
  matched_result_count integer,
  missing_registered_result_count integer,
  unregistered_result_count integer,
  attention_result_count integer,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path=public,app_private
as $$
declare
  v_page integer:=greatest(coalesce(p_page,1),1);
  v_page_size integer:=least(greatest(coalesce(p_page_size,50),1),100);
  v_query text:=nullif(btrim(coalesce(p_query,'')),'');
  v_status text:=coalesce(p_reconciliation_status,'all');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (
    app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal','hod'])
    or app_private.has_platform_role(array['platform_admin'])
  ) then raise exception 'Permission denied'; end if;
  if p_academic_year<2000 or p_academic_year>2200 then raise exception 'Academic year is invalid'; end if;
  if p_term_number<1 or p_term_number>6 then raise exception 'Term number is invalid'; end if;
  if v_status not in (
    'all','reconciled','not_reconciled','legacy_results_without_registrations',
    'missing_registered_results','unregistered_results_present','result_status_attention','mixed_mismatch'
  ) then raise exception 'Unsupported subject-result readiness status filter'; end if;

  return query
  with roster as (
    select
      e.id enrolment_id,e.learner_id,l.first_names,l.surname,e.admission_number,
      e.grade_id,coalesce(g.display_name,'Unassigned') grade_name,
      e.register_class_id,coalesce(rc.display_name,'Unassigned') class_name
    from public.enrolments e
    join public.learners l on l.id=e.learner_id
    left join public.grades g on g.id=e.grade_id
    left join public.register_classes rc on rc.id=e.register_class_id
    where e.school_id=p_school_id
      and e.academic_year=p_academic_year
      and e.status='current'
      and (p_grade_id is null or e.grade_id=p_grade_id)
      and (p_class_id is null or e.register_class_id=p_class_id)
      and (
        v_query is null
        or concat_ws(' ',l.first_names,l.surname,e.admission_number,g.display_name,rc.display_name) ilike '%'||v_query||'%'
      )
  ), evaluated as (
    select r.*,app_private.build_learner_subject_result_readiness(r.enrolment_id,p_term_number::smallint) readiness
    from roster r
  ), filtered as (
    select * from evaluated e
    where v_status='all' or e.readiness->>'reconciliation_status'=v_status
  )
  select
    f.enrolment_id,f.learner_id,f.first_names,f.surname,f.admission_number,
    f.grade_id,f.grade_name,f.register_class_id,f.class_name,
    f.readiness->>'reconciliation_status',
    (f.readiness->>'registered_subject_count')::integer,
    (f.readiness->>'official_result_count')::integer,
    (f.readiness->>'matched_result_count')::integer,
    (f.readiness->>'missing_registered_result_count')::integer,
    (f.readiness->>'unregistered_result_count')::integer,
    (f.readiness->>'attention_result_count')::integer,
    count(*) over()
  from filtered f
  order by lower(f.surname),lower(f.first_names),f.enrolment_id
  limit v_page_size
  offset (v_page-1)*v_page_size;
end;
$$;

revoke all on function public.list_learner_subject_result_readiness_page(uuid,integer,integer,text,uuid,uuid,text,integer,integer) from public,anon;
grant execute on function public.list_learner_subject_result_readiness_page(uuid,integer,integer,text,uuid,uuid,text,integer,integer) to authenticated;

create or replace function public.get_subject_result_readiness_summary(
  p_school_id uuid,
  p_academic_year integer,
  p_term_number integer,
  p_grade_id uuid default null,
  p_class_id uuid default null
)
returns table(
  total_count bigint,
  reconciled_count bigint,
  not_reconciled_count bigint,
  legacy_results_without_registrations_count bigint,
  missing_registered_results_count bigint,
  unregistered_results_present_count bigint,
  result_status_attention_count bigint,
  mixed_mismatch_count bigint
)
language plpgsql
stable
security definer
set search_path=public,app_private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (
    app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal','hod'])
    or app_private.has_platform_role(array['platform_admin'])
  ) then raise exception 'Permission denied'; end if;
  if p_academic_year<2000 or p_academic_year>2200 then raise exception 'Academic year is invalid'; end if;
  if p_term_number<1 or p_term_number>6 then raise exception 'Term number is invalid'; end if;

  return query
  with evaluated as (
    select app_private.build_learner_subject_result_readiness(e.id,p_term_number::smallint)->>'reconciliation_status' status
    from public.enrolments e
    where e.school_id=p_school_id and e.academic_year=p_academic_year and e.status='current'
      and (p_grade_id is null or e.grade_id=p_grade_id)
      and (p_class_id is null or e.register_class_id=p_class_id)
  )
  select
    count(*)::bigint,
    count(*) filter(where status='reconciled')::bigint,
    count(*) filter(where status='not_reconciled')::bigint,
    count(*) filter(where status='legacy_results_without_registrations')::bigint,
    count(*) filter(where status='missing_registered_results')::bigint,
    count(*) filter(where status='unregistered_results_present')::bigint,
    count(*) filter(where status='result_status_attention')::bigint,
    count(*) filter(where status='mixed_mismatch')::bigint
  from evaluated;
end;
$$;

revoke all on function public.get_subject_result_readiness_summary(uuid,integer,integer,uuid,uuid) from public,anon;
grant execute on function public.get_subject_result_readiness_summary(uuid,integer,integer,uuid,uuid) to authenticated;

comment on function public.list_learner_subject_result_readiness_page(uuid,integer,integer,text,uuid,uuid,text,integer,integer) is
'Paged academic-leadership workspace for subject-registration versus official-result reconciliation. Caps page size at 100 and supports learner, grade, class and readiness-status filters without making readiness blocking.';
comment on function public.get_subject_result_readiness_summary(uuid,integer,integer,uuid,uuid) is
'Academic-leadership aggregate of current-enrolment subject/result reconciliation states for school, grade or class scope.';
