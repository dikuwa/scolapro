-- Issue #992 / Slice 2: school subject-offering reconciliation with national time allocation.
-- Existing periods_per_cycle values remain unchanged and are classified as legacy until explicitly reconciled.

alter table public.subject_offerings
  add column curriculum_time_allocation_id uuid references public.curriculum_time_allocations(id) on delete restrict,
  add column allocation_origin text not null default 'legacy'
    check (allocation_origin in ('legacy','official_default','school_override','school_configured')),
  add column allocation_override_reason text,
  add column allocation_acknowledged_by_user_id uuid references auth.users(id) on delete set null,
  add column allocation_acknowledged_at timestamptz;

alter table public.subject_offerings
  add constraint subject_offerings_time_ack_pair_check
    check ((allocation_acknowledged_by_user_id is null) = (allocation_acknowledged_at is null)),
  add constraint subject_offerings_time_origin_shape_check
    check (
      (allocation_origin='legacy'
        and curriculum_time_allocation_id is null
        and allocation_override_reason is null
        and allocation_acknowledged_by_user_id is null
        and allocation_acknowledged_at is null)
      or
      (allocation_origin='official_default'
        and curriculum_time_allocation_id is not null
        and allocation_override_reason is null
        and allocation_acknowledged_by_user_id is not null
        and allocation_acknowledged_at is not null)
      or
      (allocation_origin='school_override'
        and curriculum_time_allocation_id is not null
        and btrim(coalesce(allocation_override_reason,''))<>''
        and allocation_acknowledged_by_user_id is not null
        and allocation_acknowledged_at is not null)
      or
      (allocation_origin='school_configured'
        and curriculum_time_allocation_id is null
        and btrim(coalesce(allocation_override_reason,''))<>''
        and allocation_acknowledged_by_user_id is not null
        and allocation_acknowledged_at is not null)
    );

create index subject_offerings_curriculum_time_allocation_idx
on public.subject_offerings(curriculum_time_allocation_id)
where curriculum_time_allocation_id is not null;

comment on column public.subject_offerings.curriculum_time_allocation_id is
'Optional explicit link to the published national curriculum time rule used to explain this school operational target. Existing offerings are not inferred or bulk-linked.';
comment on column public.subject_offerings.allocation_origin is
'Provenance of periods_per_cycle: legacy, official_default, school_override, or school_configured. The school target remains periods_per_cycle.';
comment on column public.subject_offerings.allocation_override_reason is
'Required human rationale when a linked school target differs from the official allocation, or when the school explicitly configures a target while official resolution is unavailable.';
comment on column public.subject_offerings.allocation_acknowledged_by_user_id is
'Authenticated actor who explicitly reconciled or acknowledged the school target; never inferred during migration.';

create or replace function app_private.curriculum_grade_number(p_grade_code text)
returns smallint
language plpgsql
immutable
security invoker
set search_path=pg_catalog
as $grade_number$
declare
  v_code text:=upper(btrim(coalesce(p_grade_code,'')));
  v_value integer;
begin
  if v_code !~ '^G[0-9]{1,2}$' then
    return null;
  end if;

  v_value:=substring(v_code from 2)::integer;
  if v_value<0 or v_value>20 then
    return null;
  end if;
  return v_value::smallint;
end;
$grade_number$;

revoke all on function app_private.curriculum_grade_number(text)
from public,anon,authenticated;

