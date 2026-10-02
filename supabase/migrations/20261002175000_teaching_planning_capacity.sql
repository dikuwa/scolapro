-- Issue #1007 / Slice 4: calendar-adjusted Teaching Planning capacity.
-- Capacity is derived from the canonical calendar resolver + existing timetable
-- slots + existing pacing plan. No weekly multiplication and no parallel store.

create or replace function public.get_teaching_planning_capacity(
  p_school_id uuid,
  p_academic_year integer,
  p_as_of date default current_date
)
returns table(
  plan_id uuid,
  plan_level text,
  plan_status text,
  subject_offering_id uuid,
  register_class_id uuid,
  class_name text,
  grade_name text,
  subject_name text,
  allocation_origin text,
  official_resolution_status text,
  official_periods_per_cycle smallint,
  school_target_periods_per_cycle smallint,
  cycle_kind text,
  cycle_length smallint,
  year_expected_opportunities integer,
  year_planned_periods integer,
  year_remaining_capacity integer,
  future_expected_opportunities integer,
  outstanding_planned_periods integer,
  future_remaining_capacity integer,
  current_term_id uuid,
  current_term_name text,
  current_term_expected_opportunities integer,
  current_term_planned_periods integer,
  current_term_remaining_capacity integer,
  term_capacity jsonb,
  capacity_status text,
  capacity_warnings jsonb
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $planning_capacity$
declare
  v_year_start date;
  v_year_end date;
  v_cycle_kind text;
  v_cycle_length smallint;
  v_anchor_present boolean:=true;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_school_id is null or p_academic_year is null or p_as_of is null then
    raise exception 'School, academic year and as-of date are required';
  end if;

  if p_academic_year<2000 or p_academic_year>2200 then
    raise exception 'Academic year is invalid';
  end if;

  if not app_private.has_school_access(p_school_id) then
    raise exception 'Permission denied';
  end if;

  select ay.starts_on,ay.ends_on
    into v_year_start,v_year_end
  from public.academic_years ay
  where ay.school_id=p_school_id
    and ay.year=p_academic_year;

  select s.timetable_cycle_mode,s.timetable_cycle_length
    into v_cycle_kind,v_cycle_length
  from public.schools s
  where s.id=p_school_id
    and s.status='active';

  if not found then
    raise exception 'School not found';
  end if;

  if v_cycle_kind='rotating' then
    v_anchor_present:=exists(
      select 1
      from public.timetable_cycle_anchors a
      where a.school_id=p_school_id
        and a.academic_year=p_academic_year
    );
  end if;

  return query
  with plan_base as (
    select
      pp.id as plan_id,
      pp.plan_level,
      pp.status as plan_status,
      pp.subject_offering_id,
      pp.register_class_id as plan_register_class_id,
      pp.teacher_allocation_id as plan_teacher_allocation_id,
      so.curriculum_version_id,
      so.allocation_origin,
      so.periods_per_cycle as school_target_periods_per_cycle,
      so.grade_id,
      sub.display_name as subject_name,
      g.display_name as grade_name,
      g.grade_code,
      cv.curriculum_subject_id
    from public.pacing_plans pp
    join public.subject_offerings so
      on so.id=pp.subject_offering_id
     and so.school_id=pp.school_id
     and so.academic_year=pp.academic_year
     and so.status='active'
    join public.subjects sub on sub.id=so.subject_id
    join public.grades g on g.id=so.grade_id
    join public.curriculum_versions cv on cv.id=pp.curriculum_version_id
    where pp.school_id=p_school_id
      and pp.academic_year=p_academic_year
      and pp.status in ('draft','active')
  ),
  target_allocations as (
    select
      pb.*,
      ta.id as teacher_allocation_id,
      ta.register_class_id,
      ta.active_from,
      ta.active_to,
      rc.display_name as class_name
    from plan_base pb
    join public.teacher_allocations ta
      on ta.school_id=p_school_id
     and ta.academic_year=p_academic_year
     and ta.subject_offering_id=pb.subject_offering_id
     and (pb.plan_register_class_id is null or pb.plan_register_class_id=ta.register_class_id)
     and (pb.plan_teacher_allocation_id is null or pb.plan_teacher_allocation_id=ta.id)
     and (
       v_year_start is null
       or v_year_end is null
       or (
         ta.active_from<=v_year_end
         and (ta.active_to is null or ta.active_to>=v_year_start)
       )
     )
    join public.register_classes rc
      on rc.id=ta.register_class_id
     and rc.school_id=p_school_id
     and rc.academic_year=p_academic_year
     and rc.grade_id=pb.grade_id
    where app_private.can_access_teaching_plan(p_school_id,ta.id)
  ),
  target_rows as (
    select distinct
      ta.plan_id,
      ta.plan_level,
      ta.plan_status,
      ta.subject_offering_id,
      ta.register_class_id,
      ta.class_name,
      ta.grade_name,
      ta.subject_name,
      ta.allocation_origin,
      ta.school_target_periods_per_cycle,
      ta.curriculum_version_id,
      ta.curriculum_subject_id,
      ta.grade_code
    from target_allocations ta
  ),
  calendar_days as (
    select
      d.day_value::date as school_date,
      public.resolve_timetable_day(
        p_school_id,
        p_academic_year,
        d.day_value::date
      ) as timetable_day,
      at.id as academic_term_id
    from generate_series(
      v_year_start,
      v_year_end,
      interval '1 day'
    ) d(day_value)
    left join public.academic_terms at
      on at.school_id=p_school_id
     and at.academic_year_id=(
       select ay.id
       from public.academic_years ay
       where ay.school_id=p_school_id
         and ay.year=p_academic_year
       limit 1
     )
     and at.starts_on is not null
     and at.ends_on is not null
     and d.day_value::date between at.starts_on and at.ends_on
    where v_year_start is not null
      and v_year_end is not null
  ),
  opportunity_events as (
    select
      ta.plan_id,
      ta.register_class_id,
      cd.school_date,
      cd.academic_term_id,
      ts.id as timetable_slot_id
    from target_allocations ta
    join public.timetable_slots ts
      on ts.school_id=p_school_id
     and ts.academic_year=p_academic_year
     and ts.teacher_allocation_id=ta.teacher_allocation_id
     and ts.register_class_id=ta.register_class_id
     and ts.status='active'
    join public.timetable_periods tp
      on tp.id=ts.period_id
     and tp.school_id=p_school_id
     and tp.academic_year=p_academic_year
     and tp.is_teaching_period
    join calendar_days cd
      on cd.timetable_day=ts.weekday
     and cd.school_date>=ta.active_from
     and (ta.active_to is null or cd.school_date<=ta.active_to)
  ),
  opportunity_summary as (
    select
      tr.plan_id,
      tr.register_class_id,
      count(distinct (oe.school_date,oe.timetable_slot_id))::integer as year_expected_opportunities,
      count(distinct (oe.school_date,oe.timetable_slot_id))
        filter(where oe.school_date>=greatest(p_as_of,coalesce(v_year_start,p_as_of)))::integer
        as future_expected_opportunities
    from target_rows tr
    left join opportunity_events oe
      on oe.plan_id=tr.plan_id
     and oe.register_class_id=tr.register_class_id
    group by tr.plan_id,tr.register_class_id
  ),
  plan_item_summary as (
    select
      ppi.pacing_plan_id as plan_id,
      coalesce(sum(ppi.planned_periods),0)::integer as year_planned_periods,
      coalesce(sum(ppi.planned_periods) filter(where ppi.completed_on is null),0)::integer
        as outstanding_planned_periods
    from public.pacing_plan_items ppi
    join plan_base pb on pb.plan_id=ppi.pacing_plan_id
    group by ppi.pacing_plan_id
  ),
  term_planned as (
    select
      ppi.pacing_plan_id as plan_id,
      ppi.academic_term_id,
      coalesce(sum(ppi.planned_periods),0)::integer as planned_periods
    from public.pacing_plan_items ppi
    join plan_base pb on pb.plan_id=ppi.pacing_plan_id
    where ppi.academic_term_id is not null
    group by ppi.pacing_plan_id,ppi.academic_term_id
  ),
  term_expected as (
    select
      oe.plan_id,
      oe.register_class_id,
      oe.academic_term_id,
      count(distinct (oe.school_date,oe.timetable_slot_id))::integer as expected_opportunities
    from opportunity_events oe
    where oe.academic_term_id is not null
    group by oe.plan_id,oe.register_class_id,oe.academic_term_id
  ),
  current_term as (
    select at.id,at.display_name
    from public.academic_terms at
    join public.academic_years ay on ay.id=at.academic_year_id
    where at.school_id=p_school_id
      and ay.year=p_academic_year
      and at.starts_on is not null
      and at.ends_on is not null
      and p_as_of between at.starts_on and at.ends_on
    order by at.term_number
    limit 1
  ),
  term_rollup as (
    select
      tr.plan_id,
      tr.register_class_id,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'termId',at.id,
            'termName',at.display_name,
            'startsOn',at.starts_on,
            'endsOn',at.ends_on,
            'expectedOpportunities',
              case
                when at.starts_on is null or at.ends_on is null then null
                else coalesce(te.expected_opportunities,0)
              end,
            'plannedPeriods',coalesce(tp.planned_periods,0),
            'remainingCapacity',
              case
                when at.starts_on is null or at.ends_on is null then null
                else coalesce(te.expected_opportunities,0)-coalesce(tp.planned_periods,0)
              end
          )
          order by at.term_number
        ) filter(where at.id is not null),
        '[]'::jsonb
      ) as term_capacity
    from target_rows tr
    left join public.academic_years ay
      on ay.school_id=p_school_id
     and ay.year=p_academic_year
    left join public.academic_terms at
      on at.academic_year_id=ay.id
    left join term_expected te
      on te.plan_id=tr.plan_id
     and te.register_class_id=tr.register_class_id
     and te.academic_term_id=at.id
    left join term_planned tp
      on tp.plan_id=tr.plan_id
     and tp.academic_term_id=at.id
    group by tr.plan_id,tr.register_class_id
  ),
  official_context as (
    select
      tr.*,
      coalesce(r.resolution_status,'source_missing') as official_resolution_status,
      r.periods_per_cycle as official_periods_per_cycle,
      coalesce(r.cycle_kind,v_cycle_kind) as cycle_kind,
      coalesce(r.cycle_length,v_cycle_length) as cycle_length
    from target_rows tr
    left join lateral app_private.resolve_optional_curriculum_time_allocation(
      tr.curriculum_subject_id,
      substring(tr.grade_code from '([0-9]{1,2})')::smallint,
      p_academic_year,
      v_cycle_kind,
      v_cycle_length,
      tr.curriculum_version_id
    ) r on true
  ),
  assembled as (
    select
      oc.*,
      coalesce(os.year_expected_opportunities,0) as year_expected_opportunities,
      coalesce(pis.year_planned_periods,0) as year_planned_periods,
      coalesce(os.year_expected_opportunities,0)-coalesce(pis.year_planned_periods,0)
        as year_remaining_capacity,
      coalesce(os.future_expected_opportunities,0) as future_expected_opportunities,
      coalesce(pis.outstanding_planned_periods,0) as outstanding_planned_periods,
      coalesce(os.future_expected_opportunities,0)-coalesce(pis.outstanding_planned_periods,0)
        as future_remaining_capacity,
      ct.id as current_term_id,
      ct.display_name as current_term_name,
      case
        when ct.id is null then null
        else coalesce(te.expected_opportunities,0)
      end as current_term_expected_opportunities,
      case
        when ct.id is null then null
        else coalesce(tp.planned_periods,0)
      end as current_term_planned_periods,
      case
        when ct.id is null then null
        else coalesce(te.expected_opportunities,0)-coalesce(tp.planned_periods,0)
      end as current_term_remaining_capacity,
      coalesce(tr.term_capacity,'[]'::jsonb) as term_capacity
    from official_context oc
    left join opportunity_summary os
      on os.plan_id=oc.plan_id
     and os.register_class_id=oc.register_class_id
    left join plan_item_summary pis on pis.plan_id=oc.plan_id
    cross join lateral (
      select id,display_name from current_term
      union all
      select null::uuid,null::text
      where not exists(select 1 from current_term)
      limit 1
    ) ct
    left join term_expected te
      on te.plan_id=oc.plan_id
     and te.register_class_id=oc.register_class_id
     and te.academic_term_id=ct.id
    left join term_planned tp
      on tp.plan_id=oc.plan_id
     and tp.academic_term_id=ct.id
    left join term_rollup tr
      on tr.plan_id=oc.plan_id
     and tr.register_class_id=oc.register_class_id
  )
  select
    a.plan_id,
    a.plan_level,
    a.plan_status,
    a.subject_offering_id,
    a.register_class_id,
    a.class_name,
    a.grade_name,
    a.subject_name,
    a.allocation_origin,
    a.official_resolution_status,
    a.official_periods_per_cycle,
    a.school_target_periods_per_cycle,
    a.cycle_kind,
    a.cycle_length,
    a.year_expected_opportunities,
    a.year_planned_periods,
    a.year_remaining_capacity,
    a.future_expected_opportunities,
    a.outstanding_planned_periods,
    a.future_remaining_capacity,
    a.current_term_id,
    a.current_term_name,
    a.current_term_expected_opportunities,
    a.current_term_planned_periods,
    a.current_term_remaining_capacity,
    a.term_capacity,
    case
      when v_year_start is null or v_year_end is null then 'calendar_incomplete'
      when v_cycle_kind='rotating' and not v_anchor_present then 'calendar_incomplete'
      when a.year_planned_periods>a.year_expected_opportunities then 'over_capacity'
      when a.outstanding_planned_periods>a.future_expected_opportunities then 'insufficient_remaining'
      when a.current_term_remaining_capacity is not null
        and a.current_term_remaining_capacity<0 then 'term_over_capacity'
      when a.official_resolution_status in ('source_missing','cycle_variant_missing','source_conflict')
        and a.allocation_origin<>'school_configured' then 'source_unresolved'
      else 'ready'
    end as capacity_status,
    (
      case
        when v_year_start is null or v_year_end is null
          then jsonb_build_array('Academic-year start and end dates are required before teaching capacity can be calculated.')
        else '[]'::jsonb
      end
      ||
      case
        when v_cycle_kind='rotating' and not v_anchor_present
          then jsonb_build_array('The rotating timetable needs a governed calendar anchor before teaching opportunities can be calculated.')
        else '[]'::jsonb
      end
      ||
      case
        when a.official_resolution_status='cycle_variant_missing'
          then jsonb_build_array('No verified official time allocation exists for the school''s exact timetable cycle.')
        when a.official_resolution_status='source_conflict'
          then jsonb_build_array('Multiple official time allocations conflict; governance review is required.')
        when a.official_resolution_status='source_missing'
          and a.allocation_origin<>'school_configured'
          then jsonb_build_array('No verified official time allocation is resolved for this plan.')
        else '[]'::jsonb
      end
      ||
      case
        when a.year_planned_periods>a.year_expected_opportunities
          then jsonb_build_array(format(
            'Planned demand is %s periods but only %s calendar-adjusted teaching opportunities exist for the year.',
            a.year_planned_periods,
            a.year_expected_opportunities
          ))
        else '[]'::jsonb
      end
      ||
      case
        when a.outstanding_planned_periods>a.future_expected_opportunities
          then jsonb_build_array(format(
            '%s planned periods remain but only %s teaching opportunities remain from the as-of date.',
            a.outstanding_planned_periods,
            a.future_expected_opportunities
          ))
        else '[]'::jsonb
      end
      ||
      case
        when a.current_term_remaining_capacity is not null
          and a.current_term_remaining_capacity<0
          then jsonb_build_array(format(
            '%s exceeds its calendar-adjusted capacity by %s period%s.',
            a.current_term_name,
            abs(a.current_term_remaining_capacity),
            case when abs(a.current_term_remaining_capacity)=1 then '' else 's' end
          ))
        else '[]'::jsonb
      end
    ) as capacity_warnings
  from assembled a
  order by a.grade_name,a.class_name,a.subject_name,a.plan_id;
end;
$planning_capacity$;

revoke all on function public.get_teaching_planning_capacity(uuid,integer,date)
from public,anon;
grant execute on function public.get_teaching_planning_capacity(uuid,integer,date)
to authenticated;

comment on function public.get_teaching_planning_capacity(uuid,integer,date) is
'Calendar-adjusted teaching capacity for existing pacing plans. Expected opportunities are counted from real timetable slots on dates resolved by public.resolve_timetable_day, respecting school-day overrides, rotating anchors, term/year boundaries, and teacher-allocation effective windows. The function never derives capacity as periods_per_cycle multiplied by weeks and writes no planning state.';
