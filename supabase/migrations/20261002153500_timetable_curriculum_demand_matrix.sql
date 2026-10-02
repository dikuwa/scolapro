-- Issue #1006 / Slice 3: timetable curriculum demand matrix.
-- Scheduled counts remain derived from active timetable slots. No second scheduled-count store is introduced.

create or replace function public.get_timetable_curriculum_demand_matrix(
  p_school_id uuid,
  p_academic_year integer,
  p_as_of date default current_date
)
returns table(
  subject_offering_id uuid,
  register_class_id uuid,
  class_name text,
  grade_name text,
  subject_name text,
  allocation_origin text,
  linked_allocation_id uuid,
  official_resolution_status text,
  official_allocation_id uuid,
  official_periods_per_cycle smallint,
  school_target_periods_per_cycle smallint,
  scheduled_periods_per_cycle integer,
  scheduled_variance integer,
  rule_strength text,
  source_title text,
  source_locator text,
  available_cycle_variants jsonb,
  double_periods_required integer,
  double_periods_scheduled integer,
  class_target_periods_per_cycle integer,
  class_capacity_periods_per_cycle integer,
  max_double_periods_per_cycle integer,
  pre_generation_warnings jsonb,
  demand_status text,
  warning_message text
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $demand_matrix$
declare
  v_cycle_kind text;
  v_cycle_length smallint;
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

  if not (
    app_private.has_platform_role(array['platform_admin','platform_support'])
    or exists(
      select 1
      from public.school_memberships sm
      where sm.school_id=p_school_id
        and sm.user_id=auth.uid()
        and sm.role_key in ('school_admin','principal','deputy_principal','hod')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    )
  ) then
    raise exception 'Permission denied';
  end if;

  select
    s.timetable_cycle_mode,
    s.timetable_cycle_length
    into v_cycle_kind,v_cycle_length
  from public.schools s
  where s.id=p_school_id;

  if not found then
    raise exception 'School not found';
  end if;

  return query
  with current_allocations as (
    select
      ta.id as teacher_allocation_id,
      ta.subject_offering_id,
      ta.register_class_id
    from public.teacher_allocations ta
    join public.subject_offerings so
      on so.id=ta.subject_offering_id
     and so.school_id=ta.school_id
     and so.academic_year=ta.academic_year
    join public.register_classes rc
      on rc.id=ta.register_class_id
     and rc.school_id=ta.school_id
     and rc.academic_year=ta.academic_year
     and rc.grade_id=so.grade_id
    where ta.school_id=p_school_id
      and ta.academic_year=p_academic_year
      and ta.active_from<=p_as_of
      and (ta.active_to is null or ta.active_to>=p_as_of)
      and so.status='active'
  ),
  demand_base as (
    select distinct
      ca.subject_offering_id,
      ca.register_class_id,
      so.subject_id,
      so.curriculum_version_id,
      so.curriculum_time_allocation_id as linked_allocation_id,
      so.allocation_origin,
      so.periods_per_cycle as school_target_periods_per_cycle,
      rc.display_name as class_name,
      g.display_name as grade_name,
      g.grade_code,
      substring(g.grade_code from '([0-9]{1,2})')::smallint as grade_number,
      sub.display_name as subject_name,
      cv.curriculum_subject_id as pinned_curriculum_subject_id
    from current_allocations ca
    join public.subject_offerings so on so.id=ca.subject_offering_id
    join public.register_classes rc on rc.id=ca.register_class_id
    join public.grades g on g.id=so.grade_id
    join public.subjects sub on sub.id=so.subject_id
    left join public.curriculum_versions cv on cv.id=so.curriculum_version_id
  ),
  mapped as (
    select
      db.*,
      case
        when db.pinned_curriculum_subject_id is not null
          then db.pinned_curriculum_subject_id
        when mapping_summary.candidate_count=1
          then mapping_summary.curriculum_subject_id
        else null
      end as resolved_curriculum_subject_id
    from demand_base db
    left join lateral (
      select
        count(*)::integer as candidate_count,
        min(candidate.curriculum_subject_id::text)::uuid as curriculum_subject_id
      from (
        select distinct m.curriculum_subject_id
        from public.school_subject_curriculum_mappings m
        where m.school_id=p_school_id
          and m.subject_id=db.subject_id
          and m.status='verified'
          and lower(btrim(m.grade_code))=lower(btrim(db.grade_code))
          and m.effective_from_year<=p_academic_year
          and (m.effective_to_year is null or m.effective_to_year>=p_academic_year)
      ) candidate
    ) mapping_summary on true
  ),
  resolved as (
    select
      m.*,
      coalesce(r.resolution_status,'source_missing') as official_resolution_status,
      r.allocation_id as official_allocation_id,
      r.periods_per_cycle as official_periods_per_cycle,
      r.rule_strength,
      r.source_title,
      r.source_locator,
      coalesce(r.available_cycle_variants,'[]'::jsonb) as available_cycle_variants,
      coalesce(r.scheduling_constraints,'[]'::jsonb) as scheduling_constraints
    from mapped m
    left join lateral app_private.resolve_optional_curriculum_time_allocation(
      m.resolved_curriculum_subject_id,
      m.grade_number,
      p_academic_year,
      v_cycle_kind,
      v_cycle_length,
      m.curriculum_version_id
    ) r on true
  ),
  resolved_with_constraints as (
    select
      r.*,
      coalesce(constraint_summary.double_periods_required,0) as double_periods_required
    from resolved r
    left join lateral (
      select
        max((constraint_item->>'numericValue')::numeric)::integer as double_periods_required
      from jsonb_array_elements(r.scheduling_constraints) constraint_item
      where constraint_item->>'constraintType'='min_double_periods_per_cycle'
    ) constraint_summary on true
  ),
  period_positions as (
    select
      tp.id,
      tp.is_teaching_period,
      row_number() over(
        order by tp.period_number,tp.id
      )::integer as period_position
    from public.timetable_periods tp
    where tp.school_id=p_school_id
      and tp.academic_year=p_academic_year
  ),
  period_structure_marked as (
    select
      pp.*,
      sum(case when pp.is_teaching_period then 0 else 1 end) over(
        order by pp.period_position
        rows between unbounded preceding and current row
      )::integer as teaching_block
    from period_positions pp
  ),
  teaching_structure_runs as (
    select
      psm.teaching_block,
      count(*)::integer as run_length
    from period_structure_marked psm
    where psm.is_teaching_period
    group by psm.teaching_block
  ),
  period_capacity as (
    select
      (
        (select count(*)::integer from period_positions pp where pp.is_teaching_period)
        * v_cycle_length
      )::integer as class_capacity_periods_per_cycle,
      (
        coalesce(
          (select sum(floor(tsr.run_length::numeric/2))::integer from teaching_structure_runs tsr),
          0
        ) * v_cycle_length
      )::integer as max_double_periods_per_cycle
  ),
  class_targets as (
    select
      rwc.register_class_id,
      sum(rwc.school_target_periods_per_cycle)::integer as class_target_periods_per_cycle
    from resolved_with_constraints rwc
    group by rwc.register_class_id
  ),
  current_slots as (
    select
      ts.id as slot_id,
      ca.subject_offering_id,
      ca.register_class_id,
      ca.teacher_allocation_id,
      ts.cycle_code,
      ts.weekday,
      pp.period_position
    from public.timetable_slots ts
    join current_allocations ca
      on ca.teacher_allocation_id=ts.teacher_allocation_id
     and ca.register_class_id=ts.register_class_id
    join period_positions pp
      on pp.id=ts.period_id
     and pp.is_teaching_period
    where ts.school_id=p_school_id
      and ts.academic_year=p_academic_year
      and ts.status='active'
  ),
  scheduled_counts as (
    select
      cs.subject_offering_id,
      cs.register_class_id,
      count(distinct cs.slot_id)::integer as scheduled_periods_per_cycle
    from current_slots cs
    group by cs.subject_offering_id,cs.register_class_id
  ),
  ordered_slot_runs as (
    select
      cs.*,
      cs.period_position
        - row_number() over(
            partition by
              cs.subject_offering_id,
              cs.register_class_id,
              cs.teacher_allocation_id,
              cs.cycle_code,
              cs.weekday
            order by cs.period_position,cs.slot_id
          )::integer as run_key
    from current_slots cs
  ),
  contiguous_runs as (
    select
      osr.subject_offering_id,
      osr.register_class_id,
      osr.teacher_allocation_id,
      osr.cycle_code,
      osr.weekday,
      osr.run_key,
      count(*)::integer as run_length
    from ordered_slot_runs osr
    group by
      osr.subject_offering_id,
      osr.register_class_id,
      osr.teacher_allocation_id,
      osr.cycle_code,
      osr.weekday,
      osr.run_key
  ),
  double_counts as (
    select
      cr.subject_offering_id,
      cr.register_class_id,
      coalesce(sum(floor(cr.run_length::numeric/2)),0)::integer as double_periods_scheduled
    from contiguous_runs cr
    group by cr.subject_offering_id,cr.register_class_id
  ),
  classified as (
    select
      rwc.*,
      coalesce(sc.scheduled_periods_per_cycle,0) as scheduled_periods_per_cycle,
      coalesce(dc.double_periods_scheduled,0) as double_periods_scheduled,
      coalesce(sc.scheduled_periods_per_cycle,0)
        - rwc.school_target_periods_per_cycle as scheduled_variance,
      ct.class_target_periods_per_cycle,
      pc.class_capacity_periods_per_cycle,
      pc.max_double_periods_per_cycle,
      (
        case
          when ct.class_target_periods_per_cycle>pc.class_capacity_periods_per_cycle
            then jsonb_build_array(format(
              'Class target demand is %s periods per cycle but the active period structure provides only %s.',
              ct.class_target_periods_per_cycle,
              pc.class_capacity_periods_per_cycle
            ))
          else '[]'::jsonb
        end
        ||
        case
          when rwc.official_resolution_status='resolved'
            and rwc.official_periods_per_cycle is distinct from rwc.school_target_periods_per_cycle
            then jsonb_build_array(format(
              'School target %s differs from the resolved official allocation of %s.',
              rwc.school_target_periods_per_cycle,
              rwc.official_periods_per_cycle
            ))
          else '[]'::jsonb
        end
        ||
        case
          when rwc.official_resolution_status='cycle_variant_missing'
            then jsonb_build_array(format(
              'No verified official allocation exists for this exact %s-day %s cycle.',
              v_cycle_length,
              v_cycle_kind
            ))
          when rwc.official_resolution_status='source_conflict'
            then jsonb_build_array(
              'Multiple applicable official allocations conflict; governance review is required.'
            )
          when rwc.official_resolution_status='source_missing'
            and rwc.allocation_origin<>'school_configured'
            then jsonb_build_array(
              'No verified official time-allocation rule is available for this subject, grade and timetable cycle.'
            )
          else '[]'::jsonb
        end
        ||
        case
          when rwc.double_periods_required>0
            and rwc.double_periods_required*2>rwc.school_target_periods_per_cycle
            then jsonb_build_array(format(
              'School target %s cannot contain %s required double period%s.',
              rwc.school_target_periods_per_cycle,
              rwc.double_periods_required,
              case when rwc.double_periods_required=1 then '' else 's' end
            ))
          when rwc.double_periods_required>pc.max_double_periods_per_cycle
            then jsonb_build_array(format(
              'Active period structure can fit at most %s double period%s per cycle; the official rule requires %s.',
              pc.max_double_periods_per_cycle,
              case when pc.max_double_periods_per_cycle=1 then '' else 's' end,
              rwc.double_periods_required
            ))
          else '[]'::jsonb
        end
      ) as pre_generation_warnings,
      case
        when rwc.official_resolution_status='source_conflict'
          then 'source_conflict'
        when rwc.official_resolution_status='cycle_variant_missing'
          then 'cycle_variant_missing'
        when rwc.official_resolution_status<>'resolved'
          and rwc.allocation_origin<>'school_configured'
          then 'source_missing'
        when rwc.double_periods_required>coalesce(dc.double_periods_scheduled,0)
          then 'constraint_warning'
        when coalesce(sc.scheduled_periods_per_cycle,0)<rwc.school_target_periods_per_cycle
          then 'under_scheduled'
        when coalesce(sc.scheduled_periods_per_cycle,0)>rwc.school_target_periods_per_cycle
          then 'over_scheduled'
        when rwc.allocation_origin='school_override'
          then 'school_override'
        else 'aligned'
      end as demand_status
    from resolved_with_constraints rwc
    join class_targets ct
      on ct.register_class_id=rwc.register_class_id
    cross join period_capacity pc
    left join scheduled_counts sc
      on sc.subject_offering_id=rwc.subject_offering_id
     and sc.register_class_id=rwc.register_class_id
    left join double_counts dc
      on dc.subject_offering_id=rwc.subject_offering_id
     and dc.register_class_id=rwc.register_class_id
  )
  select
    c.subject_offering_id,
    c.register_class_id,
    c.class_name,
    c.grade_name,
    c.subject_name,
    c.allocation_origin,
    c.linked_allocation_id,
    c.official_resolution_status,
    c.official_allocation_id,
    c.official_periods_per_cycle,
    c.school_target_periods_per_cycle,
    c.scheduled_periods_per_cycle,
    c.scheduled_variance,
    c.rule_strength,
    c.source_title,
    c.source_locator,
    c.available_cycle_variants,
    c.double_periods_required,
    c.double_periods_scheduled,
    c.class_target_periods_per_cycle,
    c.class_capacity_periods_per_cycle,
    c.max_double_periods_per_cycle,
    c.pre_generation_warnings,
    c.demand_status,
    case c.demand_status
      when 'aligned'
        then null
      when 'under_scheduled'
        then format(
          'Scheduled %s of %s school-target periods per cycle.',
          c.scheduled_periods_per_cycle,
          c.school_target_periods_per_cycle
        )
      when 'over_scheduled'
        then format(
          'Scheduled %s periods against a school target of %s.',
          c.scheduled_periods_per_cycle,
          c.school_target_periods_per_cycle
        )
      when 'school_override'
        then case
          when c.official_periods_per_cycle is not null
            then format(
              'School target %s differs from the resolved official allocation of %s.',
              c.school_target_periods_per_cycle,
              c.official_periods_per_cycle
            )
          else 'A school time-allocation override is recorded for this offering.'
        end
      when 'constraint_warning'
        then format(
          'Requires at least %s double period%s per cycle; %s valid double period%s scheduled.',
          c.double_periods_required,
          case when c.double_periods_required=1 then '' else 's' end,
          c.double_periods_scheduled,
          case when c.double_periods_scheduled=1 then '' else 's' end
        )
      when 'cycle_variant_missing'
        then format(
          'No verified official allocation exists for this exact %s-day %s cycle.',
          v_cycle_length,
          v_cycle_kind
        )
      when 'source_conflict'
        then 'Multiple applicable official allocations conflict; governance review is required.'
      else 'No verified official allocation is available for this subject and cycle.'
    end
  from classified c
  order by c.grade_name,c.class_name,c.subject_name,c.subject_offering_id;
end;
$demand_matrix$;

revoke all on function public.get_timetable_curriculum_demand_matrix(
  uuid,integer,date
) from public,anon;
grant execute on function public.get_timetable_curriculum_demand_matrix(
  uuid,integer,date
) to authenticated;

comment on function public.get_timetable_curriculum_demand_matrix(uuid,integer,date) is
'Read-only timetable curriculum demand matrix for authorised timetable leaders. Scheduled periods are derived from active timetable_slots through effective teacher_allocations; official rules resolve only for the exact school cycle. Pre-generation warnings compare class target demand with active cycle capacity and double-period fit. Double periods require adjacent teaching slots in the actual ordered timetable-period structure and are counted as non-overlapping pairs.';