create or replace function app_private.resolve_subject_offering_time_reconciliation(
  p_subject_offering_id uuid
)
returns table(
  school_id uuid,
  academic_year integer,
  grade_code text,
  grade_number smallint,
  curriculum_subject_id uuid,
  curriculum_mapping_count integer,
  cycle_kind text,
  cycle_length smallint,
  resolution_status text,
  resolution_reason text,
  allocation_id uuid,
  official_periods_per_cycle smallint,
  school_periods_per_cycle smallint,
  variance integer,
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
set search_path=pg_catalog,public,app_private
as $offering_time_resolution$
declare
  v_offering public.subject_offerings%rowtype;
  v_grade public.grades%rowtype;
  v_school public.schools%rowtype;
  v_grade_number smallint;
  v_curriculum_subject_id uuid;
  v_mapping_count integer:=0;
  v_resolution record;
begin
  select * into v_offering
  from public.subject_offerings
  where id=p_subject_offering_id;

  if not found then
    raise exception 'Subject offering not found';
  end if;

  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not (
    app_private.has_platform_role(array['platform_admin'])
    or app_private.has_school_role(
      v_offering.school_id,
      array['school_admin','principal','deputy_principal','hod','teacher','class_teacher']
    )
  ) then
    raise exception 'Permission denied';
  end if;

  select g.* into v_grade
  from public.grades g
  where g.id=v_offering.grade_id
    and g.school_id=v_offering.school_id
    and g.academic_year=v_offering.academic_year;

  if not found then
    raise exception 'Subject offering grade scope is invalid';
  end if;

  select s.* into v_school
  from public.schools s
  where s.id=v_offering.school_id
    and s.status='active';

  if not found then
    raise exception 'School not found or inactive';
  end if;

  v_grade_number:=app_private.curriculum_grade_number(v_grade.grade_code);

  select count(distinct m.curriculum_subject_id)::integer
    into v_mapping_count
  from public.school_subject_curriculum_mappings m
  where m.school_id=v_offering.school_id
    and m.subject_id=v_offering.subject_id
    and m.status='verified'
    and upper(btrim(m.grade_code))=upper(btrim(v_grade.grade_code))
    and m.effective_from_year<=v_offering.academic_year
    and (m.effective_to_year is null or m.effective_to_year>=v_offering.academic_year);

  if v_mapping_count=1 then
    select m.curriculum_subject_id
      into v_curriculum_subject_id
    from public.school_subject_curriculum_mappings m
    where m.school_id=v_offering.school_id
      and m.subject_id=v_offering.subject_id
      and m.status='verified'
      and upper(btrim(m.grade_code))=upper(btrim(v_grade.grade_code))
      and m.effective_from_year<=v_offering.academic_year
      and (m.effective_to_year is null or m.effective_to_year>=v_offering.academic_year)
    order by m.id
    limit 1;
  end if;

  if v_grade_number is null then
    return query select
      v_offering.school_id,
      v_offering.academic_year,
      v_grade.grade_code,
      null::smallint,
      null::uuid,
      v_mapping_count,
      v_school.timetable_cycle_mode,
      v_school.timetable_cycle_length,
      'source_missing'::text,
      'Grade code is not mapped to a supported national grade number'::text,
      null::uuid,
      null::smallint,
      v_offering.periods_per_cycle,
      null::integer,
      null::text,
      null::uuid,
      null::text,
      null::text,
      '[]'::jsonb,
      '{}'::uuid[],
      '[]'::jsonb;
    return;
  end if;

  if v_mapping_count=0 then
    return query select
      v_offering.school_id,
      v_offering.academic_year,
      v_grade.grade_code,
      v_grade_number,
      null::uuid,
      0,
      v_school.timetable_cycle_mode,
      v_school.timetable_cycle_length,
      'source_missing'::text,
      'No verified canonical curriculum-subject mapping exists for this school offering'::text,
      null::uuid,
      null::smallint,
      v_offering.periods_per_cycle,
      null::integer,
      null::text,
      null::uuid,
      null::text,
      null::text,
      '[]'::jsonb,
      '{}'::uuid[],
      '[]'::jsonb;
    return;
  elsif v_mapping_count>1 then
    return query select
      v_offering.school_id,
      v_offering.academic_year,
      v_grade.grade_code,
      v_grade_number,
      null::uuid,
      v_mapping_count,
      v_school.timetable_cycle_mode,
      v_school.timetable_cycle_length,
      'source_conflict'::text,
      'Multiple verified canonical curriculum-subject mappings overlap this school offering'::text,
      null::uuid,
      null::smallint,
      v_offering.periods_per_cycle,
      null::integer,
      null::text,
      null::uuid,
      null::text,
      null::text,
      '[]'::jsonb,
      '{}'::uuid[],
      '[]'::jsonb;
    return;
  end if;

  select * into v_resolution
  from public.resolve_curriculum_time_allocation(
    v_curriculum_subject_id,
    null,
    v_grade_number,
    v_offering.academic_year,
    v_school.timetable_cycle_mode,
    v_school.timetable_cycle_length,
    v_offering.curriculum_version_id
  );

  return query select
    v_offering.school_id,
    v_offering.academic_year,
    v_grade.grade_code,
    v_grade_number,
    v_curriculum_subject_id,
    v_mapping_count,
    v_school.timetable_cycle_mode,
    v_school.timetable_cycle_length,
    v_resolution.resolution_status,
    case v_resolution.resolution_status
      when 'resolved' then 'One exact-cycle published national allocation resolved'
      when 'cycle_variant_missing' then 'No verified allocation variant exists for this school timetable cycle'
      when 'source_conflict' then 'Multiple applicable published allocation rules remain unresolved'
      else 'No published national allocation resolves for this school offering'
    end,
    v_resolution.allocation_id,
    v_resolution.periods_per_cycle,
    v_offering.periods_per_cycle,
    case
      when v_resolution.resolution_status='resolved'
      then v_offering.periods_per_cycle::integer-v_resolution.periods_per_cycle::integer
      else null
    end,
    v_resolution.rule_strength,
    v_resolution.source_id,
    v_resolution.source_title,
    v_resolution.source_locator,
    v_resolution.available_cycle_variants,
    v_resolution.conflicting_allocation_ids,
    v_resolution.scheduling_constraints;
end;
$offering_time_resolution$;

revoke all on function app_private.resolve_subject_offering_time_reconciliation(uuid)
from public,anon,authenticated;

create or replace function public.preview_subject_offering_curriculum_time(
  p_subject_offering_id uuid
)
returns table(
  school_id uuid,
  academic_year integer,
  grade_code text,
  grade_number smallint,
  curriculum_subject_id uuid,
  curriculum_mapping_count integer,
  cycle_kind text,
  cycle_length smallint,
  resolution_status text,
  resolution_reason text,
  allocation_id uuid,
  official_periods_per_cycle smallint,
  school_periods_per_cycle smallint,
  variance integer,
  rule_strength text,
  source_id uuid,
  source_title text,
  source_locator text,
  available_cycle_variants jsonb,
  conflicting_allocation_ids uuid[],
  scheduling_constraints jsonb
)
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $preview$
  select *
  from app_private.resolve_subject_offering_time_reconciliation(p_subject_offering_id);
$preview$;

revoke all on function public.preview_subject_offering_curriculum_time(uuid)
from public,anon;
grant execute on function public.preview_subject_offering_curriculum_time(uuid)
to authenticated;

create or replace function app_private.guard_subject_offering_curriculum_time_provenance()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $offering_time_guard$
declare
  v_context_offering_id text;
  v_allocation public.curriculum_time_allocations%rowtype;
begin
  if tg_op='INSERT' then
    if new.allocation_origin<>'legacy'
       or new.curriculum_time_allocation_id is not null
       or new.allocation_override_reason is not null
       or new.allocation_acknowledged_by_user_id is not null
       or new.allocation_acknowledged_at is not null then
      raise exception 'New subject offerings must begin with legacy curriculum time provenance and use governed reconciliation afterwards';
    end if;
    return new;
  end if;

  if new.curriculum_time_allocation_id is not distinct from old.curriculum_time_allocation_id
     and new.allocation_origin is not distinct from old.allocation_origin
     and new.allocation_override_reason is not distinct from old.allocation_override_reason
     and new.allocation_acknowledged_by_user_id is not distinct from old.allocation_acknowledged_by_user_id
     and new.allocation_acknowledged_at is not distinct from old.allocation_acknowledged_at then
    if new.periods_per_cycle is distinct from old.periods_per_cycle
       and old.allocation_origin<>'legacy' then
      raise exception 'Reconciled curriculum time targets must use the governed school-target workflow';
    end if;
    return new;
  end if;

  v_context_offering_id:=current_setting('app.curriculum_time_reconciliation_offering_id',true);
  if v_context_offering_id is distinct from new.id::text then
    raise exception 'Curriculum time provenance must use the governed reconciliation workflow';
  end if;

  if new.allocation_origin='legacy' then
    if new.curriculum_time_allocation_id is not null
       or new.allocation_override_reason is not null
       or new.allocation_acknowledged_by_user_id is not null
       or new.allocation_acknowledged_at is not null then
      raise exception 'Legacy curriculum time provenance cannot carry official linkage or acknowledgement';
    end if;
    return new;
  end if;

  if new.allocation_acknowledged_by_user_id is distinct from auth.uid()
     or new.allocation_acknowledged_at is null then
    raise exception 'Curriculum time acknowledgement must preserve the authenticated actor and timestamp';
  end if;

  if new.allocation_origin='school_configured' then
    if new.curriculum_time_allocation_id is not null then
      raise exception 'School-configured curriculum time targets cannot carry an official allocation link';
    end if;
    if btrim(coalesce(new.allocation_override_reason,''))='' then
      raise exception 'School-configured curriculum time targets require an acknowledgement reason';
    end if;
    return new;
  end if;

  select * into v_allocation
  from public.curriculum_time_allocations
  where id=new.curriculum_time_allocation_id
    and status in ('published','superseded');

  if not found then
    raise exception 'Linked curriculum time allocation is not a published historical rule';
  end if;

  if new.allocation_origin='official_default' then
    if new.periods_per_cycle<>v_allocation.periods_per_cycle then
      raise exception 'Official-default school target must equal the linked official allocation';
    end if;
    if new.allocation_override_reason is not null then
      raise exception 'Official-default school target cannot carry an override reason';
    end if;
  elsif new.allocation_origin='school_override' then
    if new.periods_per_cycle=v_allocation.periods_per_cycle then
      raise exception 'School override requires a school target that differs from the linked official allocation';
    end if;
    if btrim(coalesce(new.allocation_override_reason,''))='' then
      raise exception 'School override requires a reason';
    end if;
  end if;

  return new;
end;
$offering_time_guard$;

revoke all on function app_private.guard_subject_offering_curriculum_time_provenance()
from public,anon,authenticated;

create trigger subject_offering_curriculum_time_provenance_guard_trg
before insert or update of curriculum_time_allocation_id,allocation_origin,allocation_override_reason,
  allocation_acknowledged_by_user_id,allocation_acknowledged_at,periods_per_cycle
on public.subject_offerings
for each row execute function app_private.guard_subject_offering_curriculum_time_provenance();

create or replace function public.reconcile_subject_offering_curriculum_time(
  p_subject_offering_id uuid,
  p_override_reason text default null
)
returns table(
  allocation_origin text,
  curriculum_time_allocation_id uuid,
  school_periods_per_cycle smallint,
  official_periods_per_cycle smallint,
  variance integer
)
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $reconcile$
declare
  v_offering public.subject_offerings%rowtype;
  v_resolution record;
  v_origin text;
  v_reason text:=nullif(btrim(coalesce(p_override_reason,'')),'');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_offering
  from public.subject_offerings
  where id=p_subject_offering_id
  for update;

  if not found then
    raise exception 'Subject offering not found';
  end if;

  if not (
    app_private.has_platform_role(array['platform_admin'])
    or app_private.has_school_role(
      v_offering.school_id,
      array['school_admin','principal','deputy_principal','hod']
    )
  ) then
    raise exception 'Permission denied';
  end if;

  select * into v_resolution
  from app_private.resolve_subject_offering_time_reconciliation(v_offering.id);

  if v_resolution.resolution_status<>'resolved'
     or v_resolution.allocation_id is null then
    raise exception 'Subject offering does not have one exact resolved official curriculum time allocation: %',
      v_resolution.resolution_status;
  end if;

  if v_offering.periods_per_cycle=v_resolution.official_periods_per_cycle then
    v_origin:='official_default';
    v_reason:=null;
  else
    v_origin:='school_override';
    if v_reason is null then
      raise exception 'A reason is required when the school target differs from the official allocation';
    end if;
  end if;

  perform set_config('app.curriculum_time_reconciliation_offering_id',v_offering.id::text,true);

  update public.subject_offerings
  set curriculum_time_allocation_id=v_resolution.allocation_id,
      allocation_origin=v_origin,
      allocation_override_reason=v_reason,
      allocation_acknowledged_by_user_id=auth.uid(),
      allocation_acknowledged_at=now(),
      updated_at=now()
  where id=v_offering.id;

  perform set_config('app.curriculum_time_reconciliation_offering_id','',true);

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  )
  values(
    v_offering.tenant_id,
    v_offering.school_id,
    auth.uid(),
    'curriculum.subject_offering_time_reconciled',
    'subject_offering',
    v_offering.id,
    jsonb_build_object(
      'academic_year',v_offering.academic_year,
      'previous_allocation_origin',v_offering.allocation_origin,
      'previous_curriculum_time_allocation_id',v_offering.curriculum_time_allocation_id,
      'allocation_origin',v_origin,
      'curriculum_time_allocation_id',v_resolution.allocation_id,
      'school_periods_per_cycle',v_offering.periods_per_cycle,
      'official_periods_per_cycle',v_resolution.official_periods_per_cycle,
      'variance',v_offering.periods_per_cycle-v_resolution.official_periods_per_cycle,
      'rule_strength',v_resolution.rule_strength,
      'override_reason',v_reason
    )
  );

  return query
  select
    v_origin,
    v_resolution.allocation_id,
    v_offering.periods_per_cycle,
    v_resolution.official_periods_per_cycle,
    (v_offering.periods_per_cycle-v_resolution.official_periods_per_cycle)::integer;
