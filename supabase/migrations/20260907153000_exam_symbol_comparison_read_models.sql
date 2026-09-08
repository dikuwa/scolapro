-- N21: canonical official-result symbol distributions and bounded comparison read models.
--
-- These functions are read-only. They derive exclusively from approved official_results
-- and retain the assessment/grading/rule provenance captured when results were approved.
-- No learner identity, mark-entry surface, pass threshold, or parallel result storage is added.

create or replace function public.get_official_result_symbol_distribution(
  p_school_id uuid,
  p_academic_year integer,
  p_term_number smallint default null,
  p_subject_offering_id uuid default null
)
returns table (
  school_id uuid,
  academic_year integer,
  term_number smallint,
  subject_offering_id uuid,
  assessment_scheme_key text,
  assessment_scheme_version text,
  grading_scale_key text,
  grading_scale_version text,
  academic_rule_set_key text,
  academic_rule_set_version text,
  outcome_type text,
  outcome_value text,
  result_count bigint,
  eligible_result_count bigint,
  percentage numeric
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not app_private.has_school_access(p_school_id) then
    raise exception 'Permission denied';
  end if;

  return query
  with eligible as (
    select r.*
    from public.official_results r
    where r.school_id = p_school_id
      and r.academic_year = p_academic_year
      and r.approved_at is not null
      and (p_term_number is null or r.term_number = p_term_number)
      and (p_subject_offering_id is null or r.subject_offering_id = p_subject_offering_id)
  ), bucketed as (
    select
      e.school_id,
      e.academic_year,
      e.term_number,
      e.subject_offering_id,
      e.assessment_scheme_key,
      e.assessment_scheme_version,
      e.grading_scale_key,
      e.grading_scale_version,
      e.academic_rule_set_key,
      e.academic_rule_set_version,
      case
        when e.symbol is not null then 'symbol'
        when e.result_status is not null then 'status'
        else 'unclassified'
      end as outcome_type,
      coalesce(e.symbol, e.result_status) as outcome_value
    from eligible e
  ), counted as (
    select
      b.*,
      count(*)::bigint as result_count
    from bucketed b
    group by
      b.school_id,
      b.academic_year,
      b.term_number,
      b.subject_offering_id,
      b.assessment_scheme_key,
      b.assessment_scheme_version,
      b.grading_scale_key,
      b.grading_scale_version,
      b.academic_rule_set_key,
      b.academic_rule_set_version,
      b.outcome_type,
      b.outcome_value
  )
  select
    c.school_id,
    c.academic_year,
    c.term_number,
    c.subject_offering_id,
    c.assessment_scheme_key,
    c.assessment_scheme_version,
    c.grading_scale_key,
    c.grading_scale_version,
    c.academic_rule_set_key,
    c.academic_rule_set_version,
    c.outcome_type,
    c.outcome_value,
    c.result_count,
    sum(c.result_count) over (
      partition by
        c.school_id,
        c.academic_year,
        c.term_number,
        c.subject_offering_id,
        c.assessment_scheme_key,
        c.assessment_scheme_version,
        c.grading_scale_key,
        c.grading_scale_version,
        c.academic_rule_set_key,
        c.academic_rule_set_version
    )::bigint as eligible_result_count,
    round(
      (100.0 * c.result_count) /
      nullif(sum(c.result_count) over (
        partition by
          c.school_id,
          c.academic_year,
          c.term_number,
          c.subject_offering_id,
          c.assessment_scheme_key,
          c.assessment_scheme_version,
          c.grading_scale_key,
          c.grading_scale_version,
          c.academic_rule_set_key,
          c.academic_rule_set_version
      ), 0),
      2
    ) as percentage
  from counted c
  order by c.term_number, c.subject_offering_id, c.outcome_type, c.outcome_value nulls last;
end;
$$;

revoke all on function public.get_official_result_symbol_distribution(uuid, integer, smallint, uuid)
from public, anon;
grant execute on function public.get_official_result_symbol_distribution(uuid, integer, smallint, uuid)
to authenticated;

comment on function public.get_official_result_symbol_distribution(uuid, integer, smallint, uuid)
is 'N21 school-scoped distribution derived only from approved official_results; preserves captured assessment, grading-scale, and academic-rule provenance.';

create or replace function public.compare_official_result_series(
  p_school_id uuid,
  p_subject_offering_id uuid,
  p_left_academic_year integer,
  p_left_term_number smallint,
  p_right_academic_year integer,
  p_right_term_number smallint
)
returns table (
  series_side text,
  school_id uuid,
  academic_year integer,
  term_number smallint,
  subject_offering_id uuid,
  assessment_scheme_key text,
  assessment_scheme_version text,
  grading_scale_key text,
  grading_scale_version text,
  academic_rule_set_key text,
  academic_rule_set_version text,
  outcome_type text,
  outcome_value text,
  result_count bigint,
  eligible_result_count bigint,
  percentage numeric
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_left_count integer;
  v_right_count integer;
  v_left record;
  v_right record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not app_private.has_school_access(p_school_id) then
    raise exception 'Permission denied';
  end if;

  select count(*) into v_left_count
  from (
    select distinct
      r.assessment_scheme_key,
      r.assessment_scheme_version,
      r.grading_scale_key,
      r.grading_scale_version,
      r.academic_rule_set_key,
      r.academic_rule_set_version
    from public.official_results r
    where r.school_id = p_school_id
      and r.subject_offering_id = p_subject_offering_id
      and r.academic_year = p_left_academic_year
      and r.term_number = p_left_term_number
      and r.approved_at is not null
  ) provenance;

  select count(*) into v_right_count
  from (
    select distinct
      r.assessment_scheme_key,
      r.assessment_scheme_version,
      r.grading_scale_key,
      r.grading_scale_version,
      r.academic_rule_set_key,
      r.academic_rule_set_version
    from public.official_results r
    where r.school_id = p_school_id
      and r.subject_offering_id = p_subject_offering_id
      and r.academic_year = p_right_academic_year
      and r.term_number = p_right_term_number
      and r.approved_at is not null
  ) provenance;

  if v_left_count = 0 or v_right_count = 0 then
    raise exception 'Both result series must contain approved official results';
  end if;

  if v_left_count <> 1 or v_right_count <> 1 then
    raise exception 'Series with mixed provenance cannot be compared';
  end if;

  select distinct
    r.assessment_scheme_key,
    r.assessment_scheme_version,
    r.grading_scale_key,
    r.grading_scale_version,
    r.academic_rule_set_key,
    r.academic_rule_set_version
  into v_left
  from public.official_results r
  where r.school_id = p_school_id
    and r.subject_offering_id = p_subject_offering_id
    and r.academic_year = p_left_academic_year
    and r.term_number = p_left_term_number
    and r.approved_at is not null;

  select distinct
    r.assessment_scheme_key,
    r.assessment_scheme_version,
    r.grading_scale_key,
    r.grading_scale_version,
    r.academic_rule_set_key,
    r.academic_rule_set_version
  into v_right
  from public.official_results r
  where r.school_id = p_school_id
    and r.subject_offering_id = p_subject_offering_id
    and r.academic_year = p_right_academic_year
    and r.term_number = p_right_term_number
    and r.approved_at is not null;

  if v_left.assessment_scheme_key is distinct from v_right.assessment_scheme_key
     or v_left.assessment_scheme_version is distinct from v_right.assessment_scheme_version
     or v_left.grading_scale_key is distinct from v_right.grading_scale_key
     or v_left.grading_scale_version is distinct from v_right.grading_scale_version
     or v_left.academic_rule_set_key is distinct from v_right.academic_rule_set_key
     or v_left.academic_rule_set_version is distinct from v_right.academic_rule_set_version then
    raise exception 'Incompatible result series provenance';
  end if;

  return query
  with series as (
    select
      'left'::text as series_side,
      r.*
    from public.official_results r
    where r.school_id = p_school_id
      and r.subject_offering_id = p_subject_offering_id
      and r.academic_year = p_left_academic_year
      and r.term_number = p_left_term_number
      and r.approved_at is not null
    union all
    select
      'right'::text as series_side,
      r.*
    from public.official_results r
    where r.school_id = p_school_id
      and r.subject_offering_id = p_subject_offering_id
      and r.academic_year = p_right_academic_year
      and r.term_number = p_right_term_number
      and r.approved_at is not null
  ), bucketed as (
    select
      s.series_side,
      s.school_id,
      s.academic_year,
      s.term_number,
      s.subject_offering_id,
      s.assessment_scheme_key,
      s.assessment_scheme_version,
      s.grading_scale_key,
      s.grading_scale_version,
      s.academic_rule_set_key,
      s.academic_rule_set_version,
      case
        when s.symbol is not null then 'symbol'
        when s.result_status is not null then 'status'
        else 'unclassified'
      end as outcome_type,
      coalesce(s.symbol, s.result_status) as outcome_value
    from series s
  ), counted as (
    select
      b.*,
      count(*)::bigint as result_count
    from bucketed b
    group by
      b.series_side,
      b.school_id,
      b.academic_year,
      b.term_number,
      b.subject_offering_id,
      b.assessment_scheme_key,
      b.assessment_scheme_version,
      b.grading_scale_key,
      b.grading_scale_version,
      b.academic_rule_set_key,
      b.academic_rule_set_version,
      b.outcome_type,
      b.outcome_value
  )
  select
    c.series_side,
    c.school_id,
    c.academic_year,
    c.term_number,
    c.subject_offering_id,
    c.assessment_scheme_key,
    c.assessment_scheme_version,
    c.grading_scale_key,
    c.grading_scale_version,
    c.academic_rule_set_key,
    c.academic_rule_set_version,
    c.outcome_type,
    c.outcome_value,
    c.result_count,
    sum(c.result_count) over (partition by c.series_side)::bigint as eligible_result_count,
    round(
      (100.0 * c.result_count) /
      nullif(sum(c.result_count) over (partition by c.series_side), 0),
      2
    ) as percentage
  from counted c
  order by c.series_side, c.outcome_type, c.outcome_value nulls last;
end;
$$;

revoke all on function public.compare_official_result_series(uuid, uuid, integer, smallint, integer, smallint)
from public, anon;
grant execute on function public.compare_official_result_series(uuid, uuid, integer, smallint, integer, smallint)
to authenticated;

comment on function public.compare_official_result_series(uuid, uuid, integer, smallint, integer, smallint)
is 'N21 bounded school-series comparison. Both sides must use the same subject offering and identical captured assessment/grading/rule provenance.';

create or replace function public.get_network_official_result_symbol_distribution(
  p_academic_year integer,
  p_term_number smallint default null
)
returns table (
  academic_year integer,
  term_number smallint,
  assessment_scheme_key text,
  assessment_scheme_version text,
  grading_scale_key text,
  grading_scale_version text,
  academic_rule_set_key text,
  academic_rule_set_version text,
  outcome_type text,
  outcome_value text,
  school_count bigint,
  result_count bigint,
  eligible_result_count bigint,
  percentage numeric
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.education_network_memberships m
    where m.user_id = auth.uid()
      and m.active_from <= current_date
      and (m.active_to is null or m.active_to >= current_date)
  ) then
    raise exception 'Permission denied';
  end if;

  return query
  with eligible as (
    select r.*
    from public.official_results r
    where r.academic_year = p_academic_year
      and r.approved_at is not null
      and (p_term_number is null or r.term_number = p_term_number)
      and app_private.can_view_school_via_network(r.school_id, current_date)
  ), bucketed as (
    select
      e.academic_year,
      e.term_number,
      e.assessment_scheme_key,
      e.assessment_scheme_version,
      e.grading_scale_key,
      e.grading_scale_version,
      e.academic_rule_set_key,
      e.academic_rule_set_version,
      case
        when e.symbol is not null then 'symbol'
        when e.result_status is not null then 'status'
        else 'unclassified'
      end as outcome_type,
      coalesce(e.symbol, e.result_status) as outcome_value,
      e.school_id
    from eligible e
  ), counted as (
    select
      b.academic_year,
      b.term_number,
      b.assessment_scheme_key,
      b.assessment_scheme_version,
      b.grading_scale_key,
      b.grading_scale_version,
      b.academic_rule_set_key,
      b.academic_rule_set_version,
      b.outcome_type,
      b.outcome_value,
      count(distinct b.school_id)::bigint as school_count,
      count(*)::bigint as result_count
    from bucketed b
    group by
      b.academic_year,
      b.term_number,
      b.assessment_scheme_key,
      b.assessment_scheme_version,
      b.grading_scale_key,
      b.grading_scale_version,
      b.academic_rule_set_key,
      b.academic_rule_set_version,
      b.outcome_type,
      b.outcome_value
  )
  select
    c.academic_year,
    c.term_number,
    c.assessment_scheme_key,
    c.assessment_scheme_version,
    c.grading_scale_key,
    c.grading_scale_version,
    c.academic_rule_set_key,
    c.academic_rule_set_version,
    c.outcome_type,
    c.outcome_value,
    c.school_count,
    c.result_count,
    sum(c.result_count) over (
      partition by
        c.academic_year,
        c.term_number,
        c.assessment_scheme_key,
        c.assessment_scheme_version,
        c.grading_scale_key,
        c.grading_scale_version,
        c.academic_rule_set_key,
        c.academic_rule_set_version
    )::bigint as eligible_result_count,
    round(
      (100.0 * c.result_count) /
      nullif(sum(c.result_count) over (
        partition by
          c.academic_year,
          c.term_number,
          c.assessment_scheme_key,
          c.assessment_scheme_version,
          c.grading_scale_key,
          c.grading_scale_version,
          c.academic_rule_set_key,
          c.academic_rule_set_version
      ), 0),
      2
    ) as percentage
  from counted c
  order by c.term_number, c.outcome_type, c.outcome_value nulls last;
end;
$$;

revoke all on function public.get_network_official_result_symbol_distribution(integer, smallint)
from public, anon;
grant execute on function public.get_network_official_result_symbol_distribution(integer, smallint)
to authenticated;

comment on function public.get_network_official_result_symbol_distribution(integer, smallint)
is 'N21 current network-scope aggregate over approved official_results. Returns no learner, enrolment, subject-registration, or school identity.';