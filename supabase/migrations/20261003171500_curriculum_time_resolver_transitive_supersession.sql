-- Issue #1012 post-merge resolver remediation.
-- Governance already accepts direct/transitive profile supersession. Keep the
-- canonical resolver aligned so a terminal descendant suppresses every active
-- predecessor in its supersession chain for the requested year.

create or replace function public.resolve_curriculum_time_allocation(
  p_curriculum_subject_id uuid,
  p_allocation_key text,
  p_grade smallint,
  p_academic_year integer,
  p_cycle_kind text,
  p_cycle_length smallint,
  p_curriculum_version_id uuid default null
)
returns table(
  resolution_status text,
  allocation_id uuid,
  profile_id uuid,
  target_kind text,
  display_label text,
  periods_per_cycle smallint,
  cycle_kind text,
  cycle_length smallint,
  period_minutes smallint,
  rule_strength text,
  source_id uuid,
  source_title text,
  source_locator text,
  available_cycle_variants jsonb,
  conflicting_allocation_ids uuid[],
  scheduling_constraints jsonb
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $resolve_time$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if (p_curriculum_subject_id is null) = (p_allocation_key is null) then
    raise exception 'Resolve by exactly one curriculum subject or allocation key';
  end if;

  if p_grade is null or p_grade<0 or p_grade>20 then
    raise exception 'Grade must be between 0 and 20';
  end if;

  if p_academic_year is null or p_academic_year<1900 or p_academic_year>2200 then
    raise exception 'Academic year is invalid';
  end if;

  if p_cycle_kind not in ('weekday','rotating','fixed_cycle') then
    raise exception 'Unsupported curriculum time cycle kind';
  end if;

  if p_cycle_length is null or p_cycle_length<1 or p_cycle_length>31 then
    raise exception 'Curriculum time cycle length is invalid';
  end if;

  return query
  with base_candidates as (
    select
      a.*,
      p.source_id as resolved_source_id,
      p.phase_code as resolved_phase_code,
      p.cycle_kind as resolved_cycle_kind,
      p.cycle_length as resolved_cycle_length,
      p.period_minutes as resolved_period_minutes,
      p.effective_from_year as profile_effective_from_year,
      p.effective_to_year as profile_effective_to_year,
      s.title as resolved_source_title
    from public.curriculum_time_allocations a
    join public.curriculum_time_profiles p on p.id=a.profile_id
    join public.curriculum_sources s on s.id=p.source_id
    where a.status in ('published','superseded')
      and p.status in ('published','superseded')
      and p.effective_from_year<=p_academic_year
      and (p.effective_to_year is null or p.effective_to_year>=p_academic_year)
      and (a.grade_from is null or a.grade_from<=p_grade)
      and (a.grade_to is null or a.grade_to>=p_grade)
      and (
        (
          p_curriculum_subject_id is not null
          and (
            (a.target_kind='subject' and a.curriculum_subject_id=p_curriculum_subject_id)
            or
            (
              a.target_kind<>'subject'
              and exists(
                select 1
                from public.curriculum_time_slot_subjects ss
                where ss.allocation_id=a.id
                  and ss.curriculum_subject_id=p_curriculum_subject_id
              )
            )
          )
        )
        or
        (
          p_allocation_key is not null
          and a.allocation_key=p_allocation_key
        )
      )
      and (
        (p_curriculum_version_id is null and a.curriculum_version_id is null)
        or
        (
          p_curriculum_version_id is not null
          and (a.curriculum_version_id is null or a.curriculum_version_id=p_curriculum_version_id)
        )
      )
  ),
  active_candidates as (
    select c.*
    from base_candidates c
    where not exists(
      select 1
      from public.curriculum_time_profiles replacement_profile
      where replacement_profile.id<>c.profile_id
        and app_private.curriculum_time_profile_supersedes(
          replacement_profile.id,
          c.profile_id
        )
        and replacement_profile.status in ('published','superseded','withdrawn')
        and replacement_profile.phase_code=c.resolved_phase_code
        and replacement_profile.cycle_kind=c.resolved_cycle_kind
        and replacement_profile.cycle_length=c.resolved_cycle_length
        and replacement_profile.effective_from_year<=p_academic_year
        and (
          replacement_profile.effective_to_year is null
          or replacement_profile.effective_to_year>=p_academic_year
        )
    )
      and not exists(
        select 1
        from public.curriculum_time_allocations replacement
        join public.curriculum_time_profiles replacement_profile
          on replacement_profile.id=replacement.profile_id
        where replacement.supersedes_allocation_id=c.id
          and replacement.id<>c.id
          and replacement.status in ('published','superseded','withdrawn')
          and replacement_profile.status in ('published','superseded','withdrawn')
          and replacement_profile.phase_code=c.resolved_phase_code
          and replacement_profile.cycle_kind=c.resolved_cycle_kind
          and replacement_profile.cycle_length=c.resolved_cycle_length
          and replacement_profile.effective_from_year<=p_academic_year
          and (
            replacement_profile.effective_to_year is null
            or replacement_profile.effective_to_year>=p_academic_year
          )
          and (replacement.grade_from is null or replacement.grade_from<=p_grade)
          and (replacement.grade_to is null or replacement.grade_to>=p_grade)
          and (
            p_curriculum_subject_id is null
            or (
              replacement.target_kind='subject'
              and replacement.curriculum_subject_id=p_curriculum_subject_id
            )
            or (
              replacement.target_kind<>'subject'
              and exists(
                select 1
                from public.curriculum_time_slot_subjects replacement_slot_subject
                where replacement_slot_subject.allocation_id=replacement.id
                  and replacement_slot_subject.curriculum_subject_id=p_curriculum_subject_id
              )
            )
          )
          and (
            (p_curriculum_version_id is null and replacement.curriculum_version_id is null)
            or
            (
              p_curriculum_version_id is not null
              and (
                replacement.curriculum_version_id is null
                or replacement.curriculum_version_id=p_curriculum_version_id
              )
            )
          )
      )
  ),
  variant_rows as (
    select distinct resolved_cycle_kind,resolved_cycle_length
    from active_candidates
  ),
  variants as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'cycleKind',resolved_cycle_kind,
          'cycleLength',resolved_cycle_length
        )
        order by resolved_cycle_kind,resolved_cycle_length
      ),
      '[]'::jsonb
    ) as value
    from variant_rows
  ),
  exact_candidates as (
    select *
    from active_candidates
    where resolved_cycle_kind=p_cycle_kind
      and resolved_cycle_length=p_cycle_length
  ),
  candidate_summary as (
    select
      count(*)::integer as exact_count,
      array_agg(id order by id) as exact_ids
    from exact_candidates
  ),
  selected as (
    select *
    from exact_candidates
    where (select exact_count from candidate_summary)=1
    limit 1
  ),
  constraint_base as (
    select c.*
    from public.curriculum_scheduling_constraints c
    left join selected sel on true
    where sel.id is not null
      and c.status in ('published','superseded')
      and c.effective_from_year<=p_academic_year
      and (c.effective_to_year is null or c.effective_to_year>=p_academic_year)
      and (c.grade_from is null or c.grade_from<=p_grade)
      and (c.grade_to is null or c.grade_to>=p_grade)
      and c.cycle_kind=p_cycle_kind
      and c.cycle_length=p_cycle_length
      and (
        (
          c.allocation_id=sel.id
          and (
            (p_curriculum_version_id is null and c.curriculum_version_id is null)
            or
            (
              p_curriculum_version_id is not null
              and (c.curriculum_version_id is null or c.curriculum_version_id=p_curriculum_version_id)
            )
          )
        )
        or
        (
          c.allocation_id is null
          and p_curriculum_subject_id is not null
          and c.curriculum_subject_id=p_curriculum_subject_id
          and (
            (p_curriculum_version_id is null and c.curriculum_version_id is null)
            or
            (
              p_curriculum_version_id is not null
              and (c.curriculum_version_id is null or c.curriculum_version_id=p_curriculum_version_id)
            )
          )
        )
      )
  ),
  active_constraints as (
    select c.*
    from constraint_base c
    where not exists(
      select 1
      from public.curriculum_scheduling_constraints replacement
      where replacement.supersedes_constraint_id=c.id
        and replacement.id<>c.id
        and replacement.status in ('published','superseded','withdrawn')
        and replacement.effective_from_year<=p_academic_year
        and (replacement.effective_to_year is null or replacement.effective_to_year>=p_academic_year)
        and (replacement.grade_from is null or replacement.grade_from<=p_grade)
        and (replacement.grade_to is null or replacement.grade_to>=p_grade)
        and replacement.cycle_kind=p_cycle_kind
        and replacement.cycle_length=p_cycle_length
        and replacement.allocation_id is not distinct from c.allocation_id
        and replacement.curriculum_subject_id is not distinct from c.curriculum_subject_id
        and replacement.curriculum_version_id is not distinct from c.curriculum_version_id
    )
  ),
  constraint_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',ac.id,
          'constraintKey',ac.constraint_key,
          'constraintType',ac.constraint_type,
          'cycleKind',ac.cycle_kind,
          'cycleLength',ac.cycle_length,
          'ruleStrength',ac.rule_strength,
          'numericValue',ac.numeric_value,
          'value',ac.value,
          'sourceId',ac.source_id,
          'sourceLocator',ac.source_locator
        )
        order by ac.constraint_key,ac.id
      ),
      '[]'::jsonb
    ) as value
    from active_constraints ac
  )
  select
    case
      when (select count(*) from active_candidates)=0 then 'source_missing'
      when (select exact_count from candidate_summary)=0 then 'cycle_variant_missing'
      when (select exact_count from candidate_summary)>1 then 'source_conflict'
      else 'resolved'
    end as resolution_status,
    case when (select exact_count from candidate_summary)=1 then sel.id else null end,
    case when (select exact_count from candidate_summary)=1 then sel.profile_id else null end,
    case when (select exact_count from candidate_summary)=1 then sel.target_kind else null end,
    case when (select exact_count from candidate_summary)=1 then sel.display_label else null end,
    case when (select exact_count from candidate_summary)=1 then sel.periods_per_cycle else null end,
    case when (select exact_count from candidate_summary)=1 then sel.resolved_cycle_kind else null end,
    case when (select exact_count from candidate_summary)=1 then sel.resolved_cycle_length else null end,
    case when (select exact_count from candidate_summary)=1 then sel.resolved_period_minutes else null end,
    case when (select exact_count from candidate_summary)=1 then sel.rule_strength else null end,
    case when (select exact_count from candidate_summary)=1 then sel.resolved_source_id else null end,
    case when (select exact_count from candidate_summary)=1 then sel.resolved_source_title else null end,
    case when (select exact_count from candidate_summary)=1 then sel.source_locator else null end,
    variants.value,
    case
      when (select exact_count from candidate_summary)>1
      then (select exact_ids from candidate_summary)
      else '{}'::uuid[]
    end,
    case
      when (select exact_count from candidate_summary)=1
      then constraint_json.value
      else '[]'::jsonb
    end
  from variants
  cross join candidate_summary
  left join selected sel on true
  cross join constraint_json;
end;
$resolve_time$;

revoke all on function public.resolve_curriculum_time_allocation(
  uuid,text,smallint,integer,text,smallint,uuid
) from public,anon;
grant execute on function public.resolve_curriculum_time_allocation(
  uuid,text,smallint,integer,text,smallint,uuid
) to authenticated;

comment on function public.resolve_curriculum_time_allocation(
  uuid,text,smallint,integer,text,smallint,uuid
) is
'Canonical exact-cycle national time-allocation resolver. Direct and transitive profile supersession use the same governed closure as publication/conflict checks; returns resolved, source_missing, cycle_variant_missing, or source_conflict and never converts periods between cycle variants.';