end;
$reconcile$;

revoke all on function public.reconcile_subject_offering_curriculum_time(uuid,text)
from public,anon;
grant execute on function public.reconcile_subject_offering_curriculum_time(uuid,text)
to authenticated;

create or replace function public.acknowledge_subject_offering_school_time_target(
  p_subject_offering_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $acknowledge$
declare
  v_offering public.subject_offerings%rowtype;
  v_resolution record;
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if v_reason is null then
    raise exception 'A reason is required for a school-configured curriculum time target';
  end if;

  select * into v_offering
  from public.subject_offerings
  where id=p_subject_offering_id
  for update;

  if not found then
    raise exception 'Subject offering not found';
  end if;

  if not (
    app_private.has_platform_role(array['platform_admin'])
    or app_private.has_school_role(
      v_offering.school_id,
      array['school_admin','principal','deputy_principal','hod']
    )
  ) then
    raise exception 'Permission denied';
  end if;

  select * into v_resolution
  from app_private.resolve_subject_offering_time_reconciliation(v_offering.id);

  if v_resolution.resolution_status='resolved' then
    raise exception 'A resolved official allocation must use the governed reconciliation workflow';
  end if;

  perform set_config('app.curriculum_time_reconciliation_offering_id',v_offering.id::text,true);

  update public.subject_offerings
  set curriculum_time_allocation_id=null,
      allocation_origin='school_configured',
      allocation_override_reason=v_reason,
      allocation_acknowledged_by_user_id=auth.uid(),
      allocation_acknowledged_at=now(),
      updated_at=now()
  where id=v_offering.id;

  perform set_config('app.curriculum_time_reconciliation_offering_id','',true);

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  )
  values(
    v_offering.tenant_id,
    v_offering.school_id,
    auth.uid(),
    'curriculum.subject_offering_time_school_configured',
    'subject_offering',
    v_offering.id,
    jsonb_build_object(
      'academic_year',v_offering.academic_year,
      'previous_allocation_origin',v_offering.allocation_origin,
      'previous_curriculum_time_allocation_id',v_offering.curriculum_time_allocation_id,
      'school_periods_per_cycle',v_offering.periods_per_cycle,
      'resolution_status',v_resolution.resolution_status,
      'resolution_reason',v_resolution.resolution_reason,
      'acknowledgement_reason',v_reason
    )
  );
