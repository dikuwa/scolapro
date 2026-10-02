-- Issue #1013: post-merge remediation for #992 / PR #1008.
-- Fixes profile-level supersession resolution, constraint supersession cycles,
-- exact cycle-kind scoping, and completeness of minimum-double-period constraints.

alter table public.curriculum_scheduling_constraints
  add column cycle_kind text
    check (cycle_kind is null or cycle_kind in ('weekday','rotating','fixed_cycle'));

-- Existing final rows may legitimately lack exact cycle scope because the Slice-1
-- schema did not require it. The backfill is derived only from the immutable linked
-- allocation/profile, so bypass only the old content-finality trigger for this update.
alter table public.curriculum_scheduling_constraints
  disable trigger curriculum_scheduling_constraint_guard_trg;

update public.curriculum_scheduling_constraints c
set cycle_kind=p.cycle_kind,
    cycle_length=coalesce(c.cycle_length,p.cycle_length)
from public.curriculum_time_allocations a
join public.curriculum_time_profiles p on p.id=a.profile_id
where c.allocation_id=a.id
  and (c.cycle_kind is null or c.cycle_length is null);

alter table public.curriculum_scheduling_constraints
  enable trigger curriculum_scheduling_constraint_guard_trg;

do $preexisting_constraint_scope$
begin
  if exists(
    select 1
    from public.curriculum_scheduling_constraints c
    where c.allocation_id is null
      and c.status<>'draft'
      and (c.cycle_kind is null or c.cycle_length is null)
  ) then
    raise exception 'Existing non-draft subject-level scheduling constraints require explicit exact-cycle reconciliation before this migration';
  end if;
end;
$preexisting_constraint_scope$;

do $preexisting_profile_supersession$
begin
  if exists(
    select 1
    from public.curriculum_time_profiles successor
    join public.curriculum_time_profiles predecessor
      on predecessor.id=successor.supersedes_profile_id
    where successor.supersedes_profile_id is not null
      and (
        successor.phase_code is distinct from predecessor.phase_code
        or successor.cycle_kind is distinct from predecessor.cycle_kind
        or successor.cycle_length is distinct from predecessor.cycle_length
      )
  ) then
    raise exception 'Existing curriculum time profile supersession links require explicit phase and exact-cycle reconciliation before this migration';
  end if;

  if exists(
    with recursive supersession_chain as (
      select
        p.id as start_id,
        p.id,
        p.supersedes_profile_id,
        array[p.id]::uuid[] as path,
        false as cycle_detected
      from public.curriculum_time_profiles p
      where p.supersedes_profile_id is not null

      union all

      select
        chain.start_id,
        predecessor.id,
        predecessor.supersedes_profile_id,
        chain.path || predecessor.id,
        predecessor.id=any(chain.path)
      from supersession_chain chain
      join public.curriculum_time_profiles predecessor
        on predecessor.id=chain.supersedes_profile_id
      where not chain.cycle_detected
    )
    select 1
    from supersession_chain
    where cycle_detected
  ) then
    raise exception 'Existing curriculum time profile supersession chains contain a cycle and require explicit reconciliation before this migration';
  end if;
end;
$preexisting_profile_supersession$;

do $preexisting_allocation_supersession$
begin
  if exists(
    select 1
    from public.curriculum_time_allocations successor
    join public.curriculum_time_allocations predecessor
      on predecessor.id=successor.supersedes_allocation_id
    join public.curriculum_time_profiles successor_profile
      on successor_profile.id=successor.profile_id
    join public.curriculum_time_profiles predecessor_profile
      on predecessor_profile.id=predecessor.profile_id
    where successor.supersedes_allocation_id is not null
      and successor_profile.phase_code is distinct from predecessor_profile.phase_code
  ) then
    raise exception 'Existing curriculum time allocation supersession links require explicit phase reconciliation before this migration';
  end if;
end;
$preexisting_allocation_supersession$;

