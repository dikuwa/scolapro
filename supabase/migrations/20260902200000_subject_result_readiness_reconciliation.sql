create or replace function app_private.can_read_learner_subject_result_readiness(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or app_private.has_school_role(
      p_school_id,
      array['school_admin','principal','deputy_principal','hod']
    );
$$;

revoke all on function app_private.can_read_learner_subject_result_readiness(uuid)
from public,anon,authenticated;

create or replace function app_private.build_learner_subject_result_readiness(
  p_enrolment_id uuid,
  p_term_number smallint
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $$
declare
  v_enrolment public.enrolments%rowtype;
  v_reference_date date;
  v_term_name text;
  v_registered_count integer;
  v_result_count integer;
  v_matched_count integer;
  v_missing_count integer;
  v_unregistered_result_count integer;
  v_attention_result_count integer;
  v_registered jsonb;
  v_results jsonb;
  v_missing jsonb;
  v_unregistered jsonb;
  v_status text;
begin
  if p_term_number is null or p_term_number<1 or p_term_number>6 then
    raise exception 'Term number is invalid';
  end if;

  select * into v_enrolment
  from public.enrolments e
  where e.id=p_enrolment_id;
  if not found then raise exception 'Enrolment not found'; end if;

  select
    t.display_name,
    case
      when t.ends_on is not null then least(t.ends_on,current_date)
      when t.starts_on is not null and t.starts_on<=current_date then current_date
      else current_date
    end
  into v_term_name,v_reference_date
  from public.academic_terms t
  join public.academic_years y on y.id=t.academic_year_id
  where t.school_id=v_enrolment.school_id
    and y.year=v_enrolment.academic_year
    and t.term_number=p_term_number
  order by t.created_at desc
  limit 1;

  v_reference_date:=coalesce(v_reference_date,current_date);
  v_term_name:=coalesce(v_term_name,'Term '||p_term_number::text);

  with registered as (
    select
      r.id registration_id,
      r.subject_offering_id,
      s.subject_code,
      s.display_name subject_name,
      so.status offering_status
    from public.learner_subject_registrations r
    join public.subject_offerings so on so.id=r.subject_offering_id
    join public.subjects s on s.id=so.subject_id
    where r.enrolment_id=v_enrolment.id
      and app_private.subject_registration_is_active_at(r.id,v_reference_date)
  )
  select
    count(*)::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'registration_id',registration_id,
      'subject_offering_id',subject_offering_id,
      'subject_code',subject_code,
      'subject_name',subject_name,
      'offering_status',offering_status
    ) order by subject_name),'[]'::jsonb)
  into v_registered_count,v_registered
  from registered;

  with results as (
    select
      r.id official_result_id,
      r.subject_offering_id,
      s.subject_code,
      s.display_name subject_name,
      r.result_value,
      r.result_status,
      r.symbol,
      r.approved_at,
      exists(
        select 1
        from public.learner_subject_registrations lsr
        where lsr.enrolment_id=v_enrolment.id
          and lsr.subject_offering_id=r.subject_offering_id
          and app_private.subject_registration_is_active_at(lsr.id,v_reference_date)
      ) registration_matched
    from public.official_results r
    join public.subject_offerings so on so.id=r.subject_offering_id
    join public.subjects s on s.id=so.subject_id
    where r.enrolment_id=v_enrolment.id
      and r.term_number=p_term_number
  )
  select
    count(*)::integer,
    count(*) filter(where registration_matched)::integer,
    count(*) filter(where not registration_matched)::integer,
    count(*) filter(where result_status in ('incomplete','withheld'))::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'official_result_id',official_result_id,
      'subject_offering_id',subject_offering_id,
      'subject_code',subject_code,
      'subject_name',subject_name,
      'result_value',result_value,
      'result_status',result_status,
      'symbol',symbol,
      'approved_at',approved_at,
      'registration_matched',registration_matched
    ) order by subject_name),'[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object(
      'official_result_id',official_result_id,
      'subject_offering_id',subject_offering_id,
      'subject_code',subject_code,
      'subject_name',subject_name,
      'result_status',result_status
    ) order by subject_name) filter(where not registration_matched),'[]'::jsonb)
  into v_result_count,v_matched_count,v_unregistered_result_count,
       v_attention_result_count,v_results,v_unregistered
  from results;

  with missing as (
    select
      r.id registration_id,
      r.subject_offering_id,
      s.subject_code,
      s.display_name subject_name
    from public.learner_subject_registrations r
    join public.subject_offerings so on so.id=r.subject_offering_id
    join public.subjects s on s.id=so.subject_id
    where r.enrolment_id=v_enrolment.id
      and app_private.subject_registration_is_active_at(r.id,v_reference_date)
      and not exists(
        select 1
        from public.official_results orr
        where orr.enrolment_id=v_enrolment.id
          and orr.term_number=p_term_number
          and orr.subject_offering_id=r.subject_offering_id
      )
  )
  select
    count(*)::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'registration_id',registration_id,
      'subject_offering_id',subject_offering_id,
      'subject_code',subject_code,
      'subject_name',subject_name
    ) order by subject_name),'[]'::jsonb)
  into v_missing_count,v_missing
  from missing;

  v_status:=case
    when coalesce(v_registered_count,0)=0 and coalesce(v_result_count,0)=0
      then 'not_reconciled'
    when coalesce(v_registered_count,0)=0 and coalesce(v_result_count,0)>0
      then 'legacy_results_without_registrations'
    when coalesce(v_missing_count,0)>0 and coalesce(v_unregistered_result_count,0)>0
      then 'mixed_mismatch'
    when coalesce(v_missing_count,0)>0
      then 'missing_registered_results'
    when coalesce(v_unregistered_result_count,0)>0
      then 'unregistered_results_present'
    when coalesce(v_attention_result_count,0)>0
      then 'result_status_attention'
    else 'reconciled'
  end;

  return jsonb_build_object(
    'enrolment_id',v_enrolment.id,
    'learner_id',v_enrolment.learner_id,
    'school_id',v_enrolment.school_id,
    'academic_year',v_enrolment.academic_year,
    'term_number',p_term_number,
    'term_name',v_term_name,
    'reference_date',v_reference_date,
    'reference_date_basis','term_end_capped_at_today_or_today_fallback',
    'registered_subject_count',coalesce(v_registered_count,0),
    'official_result_count',coalesce(v_result_count,0),
    'matched_result_count',coalesce(v_matched_count,0),
    'missing_registered_result_count',coalesce(v_missing_count,0),
    'unregistered_result_count',coalesce(v_unregistered_result_count,0),
    'attention_result_count',coalesce(v_attention_result_count,0),
    'registered_subjects',coalesce(v_registered,'[]'::jsonb),
    'official_results',coalesce(v_results,'[]'::jsonb),
    'missing_registered_results',coalesce(v_missing,'[]'::jsonb),
    'unregistered_results',coalesce(v_unregistered,'[]'::jsonb),
    'reconciliation_status',v_status,
    'blocking',false
  );
