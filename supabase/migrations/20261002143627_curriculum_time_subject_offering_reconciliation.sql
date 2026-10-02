-- Issue #1005: Curriculum Time Allocation Slice 2 — school offering reconciliation.
-- Official national allocation, school operational target and future timetable counts remain separate.
-- Existing subject_offerings.periods_per_cycle values are preserved and classified only as legacy.

alter table public.subject_offerings
  add column curriculum_time_allocation_id uuid
    references public.curriculum_time_allocations(id) on delete restrict,
  add column allocation_origin text not null default 'legacy',
  add column allocation_override_reason text,
  add column allocation_acknowledged_by_user_id uuid
    references auth.users(id) on delete set null,
  add column allocation_acknowledged_at timestamptz;

alter table public.subject_offerings
  add constraint subject_offerings_allocation_origin_check
  check (
    allocation_origin in (
      'legacy',
      'official_default',
      'school_override',
      'school_configured'
    )
  ),
  add constraint subject_offerings_allocation_override_reason_length_check
  check (
    allocation_override_reason is null
    or char_length(allocation_override_reason)<=1000
  ),
  add constraint subject_offerings_allocation_state_check
  check (
    (
      allocation_origin='legacy'
      and curriculum_time_allocation_id is null
      and allocation_override_reason is null
      and allocation_acknowledged_by_user_id is null
      and allocation_acknowledged_at is null
    )
    or
    (
      allocation_origin='official_default'
      and curriculum_time_allocation_id is not null
      and allocation_override_reason is null
      and allocation_acknowledged_by_user_id is not null
      and allocation_acknowledged_at is not null
    )
    or
    (
      allocation_origin='school_override'
      and curriculum_time_allocation_id is not null
      and nullif(btrim(allocation_override_reason),'') is not null
      and allocation_acknowledged_by_user_id is not null
      and allocation_acknowledged_at is not null
    )
    or
    (
      allocation_origin='school_configured'
      and curriculum_time_allocation_id is null
      and allocation_override_reason is null
      and allocation_acknowledged_by_user_id is not null
      and allocation_acknowledged_at is not null
    )
  );

create index subject_offerings_curriculum_time_allocation_idx
on public.subject_offerings(curriculum_time_allocation_id)
where curriculum_time_allocation_id is not null;

create or replace function app_private.guard_subject_offering_time_allocation_state()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $offering_time_state$
declare
  v_workflow_offering_id text;
  v_official_periods smallint;
begin
  v_workflow_offering_id:=
    current_setting('app.curriculum_time_reconciliation_offering_id',true);

  if tg_op='INSERT' then
    if (
      new.curriculum_time_allocation_id is not null
      or new.allocation_origin<>'legacy'
      or new.allocation_override_reason is not null
      or new.allocation_acknowledged_by_user_id is not null
      or new.allocation_acknowledged_at is not null
    ) and v_workflow_offering_id is distinct from new.id::text then
      raise exception 'Initial subject-offering time allocation state must use the governed reconciliation workflow';
    end if;
  else
    if (
      new.curriculum_time_allocation_id is distinct from old.curriculum_time_allocation_id
      or new.allocation_origin is distinct from old.allocation_origin
      or new.allocation_override_reason is distinct from old.allocation_override_reason
      or new.allocation_acknowledged_by_user_id is distinct from old.allocation_acknowledged_by_user_id
      or new.allocation_acknowledged_at is distinct from old.allocation_acknowledged_at
      or (
        new.periods_per_cycle is distinct from old.periods_per_cycle
        and (
          old.allocation_origin<>'legacy'
          or new.allocation_origin<>'legacy'
          or old.curriculum_time_allocation_id is not null
          or new.curriculum_time_allocation_id is not null
        )
      )
    ) and v_workflow_offering_id is distinct from new.id::text then
      raise exception 'Reconciled subject-offering time allocation state must use the governed workflow';
    end if;
  end if;

  if new.curriculum_time_allocation_id is not null then
    select a.periods_per_cycle
      into v_official_periods
    from public.curriculum_time_allocations a
    where a.id=new.curriculum_time_allocation_id;

    if not found then
      raise exception 'Linked curriculum time allocation was not found';
    end if;

    if new.allocation_origin='official_default'
       and new.periods_per_cycle<>v_official_periods then
      raise exception 'Official-default subject offering must equal the linked official periods per cycle';
    end if;

    if new.allocation_origin='school_override'
       and new.periods_per_cycle=v_official_periods then
      raise exception 'School override must differ from the linked official periods per cycle';
    end if;
  end if;

  return new;