do $preexisting_constraint_supersession$
begin
  if exists(
    select 1
    from public.curriculum_scheduling_constraints successor
    join public.curriculum_scheduling_constraints predecessor
      on predecessor.id=successor.supersedes_constraint_id
    where successor.supersedes_constraint_id is not null
      and (
        successor.constraint_type is distinct from predecessor.constraint_type
        or successor.allocation_id is distinct from predecessor.allocation_id
        or successor.curriculum_subject_id is distinct from predecessor.curriculum_subject_id
        or successor.curriculum_version_id is distinct from predecessor.curriculum_version_id
        or successor.cycle_kind is distinct from predecessor.cycle_kind
        or successor.cycle_length is distinct from predecessor.cycle_length
      )
  ) then
    raise exception 'Existing curriculum scheduling constraint supersession links require explicit target and exact-cycle reconciliation before this migration';
  end if;

  if exists(
    with recursive supersession_chain as (
      select
        c.id as start_id,
        c.id,
        c.supersedes_constraint_id,
        array[c.id]::uuid[] as path,
        false as cycle_detected
      from public.curriculum_scheduling_constraints c
      where c.supersedes_constraint_id is not null

      union all

      select
        chain.start_id,
        predecessor.id,
        predecessor.supersedes_constraint_id,
        chain.path || predecessor.id,
        predecessor.id=any(chain.path)
      from supersession_chain chain
      join public.curriculum_scheduling_constraints predecessor
        on predecessor.id=chain.supersedes_constraint_id
      where not chain.cycle_detected
    )
    select 1
    from supersession_chain
    where cycle_detected
  ) then
    raise exception 'Existing curriculum scheduling constraint supersession chains contain a cycle and require explicit reconciliation before this migration';
  end if;
end;
$preexisting_constraint_supersession$;

do $preexisting_minimum_double_value$
begin
  if exists(
    select 1
    from public.curriculum_scheduling_constraints c
    where c.constraint_type='min_double_periods_per_cycle'
      and c.status<>'draft'
      and (
        c.numeric_value is null
        or c.numeric_value::text in ('NaN','Infinity','-Infinity')
        or c.numeric_value<1
        or c.numeric_value<>trunc(c.numeric_value)
      )
  ) then
    raise exception 'Existing non-draft minimum-double-period constraints require explicit numeric reconciliation before this migration';
  end if;
end;
$preexisting_minimum_double_value$;

alter table public.curriculum_scheduling_constraints
  add constraint curriculum_scheduling_constraints_numeric_value_integer_check
  check (
    constraint_type<>'min_double_periods_per_cycle'
    or (
      numeric_value is not null
      and numeric_value::text not in ('NaN','Infinity','-Infinity')
      and numeric_value>=1
      and numeric_value=trunc(numeric_value)
    )
  ) not valid;

create index curriculum_scheduling_constraints_exact_cycle_idx
on public.curriculum_scheduling_constraints(
  curriculum_subject_id,
  cycle_kind,
  cycle_length,
  effective_from_year,
  effective_to_year,
  status
);

create or replace function app_private.guard_curriculum_time_profile_supersession()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $profile_supersession_guard$
declare
  v_previous_phase text;
  v_previous_cycle_kind text;
  v_previous_cycle_length smallint;
  v_cycle_detected boolean:=false;