end;
$$;

revoke all on function app_private.build_learner_subject_result_readiness(uuid,smallint)
from public,anon,authenticated;

create or replace function public.get_learner_subject_result_readiness(
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
  v_school_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_term_number is null or p_term_number<1 or p_term_number>6 then
    raise exception 'Term number is invalid';
  end if;

  select e.school_id into v_school_id
  from public.enrolments e
  where e.id=p_enrolment_id;
  if v_school_id is null then raise exception 'Enrolment not found'; end if;

  if not app_private.can_read_learner_subject_result_readiness(v_school_id) then
    raise exception 'Permission denied';
  end if;

  return app_private.build_learner_subject_result_readiness(p_enrolment_id,p_term_number);
end;
$$;

revoke all on function public.get_learner_subject_result_readiness(uuid,smallint)
from public,anon;
grant execute on function public.get_learner_subject_result_readiness(uuid,smallint)
to authenticated;

comment on function app_private.build_learner_subject_result_readiness(uuid,smallint) is
  'Non-blocking reconciliation between subject registrations active at the term reference date and immutable official-result rows. It identifies missing registered results, legacy/unregistered results and statuses needing attention without changing report-card behavior.';
comment on function public.get_learner_subject_result_readiness(uuid,smallint) is
  'Academic-leadership readiness view for reconciling learner subject choices with official term results before subject-registration completeness is ever enforced against report-card generation or certification.';