end;
$offering_time_state$;

revoke all on function app_private.guard_subject_offering_time_allocation_state()
from public,anon,authenticated;

create trigger subject_offering_time_allocation_state_guard_trg
before insert or update of
  periods_per_cycle,
  curriculum_time_allocation_id,
  allocation_origin,
  allocation_override_reason,
  allocation_acknowledged_by_user_id,
  allocation_acknowledged_at
on public.subject_offerings
for each row execute function app_private.guard_subject_offering_time_allocation_state();

create or replace function app_private.resolve_optional_curriculum_time_allocation(
  p_curriculum_subject_id uuid,
  p_grade smallint,
  p_academic_year integer,
  p_cycle_kind text,
  p_cycle_length smallint,
  p_curriculum_version_id uuid
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
as $optional_time_resolver$
begin
  if p_curriculum_subject_id is null or p_grade is null then
    return;
  end if;

  return query
  select *
  from public.resolve_curriculum_time_allocation(
    p_curriculum_subject_id,
    null,
    p_grade,
    p_academic_year,
    p_cycle_kind,
    p_cycle_length,
    p_curriculum_version_id
  );
end;
$optional_time_resolver$;

revoke all on function app_private.resolve_optional_curriculum_time_allocation(
  uuid,smallint,integer,text,smallint,uuid
) from public,anon,authenticated;

create or replace function public.preview_subject_offering_time_allocation_reconciliation(
  p_school_id uuid,
  p_academic_year integer
)
returns table(
  subject_offering_id uuid,
  subject_id uuid,
  subject_code text,
  subject_name text,
  grade_id uuid,
  grade_code text,
  academic_year integer,
  school_target_periods_per_cycle smallint,
  allocation_origin text,
  linked_allocation_id uuid,
  allocation_override_reason text,
  curriculum_subject_id uuid,
  curriculum_version_id uuid,
  subject_mapping_state text,
  official_resolution_status text,
  resolved_allocation_id uuid,
  official_periods_per_cycle smallint,
  cycle_kind text,
  cycle_length smallint,
  rule_strength text,
  source_id uuid,
  source_title text,
  source_locator text,
  available_cycle_variants jsonb,
  scheduling_constraints jsonb,
  match_status text,
  suggested_action text
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $offering_time_preview$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_school_id is null or p_academic_year is null then
    raise exception 'School and academic year are required';
  end if;

  if p_academic_year<2000 or p_academic_year>2200 then
    raise exception 'Academic year is invalid';
  end if;

  if not app_private.user_can_manage_school_settings(auth.uid(),p_school_id) then
    raise exception 'Permission denied';
  end if;

  return query
  with offering_base as (
    select
      so.id as subject_offering_id,
      so.subject_id,
      s.subject_code,
      s.display_name as subject_name,
      so.grade_id,
      g.grade_code,
      so.academic_year,
      so.periods_per_cycle as school_target_periods_per_cycle,
      so.allocation_origin,
      so.curriculum_time_allocation_id as linked_allocation_id,
      so.allocation_override_reason,
      so.curriculum_version_id,
      cv.curriculum_subject_id as pinned_curriculum_subject_id,
      substring(g.grade_code from '([0-9]{1,2})')::smallint as grade_number,
      sch.timetable_cycle_mode as school_cycle_kind,
      sch.timetable_cycle_length as school_cycle_length
    from public.subject_offerings so
    join public.subjects s on s.id=so.subject_id
    join public.grades g on g.id=so.grade_id
    join public.schools sch on sch.id=so.school_id
    left join public.curriculum_versions cv on cv.id=so.curriculum_version_id
    where so.school_id=p_school_id
      and so.academic_year=p_academic_year
      and so.status='active'
  ),
  mapped as (
    select
      ob.*,
      case
        when ob.pinned_curriculum_subject_id is not null
          then ob.pinned_curriculum_subject_id
        when mapping_summary.candidate_count=1
          then mapping_summary.curriculum_subject_id
        else null
      end as resolved_curriculum_subject_id,
      case
        when ob.pinned_curriculum_subject_id is not null then 'pinned_version'
        when mapping_summary.candidate_count=1 then 'mapped'
        when mapping_summary.candidate_count=0 then 'none'
        else 'ambiguous'
      end as resolved_subject_mapping_state
    from offering_base ob
    left join lateral (
      select
        count(*)::integer as candidate_count,
        min(candidate.curriculum_subject_id::text)::uuid as curriculum_subject_id
      from (
        select distinct m.curriculum_subject_id
        from public.school_subject_curriculum_mappings m
        where m.school_id=p_school_id
          and m.subject_id=ob.subject_id
          and m.status='verified'
          and lower(btrim(m.grade_code))=lower(btrim(ob.grade_code))
          and m.effective_from_year<=ob.academic_year
          and (m.effective_to_year is null or m.effective_to_year>=ob.academic_year)
      ) candidate
    ) mapping_summary on true
  ),
  resolved as (
    select
      m.*,
      r.resolution_status,
      r.allocation_id as resolved_allocation_id,
      r.periods_per_cycle as official_periods_per_cycle,
      r.cycle_kind,
      r.cycle_length,
      r.rule_strength,
      r.source_id,
      r.source_title,
      r.source_locator,
      r.available_cycle_variants,
      r.scheduling_constraints
    from mapped m
    left join lateral app_private.resolve_optional_curriculum_time_allocation(
      m.resolved_curriculum_subject_id,
      m.grade_number,
      m.academic_year,
      m.school_cycle_kind,
      m.school_cycle_length,
      m.curriculum_version_id
    ) r on true
  ),
  classified as (
    select
      r.*,
      case
        when r.resolved_curriculum_subject_id is null
          or r.grade_number is null
          then 'no_subject_mapping'
        when r.resolution_status='resolved'
          and r.school_target_periods_per_cycle=r.official_periods_per_cycle
          then 'exact_match'
        when r.resolution_status='resolved'
          then 'different_value'
        when r.resolution_status in (
          'source_missing',
          'cycle_variant_missing',
          'source_conflict'
        ) then r.resolution_status
        else 'source_missing'
      end as classified_match_status
    from resolved r
  )
  select
    c.subject_offering_id,
    c.subject_id,
    c.subject_code,
    c.subject_name,
    c.grade_id,
    c.grade_code,
    c.academic_year,
    c.school_target_periods_per_cycle,
    c.allocation_origin,
    c.linked_allocation_id,
    c.allocation_override_reason,
    c.resolved_curriculum_subject_id,
    c.curriculum_version_id,
    c.resolved_subject_mapping_state,
    c.resolution_status,
    c.resolved_allocation_id,
    c.official_periods_per_cycle,
    c.cycle_kind,
    c.cycle_length,
    c.rule_strength,
    c.source_id,
    c.source_title,
    c.source_locator,
    coalesce(c.available_cycle_variants,'[]'::jsonb),
    coalesce(c.scheduling_constraints,'[]'::jsonb),
    c.classified_match_status,
    case
      when c.allocation_origin='official_default'
        and c.linked_allocation_id is not distinct from c.resolved_allocation_id
        and c.classified_match_status='exact_match'
        then 'none'
      when c.allocation_origin='school_override'
        and c.linked_allocation_id is not distinct from c.resolved_allocation_id
        and c.classified_match_status='different_value'
        then 'none'
      when c.allocation_origin='school_configured'
        and c.classified_match_status<>'exact_match'
        and c.classified_match_status<>'different_value'
        then 'none'
      when c.classified_match_status='exact_match' then 'confirm_official_default'
      when c.classified_match_status='different_value' then 'record_school_override'
      when c.classified_match_status='no_subject_mapping' then 'review_subject_mapping'
      else 'retain_legacy'
    end
  from classified c
  order by c.grade_code,c.subject_name,c.subject_offering_id;
end;
$offering_time_preview$;

revoke all on function public.preview_subject_offering_time_allocation_reconciliation(uuid,integer)
from public,anon;
grant execute on function public.preview_subject_offering_time_allocation_reconciliation(uuid,integer)
to authenticated;

create or replace function public.reconcile_subject_offering_time_allocation(
  p_subject_offering_id uuid,
  p_action text,
  p_expected_allocation_id uuid default null,
  p_expected_school_target_periods smallint default null,
  p_school_target_periods smallint default null,
  p_override_reason text default null
)
returns table(
  subject_offering_id uuid,
  allocation_origin text,
  curriculum_time_allocation_id uuid,
  periods_per_cycle smallint,
  allocation_override_reason text,
  allocation_acknowledged_by_user_id uuid,
  allocation_acknowledged_at timestamptz
)
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $offering_time_reconcile$
declare
  v_offering public.subject_offerings%rowtype;
  v_grade_code text;
  v_grade_number smallint;
  v_cycle_kind text;
  v_cycle_length smallint;
  v_curriculum_subject_id uuid;
  v_mapping_count integer:=0;
  v_resolution_status text;
  v_resolved_allocation_id uuid;
  v_official_periods smallint;
  v_rule_strength text;
  v_target_periods smallint;
  v_reason text;
  v_desired_origin text;
  v_desired_allocation_id uuid;
  v_event_type text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_subject_offering_id is null then
    raise exception 'Subject offering is required';
  end if;

  if p_action is null
     or p_action not in ('official_default','school_override','school_configured') then
    raise exception 'Unsupported subject-offering allocation action';
  end if;

  select so.*
    into v_offering
  from public.subject_offerings so
  where so.id=p_subject_offering_id
  for update;

  if not found then
    raise exception 'Subject offering not found';
  end if;

  if not app_private.user_can_manage_school_settings(
    auth.uid(),
    v_offering.school_id
  ) then
    raise exception 'Permission denied';
  end if;

  if v_offering.status<>'active' then
    raise exception 'Only active subject offerings may be reconciled';
  end if;

  select
    g.grade_code,
    substring(g.grade_code from '([0-9]{1,2})')::smallint,
    s.timetable_cycle_mode,
    s.timetable_cycle_length
    into
      v_grade_code,
      v_grade_number,
      v_cycle_kind,
      v_cycle_length
  from public.grades g
  join public.schools s on s.id=v_offering.school_id
  where g.id=v_offering.grade_id
    and g.school_id=v_offering.school_id
    and g.academic_year=v_offering.academic_year;

  if not found then
    raise exception 'Subject offering grade and school cycle scope is invalid';
  end if;

  if v_offering.curriculum_version_id is not null then
    select cv.curriculum_subject_id
      into v_curriculum_subject_id
    from public.curriculum_versions cv
    where cv.id=v_offering.curriculum_version_id;
  else
    select
      count(*)::integer,
      min(candidate.curriculum_subject_id::text)::uuid
      into v_mapping_count,v_curriculum_subject_id
    from (
      select distinct m.curriculum_subject_id
      from public.school_subject_curriculum_mappings m
      where m.school_id=v_offering.school_id
        and m.subject_id=v_offering.subject_id
        and m.status='verified'
        and lower(btrim(m.grade_code))=lower(btrim(v_grade_code))
        and m.effective_from_year<=v_offering.academic_year
        and (
          m.effective_to_year is null
          or m.effective_to_year>=v_offering.academic_year
        )
    ) candidate;

    if v_mapping_count<>1 then
      v_curriculum_subject_id:=null;
    end if;
  end if;

  if v_curriculum_subject_id is not null and v_grade_number is not null then
    select
      r.resolution_status,
      r.allocation_id,
      r.periods_per_cycle,
      r.rule_strength
      into
        v_resolution_status,
        v_resolved_allocation_id,
        v_official_periods,
        v_rule_strength
    from public.resolve_curriculum_time_allocation(
      v_curriculum_subject_id,
      null,
      v_grade_number,
      v_offering.academic_year,
      v_cycle_kind,
      v_cycle_length,
      v_offering.curriculum_version_id
    ) r;
  else
    v_resolution_status:='no_subject_mapping';
    v_resolved_allocation_id:=null;
    v_official_periods:=null;
    v_rule_strength:=null;
  end if;

  if p_expected_school_target_periods is null
     or p_expected_school_target_periods<>v_offering.periods_per_cycle then
    raise exception 'Reconciliation preview is stale; school target changed before commit';
  end if;

  v_reason:=nullif(btrim(p_override_reason),'');
  v_target_periods:=coalesce(p_school_target_periods,v_offering.periods_per_cycle);

  if v_target_periods<1 or v_target_periods>30 then
    raise exception 'School target periods per cycle must be between 1 and 30';
  end if;

  if p_action in ('official_default','school_override') then
    if v_resolution_status is distinct from 'resolved'
       or v_resolved_allocation_id is null then
      raise exception 'Official allocation is not uniquely resolved: %',
        coalesce(v_resolution_status,'source_missing');
    end if;

    if p_expected_allocation_id is null
       or p_expected_allocation_id is distinct from v_resolved_allocation_id then
      raise exception 'Reconciliation preview is stale; refresh before committing';
    end if;

    v_desired_allocation_id:=v_resolved_allocation_id;

    if p_action='official_default' then
      if v_reason is not null then
        raise exception 'Override reason is only valid for school_override';
      end if;

      if v_offering.allocation_origin='legacy' then
        if v_offering.periods_per_cycle<>v_official_periods then
          raise exception 'Official-default reconciliation requires the existing school target to already equal the official allocation';
        end if;

        if p_school_target_periods is not null
           and p_school_target_periods<>v_offering.periods_per_cycle then
          raise exception 'Official-default reconciliation does not rewrite the existing legacy school target';
        end if;

        v_target_periods:=v_offering.periods_per_cycle;
      elsif v_target_periods<>v_official_periods then
        raise exception 'Official-default school target must equal the resolved official allocation';
      end if;

      v_desired_origin:='official_default';
      v_reason:=null;
    else
      if v_target_periods=v_official_periods then
        raise exception 'School override must differ from the resolved official allocation';
      end if;

      if v_reason is null then
        raise exception 'School override reason is required';
      end if;

      v_desired_origin:='school_override';
    end if;
  else
    if v_reason is not null then
      raise exception 'Override reason is only valid for school_override';
    end if;

    if p_expected_allocation_id is not null then
      raise exception 'School-configured reconciliation does not accept an official allocation id';
    end if;

    if v_resolution_status='resolved' then
      raise exception 'Applicable official allocation is resolved; use official_default or school_override';
    end if;

    v_desired_allocation_id:=null;
    v_desired_origin:='school_configured';
    v_reason:=null;
  end if;

  if v_offering.curriculum_time_allocation_id
       is not distinct from v_desired_allocation_id
     and v_offering.allocation_origin=v_desired_origin
     and v_offering.periods_per_cycle=v_target_periods
     and nullif(btrim(coalesce(v_offering.allocation_override_reason,'')),'')
       is not distinct from v_reason then
    return query
    select
      v_offering.id,
      v_offering.allocation_origin,
      v_offering.curriculum_time_allocation_id,
      v_offering.periods_per_cycle,
      v_offering.allocation_override_reason,
      v_offering.allocation_acknowledged_by_user_id,
      v_offering.allocation_acknowledged_at;
    return;
  end if;

  perform set_config(
    'app.curriculum_time_reconciliation_offering_id',
    v_offering.id::text,
    true
  );

  update public.subject_offerings so
  set
    curriculum_time_allocation_id=v_desired_allocation_id,
    allocation_origin=v_desired_origin,
    periods_per_cycle=v_target_periods,
    allocation_override_reason=v_reason,
    allocation_acknowledged_by_user_id=auth.uid(),
    allocation_acknowledged_at=now(),
    updated_at=now()
  where so.id=v_offering.id;

  perform set_config(
    'app.curriculum_time_reconciliation_offering_id',
    '',
    true
  );

  v_event_type:=case
    when v_desired_origin='school_override'
      then 'subject_offering_allocation_overridden'
    when v_offering.allocation_origin='legacy'
      and v_desired_allocation_id is not null
      then 'subject_offering_allocation_reconciled'
    when v_offering.curriculum_time_allocation_id
      is distinct from v_desired_allocation_id
      then 'subject_offering_allocation_linked'
    else 'subject_offering_allocation_reconciled'
  end;

  insert into public.audit_events(
    tenant_id,
    school_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  )
  values(
    v_offering.tenant_id,
    v_offering.school_id,
    auth.uid(),
    v_event_type,
    'subject_offering',
    v_offering.id,
    jsonb_strip_nulls(jsonb_build_object(
      'academic_year',v_offering.academic_year,
      'action',p_action,
      'old_origin',v_offering.allocation_origin,
      'new_origin',v_desired_origin,
      'old_allocation_id',v_offering.curriculum_time_allocation_id,
      'new_allocation_id',v_desired_allocation_id,
      'old_periods_per_cycle',v_offering.periods_per_cycle,
      'new_periods_per_cycle',v_target_periods,
      'official_periods_per_cycle',v_official_periods,
      'official_rule_strength',v_rule_strength,
      'old_override_reason',
        nullif(btrim(coalesce(v_offering.allocation_override_reason,'')),''),
      'new_override_reason',v_reason,
      'override_reason_changed',
        nullif(btrim(coalesce(v_offering.allocation_override_reason,'')),'')
          is distinct from v_reason
    ))
  );

  return query
  select
    so.id,
    so.allocation_origin,
    so.curriculum_time_allocation_id,
    so.periods_per_cycle,
    so.allocation_override_reason,
    so.allocation_acknowledged_by_user_id,
    so.allocation_acknowledged_at
  from public.subject_offerings so
  where so.id=v_offering.id;
end;
$offering_time_reconcile$;

revoke all on function public.reconcile_subject_offering_time_allocation(
  uuid,text,uuid,smallint,smallint,text
) from public,anon;
grant execute on function public.reconcile_subject_offering_time_allocation(
  uuid,text,uuid,smallint,smallint,text
) to authenticated;

comment on column public.subject_offerings.curriculum_time_allocation_id is
'Explicit school acknowledgement/link to one historical national curriculum time allocation. Never inferred from display names and never auto-repointed on later policy publication.';
comment on column public.subject_offerings.allocation_origin is
'School target provenance: legacy, official_default, school_override, or school_configured. Existing rows are intentionally legacy.';
comment on column public.subject_offerings.allocation_override_reason is
'Required bounded school reason when the operational periods_per_cycle target intentionally differs from the linked official allocation.';
comment on function public.preview_subject_offering_time_allocation_reconciliation(uuid,integer) is
'School-settings preview of canonical subject mapping, exact-cycle official allocation, existing school target, match status, source provenance and suggested reconciliation action.';
comment on function public.reconcile_subject_offering_time_allocation(uuid,text,uuid,smallint,smallint,text) is
'Explicit idempotent school-settings workflow for linking a legacy offering to the currently resolved official allocation, recording a school override, or recording a school-configured target. It never rewrites a legacy target merely because an official value differs.';
