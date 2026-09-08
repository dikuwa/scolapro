-- N21 corrective review migration: align aggregate authorization with official_results row access
-- and support legitimate comparisons between distinct annual subject offerings.
-- The original 20260907153000 migration remains unchanged.

create or replace function app_private.can_read_official_result_n21(
  p_school_id uuid,
  p_enrolment_id uuid,
  p_subject_offering_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select
    app_private.has_school_role(
      p_school_id,
      array['school_admin','principal','deputy_principal','hod']
    )
    or exists(
      select 1
      from public.enrolments e
      join public.school_memberships sm on sm.school_id=e.school_id
      join public.staff_members staff on staff.id=sm.staff_member_id
      join public.teacher_allocations ta
        on ta.staff_member_id=staff.id
       and ta.school_id=e.school_id
       and ta.academic_year=e.academic_year
       and ta.register_class_id=e.register_class_id
       and ta.subject_offering_id=p_subject_offering_id
       and ta.active_from<=current_date
       and (ta.active_to is null or ta.active_to>=current_date)
      where e.id=p_enrolment_id
        and e.school_id=p_school_id
        and sm.user_id=(select auth.uid())
        and sm.role_key in ('teacher','class_teacher')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
        and staff.status='active'
    );
$$;

revoke all on function app_private.can_read_official_result_n21(uuid,uuid,uuid)
from public,anon,authenticated;

comment on function app_private.can_read_official_result_n21(uuid,uuid,uuid) is
'N21 private aggregate-read predicate mirroring official_results academic relationship scope while deliberately excluding platform and education-network roles.';

create or replace function app_private.can_read_official_result_offering_n21(
  p_school_id uuid,
  p_subject_offering_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select
    app_private.has_school_role(
      p_school_id,
      array['school_admin','principal','deputy_principal','hod']
    )
    or exists(
      select 1
      from public.subject_offerings so
      join public.school_memberships sm on sm.school_id=so.school_id
      join public.staff_members staff on staff.id=sm.staff_member_id
      join public.teacher_allocations ta
        on ta.staff_member_id=staff.id
       and ta.school_id=so.school_id
       and ta.academic_year=so.academic_year
       and ta.subject_offering_id=so.id
       and ta.active_from<=current_date
       and (ta.active_to is null or ta.active_to>=current_date)
      where so.id=p_subject_offering_id
        and so.school_id=p_school_id
        and sm.user_id=(select auth.uid())
        and sm.role_key in ('teacher','class_teacher')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
        and staff.status='active'
    );
$$;

revoke all on function app_private.can_read_official_result_offering_n21(uuid,uuid)
from public,anon,authenticated;

comment on function app_private.can_read_official_result_offering_n21(uuid,uuid) is
'N21 private subject-offering authorization: academic leadership for the school or an active teacher/class-teacher allocation to the exact annual offering.';

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
set search_path = pg_catalog, public, app_private
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_subject_offering_id is null then
    if not app_private.has_school_role(
      p_school_id,
      array['school_admin','principal','deputy_principal','hod']
    ) then
      raise exception 'Permission denied';
    end if;
  else
    if not exists (
      select 1
      from public.subject_offerings so
      where so.id=p_subject_offering_id
        and so.school_id=p_school_id
        and so.academic_year=p_academic_year
    ) then
      raise exception 'Subject offering does not match school and academic year';
    end if;

    if not app_private.can_read_official_result_offering_n21(
      p_school_id,p_subject_offering_id
    ) then
      raise exception 'Permission denied';
    end if;
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
      and app_private.can_read_official_result_n21(
        r.school_id,r.enrolment_id,r.subject_offering_id
      )
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
      b.school_id,b.academic_year,b.term_number,b.subject_offering_id,
      b.assessment_scheme_key,b.assessment_scheme_version,
      b.grading_scale_key,b.grading_scale_version,
      b.academic_rule_set_key,b.academic_rule_set_version,
      b.outcome_type,b.outcome_value
  )
  select
    c.school_id,c.academic_year,c.term_number,c.subject_offering_id,
    c.assessment_scheme_key,c.assessment_scheme_version,
    c.grading_scale_key,c.grading_scale_version,
    c.academic_rule_set_key,c.academic_rule_set_version,
    c.outcome_type,c.outcome_value,c.result_count,
    sum(c.result_count) over (
      partition by
        c.school_id,c.academic_year,c.term_number,c.subject_offering_id,
        c.assessment_scheme_key,c.assessment_scheme_version,
        c.grading_scale_key,c.grading_scale_version,
        c.academic_rule_set_key,c.academic_rule_set_version
    )::bigint as eligible_result_count,
    round(
      (100.0*c.result_count)/nullif(
        sum(c.result_count) over (
          partition by
            c.school_id,c.academic_year,c.term_number,c.subject_offering_id,
            c.assessment_scheme_key,c.assessment_scheme_version,
            c.grading_scale_key,c.grading_scale_version,
            c.academic_rule_set_key,c.academic_rule_set_version
        ),0
      ),2
    ) as percentage
  from counted c
  order by c.term_number,c.subject_offering_id,c.outcome_type,c.outcome_value nulls last;
end;
$$;

revoke all on function public.get_official_result_symbol_distribution(uuid,integer,smallint,uuid)
from public,anon;
grant execute on function public.get_official_result_symbol_distribution(uuid,integer,smallint,uuid)
to authenticated;

comment on function public.get_official_result_symbol_distribution(uuid,integer,smallint,uuid) is
'N21 school distribution over approved official_results. School-wide access is academic-leadership only; teacher access requires an exact annual subject offering and is further constrained by the official-result learner/class relationship.';

-- The original comparison signature cannot express separate annual offerings safely.
revoke all on function public.compare_official_result_series(uuid,uuid,integer,smallint,integer,smallint)
from public,anon,authenticated;

create or replace function public.compare_official_result_series(
  p_school_id uuid,
  p_left_subject_offering_id uuid,
  p_right_subject_offering_id uuid,
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
set search_path = pg_catalog, public, app_private
as $$
declare
  v_left_count integer;
  v_right_count integer;
  v_left record;
  v_right record;
  v_left_offering record;
  v_right_offering record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_left_academic_year<>p_right_academic_year
     and p_left_subject_offering_id=p_right_subject_offering_id then
    raise exception 'Distinct academic years require distinct annual subject offerings';
  end if;

  select so.school_id,so.academic_year,so.subject_id,so.grade_id,g.grade_code
    into v_left_offering
  from public.subject_offerings so
  join public.grades g on g.id=so.grade_id
  where so.id=p_left_subject_offering_id;

  if not found
     or v_left_offering.school_id<>p_school_id
     or v_left_offering.academic_year<>p_left_academic_year then
    raise exception 'Left subject offering does not match school and academic year';
  end if;

  select so.school_id,so.academic_year,so.subject_id,so.grade_id,g.grade_code
    into v_right_offering
  from public.subject_offerings so
  join public.grades g on g.id=so.grade_id
  where so.id=p_right_subject_offering_id;

  if not found
     or v_right_offering.school_id<>p_school_id
     or v_right_offering.academic_year<>p_right_academic_year then
    raise exception 'Right subject offering does not match school and academic year';
  end if;

  if v_left_offering.subject_id is distinct from v_right_offering.subject_id then
    raise exception 'Incompatible subject offerings: subject differs';
  end if;

  if v_left_offering.grade_code is distinct from v_right_offering.grade_code then
    raise exception 'Incompatible subject offerings: grade differs';
  end if;

  if not app_private.can_read_official_result_offering_n21(
    p_school_id,p_left_subject_offering_id
  ) then
    raise exception 'Permission denied';
  end if;

  if not app_private.can_read_official_result_offering_n21(
    p_school_id,p_right_subject_offering_id
  ) then
    raise exception 'Permission denied';
  end if;

  select count(*) into v_left_count
  from (
    select distinct
      r.assessment_scheme_key,r.assessment_scheme_version,
      r.grading_scale_key,r.grading_scale_version,
      r.academic_rule_set_key,r.academic_rule_set_version
    from public.official_results r
    where r.school_id=p_school_id
      and r.subject_offering_id=p_left_subject_offering_id
      and r.academic_year=p_left_academic_year
      and r.term_number=p_left_term_number
      and r.approved_at is not null
      and app_private.can_read_official_result_n21(
        r.school_id,r.enrolment_id,r.subject_offering_id
      )
  ) provenance;

  select count(*) into v_right_count
  from (
    select distinct
      r.assessment_scheme_key,r.assessment_scheme_version,
      r.grading_scale_key,r.grading_scale_version,
      r.academic_rule_set_key,r.academic_rule_set_version
    from public.official_results r
    where r.school_id=p_school_id
      and r.subject_offering_id=p_right_subject_offering_id
      and r.academic_year=p_right_academic_year
      and r.term_number=p_right_term_number
      and r.approved_at is not null
      and app_private.can_read_official_result_n21(
        r.school_id,r.enrolment_id,r.subject_offering_id
      )
  ) provenance;

  if v_left_count=0 or v_right_count=0 then
    raise exception 'Both result series must contain approved official results';
  end if;

  if v_left_count<>1 or v_right_count<>1 then
    raise exception 'Series with mixed provenance cannot be compared';
  end if;

  select distinct
    r.assessment_scheme_key,r.assessment_scheme_version,
    r.grading_scale_key,r.grading_scale_version,
    r.academic_rule_set_key,r.academic_rule_set_version
  into v_left
  from public.official_results r
  where r.school_id=p_school_id
    and r.subject_offering_id=p_left_subject_offering_id
    and r.academic_year=p_left_academic_year
    and r.term_number=p_left_term_number
    and r.approved_at is not null
    and app_private.can_read_official_result_n21(
      r.school_id,r.enrolment_id,r.subject_offering_id
    );

  select distinct
    r.assessment_scheme_key,r.assessment_scheme_version,
    r.grading_scale_key,r.grading_scale_version,
    r.academic_rule_set_key,r.academic_rule_set_version
  into v_right
  from public.official_results r
  where r.school_id=p_school_id
    and r.subject_offering_id=p_right_subject_offering_id
    and r.academic_year=p_right_academic_year
    and r.term_number=p_right_term_number
    and r.approved_at is not null
    and app_private.can_read_official_result_n21(
      r.school_id,r.enrolment_id,r.subject_offering_id
    );

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
    select 'left'::text as series_side,r.*
    from public.official_results r
    where r.school_id=p_school_id
      and r.subject_offering_id=p_left_subject_offering_id
      and r.academic_year=p_left_academic_year
      and r.term_number=p_left_term_number
      and r.approved_at is not null
      and app_private.can_read_official_result_n21(
        r.school_id,r.enrolment_id,r.subject_offering_id
      )
    union all
    select 'right'::text as series_side,r.*
    from public.official_results r
    where r.school_id=p_school_id
      and r.subject_offering_id=p_right_subject_offering_id
      and r.academic_year=p_right_academic_year
      and r.term_number=p_right_term_number
      and r.approved_at is not null
      and app_private.can_read_official_result_n21(
        r.school_id,r.enrolment_id,r.subject_offering_id
      )
  ), bucketed as (
    select
      s.series_side,s.school_id,s.academic_year,s.term_number,s.subject_offering_id,
      s.assessment_scheme_key,s.assessment_scheme_version,
      s.grading_scale_key,s.grading_scale_version,
      s.academic_rule_set_key,s.academic_rule_set_version,
      case
        when s.symbol is not null then 'symbol'
        when s.result_status is not null then 'status'
        else 'unclassified'
      end as outcome_type,
      coalesce(s.symbol,s.result_status) as outcome_value
    from series s
  ), counted as (
    select b.*,count(*)::bigint as result_count
    from bucketed b
    group by
      b.series_side,b.school_id,b.academic_year,b.term_number,b.subject_offering_id,
      b.assessment_scheme_key,b.assessment_scheme_version,
      b.grading_scale_key,b.grading_scale_version,
      b.academic_rule_set_key,b.academic_rule_set_version,
      b.outcome_type,b.outcome_value
  )
  select
    c.series_side,c.school_id,c.academic_year,c.term_number,c.subject_offering_id,
    c.assessment_scheme_key,c.assessment_scheme_version,
    c.grading_scale_key,c.grading_scale_version,
    c.academic_rule_set_key,c.academic_rule_set_version,
    c.outcome_type,c.outcome_value,c.result_count,
    sum(c.result_count) over (partition by c.series_side)::bigint as eligible_result_count,
    round(
      (100.0*c.result_count)/nullif(
        sum(c.result_count) over (partition by c.series_side),0
      ),2
    ) as percentage
  from counted c
  order by c.series_side,c.outcome_type,c.outcome_value nulls last;
end;
$$;

revoke all on function public.compare_official_result_series(uuid,uuid,uuid,integer,smallint,integer,smallint)
from public,anon;
grant execute on function public.compare_official_result_series(uuid,uuid,uuid,integer,smallint,integer,smallint)
to authenticated;

comment on function public.compare_official_result_series(uuid,uuid,uuid,integer,smallint,integer,smallint) is
'N21 corrected comparison between independently authorized annual subject offerings. Offerings must belong to their respective years and share the same stable subject plus grade code; captured assessment, grading-scale, and academic-rule provenance must be identical.';