begin
  if exists(
    select 1
    from public.curriculum_time_profiles successor
    where successor.supersedes_profile_id=new.id
      and (
        successor.phase_code is distinct from new.phase_code
        or successor.cycle_kind is distinct from new.cycle_kind
        or successor.cycle_length is distinct from new.cycle_length
      )
  ) then
    raise exception 'Curriculum time profile scope cannot invalidate an existing inbound supersession link';
  end if;

  if exists(
    select 1
    from public.curriculum_time_allocations scoped_allocation
    join public.curriculum_time_allocations linked_allocation
      on (
        linked_allocation.supersedes_allocation_id=scoped_allocation.id
        or scoped_allocation.supersedes_allocation_id=linked_allocation.id
      )
    join public.curriculum_time_profiles linked_profile
      on linked_profile.id=linked_allocation.profile_id
    where scoped_allocation.profile_id=new.id
      and (
        linked_profile.phase_code is distinct from new.phase_code
        or linked_profile.cycle_kind is distinct from new.cycle_kind
        or linked_profile.cycle_length is distinct from new.cycle_length
      )
  ) then
    raise exception 'Curriculum time profile scope cannot invalidate an allocation supersession link';
  end if;

  if new.supersedes_profile_id is null then
    return new;
  end if;

  select phase_code,cycle_kind,cycle_length
    into v_previous_phase,v_previous_cycle_kind,v_previous_cycle_length
  from public.curriculum_time_profiles
  where id=new.supersedes_profile_id;

  if not found then
    raise exception 'Superseded curriculum time profile was not found';
  end if;

  if new.phase_code is distinct from v_previous_phase
     or new.cycle_kind is distinct from v_previous_cycle_kind
     or new.cycle_length is distinct from v_previous_cycle_length then
    raise exception 'Curriculum time profile supersession must remain within the same phase and exact cycle variant';
  end if;

  with recursive predecessor_chain as (
    select
      p.id,
      p.supersedes_profile_id,
      array[p.id]::uuid[] as path
    from public.curriculum_time_profiles p
    where p.id=new.supersedes_profile_id

    union all

    select
      p.id,
      p.supersedes_profile_id,
      chain.path || p.id
    from predecessor_chain chain
    join public.curriculum_time_profiles p
      on p.id=chain.supersedes_profile_id
    where not p.id=any(chain.path)
  )
  select exists(
    select 1
    from predecessor_chain
    where id=new.id
  ) into v_cycle_detected;

  if v_cycle_detected then
    raise exception 'Curriculum time profile supersession chain cannot contain a cycle';
  end if;

  return new;
end;
$profile_supersession_guard$;

revoke all on function app_private.guard_curriculum_time_profile_supersession()
from public,anon,authenticated;

drop trigger if exists aa_curriculum_time_profile_supersession_guard_trg
on public.curriculum_time_profiles;
create trigger aa_curriculum_time_profile_supersession_guard_trg
before insert or update on public.curriculum_time_profiles
for each row execute function app_private.guard_curriculum_time_profile_supersession();

create or replace function app_private.guard_curriculum_time_allocation_supersession()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $allocation_supersession_guard$
declare
  v_new_phase text;
  v_new_cycle_kind text;
  v_new_cycle_length smallint;
  v_previous_phase text;
  v_previous_cycle_kind text;
  v_previous_cycle_length smallint;
  v_cycle_detected boolean:=false;
begin
  select phase_code,cycle_kind,cycle_length
    into v_new_phase,v_new_cycle_kind,v_new_cycle_length
  from public.curriculum_time_profiles
  where id=new.profile_id;

  if not found then
    raise exception 'Curriculum time allocation profile was not found';
  end if;

  if exists(
    select 1
    from public.curriculum_time_allocations successor
    join public.curriculum_time_profiles successor_profile
      on successor_profile.id=successor.profile_id
    where successor.supersedes_allocation_id=new.id
      and (
        successor_profile.phase_code is distinct from v_new_phase
        or successor_profile.cycle_kind is distinct from v_new_cycle_kind
        or successor_profile.cycle_length is distinct from v_new_cycle_length
      )
  ) then
    raise exception 'Curriculum time allocation profile cannot invalidate an existing inbound supersession link';
  end if;

  if new.supersedes_allocation_id is null then
    return new;
  end if;

  select p.phase_code,p.cycle_kind,p.cycle_length
    into v_previous_phase,v_previous_cycle_kind,v_previous_cycle_length
  from public.curriculum_time_allocations a
  join public.curriculum_time_profiles p on p.id=a.profile_id
  where a.id=new.supersedes_allocation_id;

  if v_previous_cycle_kind is null then
    raise exception 'Superseded curriculum time allocation was not found';
  end if;

  if v_new_phase is distinct from v_previous_phase
     or v_new_cycle_kind is distinct from v_previous_cycle_kind
     or v_new_cycle_length is distinct from v_previous_cycle_length then
    raise exception 'Curriculum time allocation supersession must remain within the same phase and exact cycle variant';
  end if;

  with recursive predecessor_chain as (
    select a.id,a.supersedes_allocation_id,array[a.id]::uuid[] as path
    from public.curriculum_time_allocations a
    where a.id=new.supersedes_allocation_id

    union all

    select a.id,a.supersedes_allocation_id,chain.path || a.id
    from predecessor_chain chain
    join public.curriculum_time_allocations a on a.id=chain.supersedes_allocation_id
    where not a.id=any(chain.path)
  )
  select exists(select 1 from predecessor_chain where id=new.id)
    into v_cycle_detected;

  if v_cycle_detected then
    raise exception 'Curriculum time allocation supersession chain cannot contain a cycle';
  end if;

  return new;