end;
$acknowledge$;

revoke all on function public.acknowledge_subject_offering_school_time_target(uuid,text)
from public,anon;
grant execute on function public.acknowledge_subject_offering_school_time_target(uuid,text)
to authenticated;

create or replace function public.update_subject_offering_school_time_target(
  p_subject_offering_id uuid,
  p_periods_per_cycle smallint,
  p_reason text default null
)
returns table(
  allocation_origin text,
  curriculum_time_allocation_id uuid,
  school_periods_per_cycle smallint,
  official_periods_per_cycle smallint,
  variance integer
)
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $update_target$
declare
  v_offering public.subject_offerings%rowtype;
  v_allocation public.curriculum_time_allocations%rowtype;
  v_origin text;
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  v_official smallint;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_periods_per_cycle is null or p_periods_per_cycle<1 or p_periods_per_cycle>30 then
    raise exception 'School periods per cycle must be between 1 and 30';
  end if;

  select * into v_offering
  from public.subject_offerings
  where id=p_subject_offering_id
  for update;

  if not found then
    raise exception 'Subject offering not found';
  end if;

  if not (
    app_private.has_platform_role(array['platform_admin'])
    or app_private.has_school_role(
      v_offering.school_id,
      array['school_admin','principal','deputy_principal','hod']
    )
  ) then
    raise exception 'Permission denied';
  end if;

  if v_offering.curriculum_time_allocation_id is not null then
    select * into v_allocation
    from public.curriculum_time_allocations
    where id=v_offering.curriculum_time_allocation_id
      and status in ('published','superseded');

    if not found then
      raise exception 'Linked curriculum time allocation is not a published historical rule';
    end if;

    v_official:=v_allocation.periods_per_cycle;
    if p_periods_per_cycle=v_official then
      v_origin:='official_default';
      v_reason:=null;
    else
      v_origin:='school_override';
      if v_reason is null then
        raise exception 'A reason is required when the school target differs from the official allocation';
      end if;
    end if;
  else
    v_origin:='school_configured';
    if v_reason is null then
      raise exception 'A reason is required for a school-configured curriculum time target';
    end if;
  end if;

  perform set_config('app.curriculum_time_reconciliation_offering_id',v_offering.id::text,true);

  update public.subject_offerings
  set periods_per_cycle=p_periods_per_cycle,
      allocation_origin=v_origin,
      allocation_override_reason=v_reason,
      allocation_acknowledged_by_user_id=auth.uid(),
      allocation_acknowledged_at=now(),
      updated_at=now()
  where id=v_offering.id;

  perform set_config('app.curriculum_time_reconciliation_offering_id','',true);

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_offering.tenant_id,
    v_offering.school_id,
    auth.uid(),
    'curriculum.subject_offering_time_target_updated',
    'subject_offering',
    v_offering.id,
    jsonb_build_object(
      'academic_year',v_offering.academic_year,
      'previous_periods_per_cycle',v_offering.periods_per_cycle,
      'periods_per_cycle',p_periods_per_cycle,
      'allocation_origin',v_origin,
      'curriculum_time_allocation_id',v_offering.curriculum_time_allocation_id,
      'official_periods_per_cycle',v_official,
      'variance',case when v_official is null then null else p_periods_per_cycle-v_official end,
      'reason',v_reason
    )
  );

  return query select
    v_origin,
    v_offering.curriculum_time_allocation_id,
    p_periods_per_cycle,
    v_official,
    case when v_official is null then null else (p_periods_per_cycle-v_official)::integer end;
end;
$update_target$;

revoke all on function public.update_subject_offering_school_time_target(uuid,smallint,text)
from public,anon;
grant execute on function public.update_subject_offering_school_time_target(uuid,smallint,text)
to authenticated;

comment on function public.preview_subject_offering_curriculum_time(uuid) is
'Read-only exact-cycle reconciliation preview. Resolves the school offering through verified canonical curriculum identity and never alters periods_per_cycle.';
comment on function public.reconcile_subject_offering_curriculum_time(uuid,text) is
'Links one school subject offering to one resolved published national allocation. It preserves periods_per_cycle as the school target and requires a reason for variance.';
comment on function public.acknowledge_subject_offering_school_time_target(uuid,text) is
'Explicitly records a school-configured target only when official allocation resolution is unavailable or conflicting. It never changes periods_per_cycle.';
comment on function public.update_subject_offering_school_time_target(uuid,smallint,text) is
'Governed school-target edit. A linked official rule is preserved; target variance becomes school_override and requires a reason. Unlinked targets become school_configured.';