end;
$allocation_supersession_guard$;

revoke all on function app_private.guard_curriculum_time_allocation_supersession()
from public,anon,authenticated;

create or replace function app_private.guard_curriculum_scheduling_constraint_cycle_scope()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $constraint_cycle_scope$
declare
  v_allocation public.curriculum_time_allocations%rowtype;
  v_profile public.curriculum_time_profiles%rowtype;
begin
  if new.allocation_id is not null then
    select * into v_allocation
    from public.curriculum_time_allocations
    where id=new.allocation_id;

    if not found then
      raise exception 'Curriculum time allocation not found';
    end if;

    select * into v_profile
    from public.curriculum_time_profiles
    where id=v_allocation.profile_id;

    if not found then
      raise exception 'Curriculum time profile not found';
    end if;

    if new.cycle_kind is null then
      new.cycle_kind:=v_profile.cycle_kind;
    elsif new.cycle_kind<>v_profile.cycle_kind then
      raise exception 'Scheduling constraint cycle kind does not match its linked allocation profile';
    end if;

    if new.cycle_length is null then
      new.cycle_length:=v_profile.cycle_length;
    elsif new.cycle_length<>v_profile.cycle_length then
      raise exception 'Scheduling constraint cycle length does not match its linked allocation profile';
    end if;
  elsif new.status in ('verified','published','superseded','withdrawn') then
    if new.cycle_kind is null or new.cycle_length is null then
      raise exception 'Subject-level scheduling constraints require an exact cycle kind and length before verification';
    end if;
  end if;

  if new.constraint_type='min_double_periods_per_cycle'
     and (
       new.numeric_value is null
       or new.numeric_value::text in ('NaN','Infinity','-Infinity')
       or new.numeric_value<1
       or new.numeric_value<>trunc(new.numeric_value)
     ) then
    raise exception 'Minimum-double-period constraints require a positive integer numeric value';
  end if;

  if tg_op='UPDATE'
     and new.cycle_kind is distinct from old.cycle_kind
     and old.status='verified'
     and new.status<>'draft' then
    raise exception 'Verified curriculum scheduling constraint must return to draft before cycle scope is changed';
  end if;

  if tg_op='UPDATE'
     and old.status in ('published','superseded','withdrawn')
     and new.cycle_kind is distinct from old.cycle_kind then
    raise exception 'Published curriculum scheduling constraint cycle scope is immutable';
  end if;

  return new;
end;
$constraint_cycle_scope$;

revoke all on function app_private.guard_curriculum_scheduling_constraint_cycle_scope()
from public,anon,authenticated;

drop trigger if exists aa_curriculum_constraint_cycle_scope_guard_trg
on public.curriculum_scheduling_constraints;
create trigger aa_curriculum_constraint_cycle_scope_guard_trg
before insert or update on public.curriculum_scheduling_constraints
for each row execute function app_private.guard_curriculum_scheduling_constraint_cycle_scope();

create or replace function app_private.guard_curriculum_scheduling_constraint_supersession()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $constraint_supersession_guard$
declare
  v_previous_type text;
  v_previous_cycle_kind text;
  v_previous_cycle_length smallint;
  v_previous_allocation_id uuid;
  v_previous_subject_id uuid;
  v_previous_version_id uuid;
  v_cycle_detected boolean:=false;
begin
  if exists(
    select 1
    from public.curriculum_scheduling_constraints successor
    where successor.supersedes_constraint_id=new.id
      and (
        successor.constraint_type is distinct from new.constraint_type
        or successor.allocation_id is distinct from new.allocation_id
        or successor.curriculum_subject_id is distinct from new.curriculum_subject_id
        or successor.curriculum_version_id is distinct from new.curriculum_version_id
        or successor.cycle_kind is distinct from new.cycle_kind
        or successor.cycle_length is distinct from new.cycle_length
      )
  ) then
    raise exception 'Curriculum scheduling constraint target cannot invalidate an existing inbound supersession link';
  end if;

  if new.supersedes_constraint_id is null then
    return new;
  end if;

  select
    constraint_type,
    cycle_kind,
    cycle_length,
    allocation_id,
    curriculum_subject_id,
    curriculum_version_id
    into
      v_previous_type,
      v_previous_cycle_kind,
      v_previous_cycle_length,
      v_previous_allocation_id,
      v_previous_subject_id,
      v_previous_version_id
  from public.curriculum_scheduling_constraints
  where id=new.supersedes_constraint_id;

  if not found then
    raise exception 'Superseded curriculum scheduling constraint was not found';
  end if;

  if new.constraint_type is distinct from v_previous_type then
    raise exception 'Curriculum scheduling constraint supersession must preserve the constraint type';
  end if;

  if new.allocation_id is distinct from v_previous_allocation_id
     or new.curriculum_subject_id is distinct from v_previous_subject_id
     or new.curriculum_version_id is distinct from v_previous_version_id then
    raise exception 'Curriculum scheduling constraint supersession must preserve its exact allocation and canonical subject/version target';
  end if;

  if new.cycle_kind is distinct from v_previous_cycle_kind
     or new.cycle_length is distinct from v_previous_cycle_length then
    raise exception 'Curriculum scheduling constraint supersession must remain within the same exact cycle variant';
  end if;

  with recursive predecessor_chain as (
    select
      c.id,
      c.supersedes_constraint_id,
      array[c.id]::uuid[] as path
    from public.curriculum_scheduling_constraints c
    where c.id=new.supersedes_constraint_id

    union all

    select
      c.id,
      c.supersedes_constraint_id,
      chain.path || c.id
    from predecessor_chain chain
    join public.curriculum_scheduling_constraints c
      on c.id=chain.supersedes_constraint_id
    where not c.id=any(chain.path)
  )
  select exists(
    select 1
    from predecessor_chain
    where id=new.id
  ) into v_cycle_detected;

  if v_cycle_detected then
    raise exception 'Curriculum scheduling constraint supersession chain cannot contain a cycle';
  end if;

  return new;
end;
$constraint_supersession_guard$;

revoke all on function app_private.guard_curriculum_scheduling_constraint_supersession()
from public,anon,authenticated;

drop trigger if exists ab_curriculum_constraint_supersession_guard_trg
on public.curriculum_scheduling_constraints;
create trigger ab_curriculum_constraint_supersession_guard_trg
before insert or update on public.curriculum_scheduling_constraints
for each row execute function app_private.guard_curriculum_scheduling_constraint_supersession();

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
      where replacement_profile.supersedes_profile_id=c.profile_id
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

revoke all on function public.resolve_curriculum_time_allocation(uuid,text,smallint,integer,text,smallint,uuid)
from public,anon;
grant execute on function public.resolve_curriculum_time_allocation(uuid,text,smallint,integer,text,smallint,uuid)
to authenticated;

comment on table public.curriculum_time_profiles is
'Source-backed national curriculum timetable contexts. A profile states the exact cycle variant; ScolaPro never mathematically converts it to another cycle.';
comment on table public.curriculum_time_allocations is
'Versioned official periods-per-cycle rules for a canonical curriculum subject or governed choice/support slot. School subject_offerings.periods_per_cycle remains a separate operational target.';
comment on table public.curriculum_time_slot_subjects is
'Source-verified eligible canonical curriculum subjects for a non-subject national allocation slot. Absence of rows means ScolaPro does not infer eligibility.';
comment on table public.curriculum_scheduling_constraints is
'Source-backed national scheduling rules beyond period totals. Initial supported type is min_double_periods_per_cycle only; unknown active types are rejected.';
comment on function public.resolve_curriculum_time_allocation(uuid,text,smallint,integer,text,smallint,uuid) is
'Canonical exact-cycle national time-allocation resolver. Returns resolved, source_missing, cycle_variant_missing, or source_conflict and never converts periods between cycle variants.';
