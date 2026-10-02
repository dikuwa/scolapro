-- Issue #992 / Slice 1: National curriculum time-allocation registry foundation.
-- Source: ScolaPro Implementation Specification — National Curriculum Time Allocation Registry.
-- No official NIED period values are seeded here: publication remains source/checksum/verifier gated.

create table public.curriculum_time_profiles (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.curriculum_sources(id) on delete restrict,
  profile_key text not null,
  title text not null,
  phase_code text,
  cycle_kind text not null check (cycle_kind in ('weekday','rotating','fixed_cycle')),
  cycle_length smallint not null check (cycle_length between 1 and 31),
  period_minutes smallint check (period_minutes is null or period_minutes > 0),
  periods_per_day smallint check (periods_per_day is null or periods_per_day > 0),
  total_periods_per_cycle smallint check (total_periods_per_cycle is null or total_periods_per_cycle > 0),
  effective_from_year integer not null check (effective_from_year between 1900 and 2200),
  effective_to_year integer check (effective_to_year between 1900 and 2200),
  status text not null default 'draft' check (status in ('draft','verified','published','superseded','withdrawn')),
  verified_by_user_id uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  supersedes_profile_id uuid references public.curriculum_time_profiles(id) on delete restrict,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id,profile_key),
  check (btrim(profile_key) <> ''),
  check (btrim(title) <> ''),
  check (effective_to_year is null or effective_to_year >= effective_from_year),
  check (supersedes_profile_id is null or supersedes_profile_id <> id),
  check ((verified_by_user_id is null) = (verified_at is null))
);

create index curriculum_time_profiles_resolution_idx
on public.curriculum_time_profiles(cycle_kind,cycle_length,effective_from_year,effective_to_year,status);

create index curriculum_time_profiles_supersedes_idx
on public.curriculum_time_profiles(supersedes_profile_id)
where supersedes_profile_id is not null;

create table public.curriculum_time_allocations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.curriculum_time_profiles(id) on delete restrict,
  curriculum_subject_id uuid references public.curriculum_subjects(id) on delete restrict,
  curriculum_version_id uuid references public.curriculum_versions(id) on delete restrict,
  allocation_key text not null,
  target_kind text not null check (target_kind in ('subject','choice_slot','support_activity','reading_period')),
  display_label text not null,
  grade_from smallint check (grade_from is null or grade_from between 0 and 20),
  grade_to smallint check (grade_to is null or grade_to between 0 and 20),
  periods_per_cycle smallint not null check (periods_per_cycle > 0),
  percentage_time numeric(6,3) check (percentage_time is null or (percentage_time > 0 and percentage_time <= 100)),
  rule_strength text not null check (rule_strength in ('prescribed','recommended','guidance')),
  source_locator text,
  notes text,
  supersedes_allocation_id uuid references public.curriculum_time_allocations(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','verified','published','superseded','withdrawn')),
  verified_by_user_id uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  conflict_acknowledgement_reason text,
  conflict_acknowledged_by_user_id uuid references auth.users(id) on delete set null,
  conflict_acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile_id,allocation_key),
  check (btrim(allocation_key) <> ''),
  check (btrim(display_label) <> ''),
  check (grade_to is null or grade_from is null or grade_to >= grade_from),
  check (
    (target_kind='subject' and curriculum_subject_id is not null)
    or
    (target_kind<>'subject' and curriculum_subject_id is null)
  ),
  check (curriculum_version_id is null or curriculum_subject_id is not null),
  check (supersedes_allocation_id is null or supersedes_allocation_id <> id),
  check ((verified_by_user_id is null) = (verified_at is null)),
  check ((conflict_acknowledged_by_user_id is null) = (conflict_acknowledged_at is null))
);

create index curriculum_time_allocations_subject_resolution_idx
on public.curriculum_time_allocations(curriculum_subject_id,grade_from,grade_to,status)
where curriculum_subject_id is not null;

create index curriculum_time_allocations_profile_idx
on public.curriculum_time_allocations(profile_id,status);

create index curriculum_time_allocations_supersedes_idx
on public.curriculum_time_allocations(supersedes_allocation_id)
where supersedes_allocation_id is not null;

create table public.curriculum_time_slot_subjects (
  allocation_id uuid not null references public.curriculum_time_allocations(id) on delete restrict,
  curriculum_subject_id uuid not null references public.curriculum_subjects(id) on delete restrict,
  source_locator text not null check (btrim(source_locator) <> ''),
  created_at timestamptz not null default now(),
  primary key(allocation_id,curriculum_subject_id)
);

create index curriculum_time_slot_subjects_subject_idx
on public.curriculum_time_slot_subjects(curriculum_subject_id,allocation_id);

create table public.curriculum_scheduling_constraints (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.curriculum_sources(id) on delete restrict,
  curriculum_subject_id uuid references public.curriculum_subjects(id) on delete restrict,
  curriculum_version_id uuid references public.curriculum_versions(id) on delete restrict,
  allocation_id uuid references public.curriculum_time_allocations(id) on delete restrict,
  constraint_key text not null,
  constraint_type text not null check (constraint_type in ('min_double_periods_per_cycle')),
  grade_from smallint check (grade_from is null or grade_from between 0 and 20),
  grade_to smallint check (grade_to is null or grade_to between 0 and 20),
  cycle_length smallint check (cycle_length is null or cycle_length between 1 and 31),
  rule_strength text not null check (rule_strength in ('prescribed','recommended','guidance')),
  numeric_value numeric check (numeric_value is null or numeric_value > 0),
  value jsonb not null default '{}'::jsonb,
  source_locator text not null check (btrim(source_locator) <> ''),
  effective_from_year integer not null check (effective_from_year between 1900 and 2200),
  effective_to_year integer check (effective_to_year between 1900 and 2200),
  supersedes_constraint_id uuid references public.curriculum_scheduling_constraints(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','verified','published','superseded','withdrawn')),
  verified_by_user_id uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_id,constraint_key,effective_from_year),
  check (btrim(constraint_key) <> ''),
  check (grade_to is null or grade_from is null or grade_to >= grade_from),
  check (effective_to_year is null or effective_to_year >= effective_from_year),
  check (curriculum_version_id is null or curriculum_subject_id is not null),
  check (allocation_id is not null or curriculum_subject_id is not null),
  check (supersedes_constraint_id is null or supersedes_constraint_id <> id),
  check ((verified_by_user_id is null) = (verified_at is null))
);

create index curriculum_scheduling_constraints_resolution_idx
on public.curriculum_scheduling_constraints(curriculum_subject_id,grade_from,grade_to,cycle_length,effective_from_year,effective_to_year,status);

create index curriculum_scheduling_constraints_allocation_idx
on public.curriculum_scheduling_constraints(allocation_id,status)
where allocation_id is not null;

create index curriculum_scheduling_constraints_supersedes_idx
on public.curriculum_scheduling_constraints(supersedes_constraint_id)
where supersedes_constraint_id is not null;

alter table public.curriculum_time_profiles enable row level security;
alter table public.curriculum_time_allocations enable row level security;
alter table public.curriculum_time_slot_subjects enable row level security;
alter table public.curriculum_scheduling_constraints enable row level security;

revoke all on public.curriculum_time_profiles from anon,authenticated;
revoke all on public.curriculum_time_allocations from anon,authenticated;
revoke all on public.curriculum_time_slot_subjects from anon,authenticated;
revoke all on public.curriculum_scheduling_constraints from anon,authenticated;

grant select,insert,update,delete on public.curriculum_time_profiles to authenticated;
grant select,insert,update,delete on public.curriculum_time_allocations to authenticated;
grant select,insert,update,delete on public.curriculum_time_slot_subjects to authenticated;
grant select,insert,update,delete on public.curriculum_scheduling_constraints to authenticated;

create policy "published curriculum time profiles are readable"
on public.curriculum_time_profiles
for select to authenticated
using (
  status in ('published','superseded')
  or app_private.has_platform_role(array['platform_admin'])
);

create policy "platform admins create curriculum time profiles"
on public.curriculum_time_profiles
for insert to authenticated
with check (app_private.has_platform_role(array['platform_admin']));

create policy "platform admins update curriculum time profiles"
on public.curriculum_time_profiles
for update to authenticated
using (app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_platform_role(array['platform_admin']));

create policy "platform admins delete draft curriculum time profiles"
on public.curriculum_time_profiles
for delete to authenticated
using (app_private.has_platform_role(array['platform_admin']) and status='draft');

create policy "published curriculum time allocations are readable"
on public.curriculum_time_allocations
for select to authenticated
using (
  status in ('published','superseded')
  or app_private.has_platform_role(array['platform_admin'])
);

create policy "platform admins create curriculum time allocations"
on public.curriculum_time_allocations
for insert to authenticated
with check (app_private.has_platform_role(array['platform_admin']));

create policy "platform admins update curriculum time allocations"
on public.curriculum_time_allocations
for update to authenticated
using (app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_platform_role(array['platform_admin']));

create policy "platform admins delete draft curriculum time allocations"
on public.curriculum_time_allocations
for delete to authenticated
using (app_private.has_platform_role(array['platform_admin']) and status='draft');

create policy "published curriculum slot subject mappings are readable"
on public.curriculum_time_slot_subjects
for select to authenticated
using (
  exists(
    select 1
    from public.curriculum_time_allocations a
    where a.id=curriculum_time_slot_subjects.allocation_id
      and a.status in ('published','superseded')
  )
  or app_private.has_platform_role(array['platform_admin'])
);

create policy "platform admins create curriculum slot subject mappings"
on public.curriculum_time_slot_subjects
for insert to authenticated
with check (app_private.has_platform_role(array['platform_admin']));

create policy "platform admins update curriculum slot subject mappings"
on public.curriculum_time_slot_subjects
for update to authenticated
using (app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_platform_role(array['platform_admin']));

create policy "platform admins delete curriculum slot subject mappings"
on public.curriculum_time_slot_subjects
for delete to authenticated
using (app_private.has_platform_role(array['platform_admin']));

create policy "published curriculum scheduling constraints are readable"
on public.curriculum_scheduling_constraints
for select to authenticated
using (
  status in ('published','superseded')
  or app_private.has_platform_role(array['platform_admin'])
);

create policy "platform admins create curriculum scheduling constraints"
on public.curriculum_scheduling_constraints
for insert to authenticated
with check (app_private.has_platform_role(array['platform_admin']));

create policy "platform admins update curriculum scheduling constraints"
on public.curriculum_scheduling_constraints
for update to authenticated
using (app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_platform_role(array['platform_admin']));

create policy "platform admins delete draft curriculum scheduling constraints"
on public.curriculum_scheduling_constraints
for delete to authenticated
using (app_private.has_platform_role(array['platform_admin']) and status='draft');

create or replace function app_private.require_verified_curriculum_time_source(p_source_id uuid)
returns void
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $source_guard$
declare
  v_source public.curriculum_sources%rowtype;
begin
  select * into v_source
  from public.curriculum_sources
  where id=p_source_id;

  if not found then
    raise exception 'Curriculum source not found';
  end if;

  if v_source.status <> 'verified'
     or v_source.source_url is null
     or btrim(v_source.source_url)=''
     or v_source.checksum is null
     or btrim(v_source.checksum)=''
     or coalesce(v_source.provenance,'{}'::jsonb)='{}'::jsonb then
    raise exception 'Published curriculum time rules require a verified source with URL, checksum and provenance';
  end if;
end;
$source_guard$;

revoke all on function app_private.require_verified_curriculum_time_source(uuid)
from public,anon,authenticated;

create or replace function app_private.guard_curriculum_time_profile()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $profile_guard$
declare
  v_content_changed boolean:=false;
begin
  if tg_op='DELETE' then
    if old.status<>'draft' then
      raise exception 'Only draft curriculum time profiles may be deleted';
    end if;
    return old;
  end if;

  if tg_op='INSERT' then
    if new.status<>'draft' then
      raise exception 'Curriculum time profiles must begin in draft state';
    end if;
    new.verified_by_user_id:=null;
    new.verified_at:=null;
    new.updated_at:=now();
    return new;
  end if;

  if new.supersedes_profile_id=new.id then
    raise exception 'A curriculum time profile cannot supersede itself';
  end if;

  v_content_changed :=
    new.source_id is distinct from old.source_id
    or new.profile_key is distinct from old.profile_key
    or new.title is distinct from old.title
    or new.phase_code is distinct from old.phase_code
    or new.cycle_kind is distinct from old.cycle_kind
    or new.cycle_length is distinct from old.cycle_length
    or new.period_minutes is distinct from old.period_minutes
    or new.periods_per_day is distinct from old.periods_per_day
    or new.total_periods_per_cycle is distinct from old.total_periods_per_cycle
    or new.effective_from_year is distinct from old.effective_from_year
    or new.effective_to_year is distinct from old.effective_to_year
    or new.supersedes_profile_id is distinct from old.supersedes_profile_id
    or new.provenance is distinct from old.provenance
    or new.created_at is distinct from old.created_at;

  if old.status='verified' and v_content_changed and new.status<>'draft' then
    raise exception 'Verified curriculum time profile must return to draft before content is changed';
  end if;

  if new.status='draft' then
    new.verified_by_user_id:=null;
    new.verified_at:=null;
  elsif new.status='verified' and old.status is distinct from 'verified' then
    if auth.uid() is null then raise exception 'Authentication required'; end if;
    new.verified_by_user_id:=auth.uid();
    new.verified_at:=now();
  end if;

  if (old.status='draft' and new.status not in ('draft','verified'))
     or (old.status='verified' and new.status not in ('draft','verified','published'))
     or (old.status='published' and new.status not in ('published','superseded','withdrawn'))
     or (old.status='superseded' and new.status not in ('superseded','withdrawn'))
     or (old.status='withdrawn' and new.status<>'withdrawn') then
    raise exception 'Curriculum time profile lifecycle transition is not allowed';
  end if;

  if new.status='published' and old.status<>'verified' then
    raise exception 'Curriculum time profile must be verified before publication';
  end if;

  if new.status='published' then
    perform app_private.require_verified_curriculum_time_source(new.source_id);
  end if;

  if old.status in ('published','superseded','withdrawn') then
    if old.status='withdrawn' and new.status<>'withdrawn' then
      raise exception 'Withdrawn curriculum time profiles cannot return to an active lifecycle state';
    end if;
    if old.status='superseded' and new.status not in ('superseded','withdrawn') then
      raise exception 'Superseded curriculum time profiles cannot return to an active lifecycle state';
    end if;
    if old.status='published' and new.status not in ('published','superseded','withdrawn') then
      raise exception 'Published curriculum time profiles cannot return to a mutable lifecycle state';
    end if;
    if v_content_changed
      or new.verified_by_user_id is distinct from old.verified_by_user_id
      or new.verified_at is distinct from old.verified_at then
      raise exception 'Published curriculum time profile content and provenance are immutable';
    end if;
  end if;

  new.updated_at:=now();
  return new;
end;
$profile_guard$;

revoke all on function app_private.guard_curriculum_time_profile()
from public,anon,authenticated;

create trigger curriculum_time_profile_guard_trg
before insert or update or delete on public.curriculum_time_profiles
for each row execute function app_private.guard_curriculum_time_profile();

create or replace function app_private.guard_curriculum_time_allocation()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $allocation_guard$
declare
  v_profile public.curriculum_time_profiles%rowtype;
  v_version_subject_id uuid;
  v_conflict boolean:=false;
  v_content_changed boolean:=false;
begin
  if tg_op='DELETE' then
    if old.status<>'draft' then
      raise exception 'Only draft curriculum time allocations may be deleted';
    end if;
    return old;
  end if;

  if tg_op='INSERT' and new.status<>'draft' then
    raise exception 'Curriculum time allocations must begin in draft state';
  end if;

  select * into v_profile
  from public.curriculum_time_profiles
  where id=new.profile_id;
  if not found then raise exception 'Curriculum time profile not found'; end if;

  if new.curriculum_version_id is not null then
    select curriculum_subject_id into v_version_subject_id
    from public.curriculum_versions
    where id=new.curriculum_version_id;
    if v_version_subject_id is null
       or v_version_subject_id is distinct from new.curriculum_subject_id then
      raise exception 'Curriculum time allocation version does not match its canonical curriculum subject';
    end if;
  end if;

  if new.supersedes_allocation_id is not null then
    if not exists(
      select 1
      from public.curriculum_time_allocations previous
      where previous.id=new.supersedes_allocation_id
        and (
          (new.target_kind='subject' and previous.target_kind='subject' and previous.curriculum_subject_id=new.curriculum_subject_id)
          or
          (new.target_kind<>'subject' and previous.target_kind=new.target_kind and previous.allocation_key=new.allocation_key)
          or
          (
            new.target_kind='subject'
            and previous.target_kind<>'subject'
            and exists(
              select 1
              from public.curriculum_time_slot_subjects slot_subject
              where slot_subject.allocation_id=previous.id
                and slot_subject.curriculum_subject_id=new.curriculum_subject_id
            )
          )
        )
    ) then
      raise exception 'Superseded curriculum time allocation must describe the same canonical target';
    end if;
  end if;

  if tg_op='UPDATE' then
    v_content_changed :=
      new.profile_id is distinct from old.profile_id
      or new.curriculum_subject_id is distinct from old.curriculum_subject_id
      or new.curriculum_version_id is distinct from old.curriculum_version_id
      or new.allocation_key is distinct from old.allocation_key
      or new.target_kind is distinct from old.target_kind
      or new.display_label is distinct from old.display_label
      or new.grade_from is distinct from old.grade_from
      or new.grade_to is distinct from old.grade_to
      or new.periods_per_cycle is distinct from old.periods_per_cycle
      or new.percentage_time is distinct from old.percentage_time
      or new.rule_strength is distinct from old.rule_strength
      or new.source_locator is distinct from old.source_locator
      or new.notes is distinct from old.notes
      or new.supersedes_allocation_id is distinct from old.supersedes_allocation_id
      or new.created_at is distinct from old.created_at;

    if old.status='verified' and v_content_changed and new.status<>'draft' then
      raise exception 'Verified curriculum time allocation must return to draft before content is changed';
    end if;
  end if;

  if new.status='draft' then
    new.verified_by_user_id:=null;
    new.verified_at:=null;
    new.conflict_acknowledged_by_user_id:=null;
    new.conflict_acknowledged_at:=null;
  elsif new.status='verified' and (tg_op='INSERT' or old.status is distinct from 'verified') then
    if auth.uid() is null then raise exception 'Authentication required'; end if;
    new.verified_by_user_id:=auth.uid();
    new.verified_at:=now();
  end if;

  if (old.status='draft' and new.status not in ('draft','verified'))
     or (old.status='verified' and new.status not in ('draft','verified','published'))
     or (old.status='published' and new.status not in ('published','superseded','withdrawn'))
     or (old.status='superseded' and new.status not in ('superseded','withdrawn'))
     or (old.status='withdrawn' and new.status<>'withdrawn') then
    raise exception 'Curriculum time allocation lifecycle transition is not allowed';
  end if;

  if new.status='published' and old.status<>'verified' then
    raise exception 'Curriculum time allocation must be verified before publication';
  end if;

  if new.status='published' then
    if v_profile.status<>'published' then
      raise exception 'Curriculum time allocations can only be published under a published profile';
    end if;
    if new.source_locator is null or btrim(new.source_locator)='' then
      raise exception 'Published curriculum time allocations require a source locator';
    end if;

    select exists(
      select 1
      from public.curriculum_time_allocations other
      join public.curriculum_time_profiles other_profile on other_profile.id=other.profile_id
      where other.id<>new.id
        and other.status='published'
        and other_profile.status='published'
        and other_profile.cycle_kind=v_profile.cycle_kind
        and other_profile.cycle_length=v_profile.cycle_length
        and other_profile.effective_from_year<=coalesce(v_profile.effective_to_year,2200)
        and coalesce(other_profile.effective_to_year,2200)>=v_profile.effective_from_year
        and coalesce(other.grade_from,0)<=coalesce(new.grade_to,20)
        and coalesce(other.grade_to,20)>=coalesce(new.grade_from,0)
        and (
          (new.target_kind='subject' and other.target_kind='subject' and other.curriculum_subject_id=new.curriculum_subject_id)
          or
          (new.target_kind<>'subject' and other.target_kind=new.target_kind and other.allocation_key=new.allocation_key)
        )
        and other.id is distinct from new.supersedes_allocation_id
        and other.supersedes_allocation_id is distinct from new.id
    ) into v_conflict;

    if v_conflict then
      if new.conflict_acknowledgement_reason is null or btrim(new.conflict_acknowledgement_reason)='' then
        raise exception 'Publishing this curriculum time allocation would create an unresolved source conflict';
      end if;
      if auth.uid() is null then raise exception 'Authentication required'; end if;
      new.conflict_acknowledged_by_user_id:=auth.uid();
      new.conflict_acknowledged_at:=now();
    end if;
  end if;

  if tg_op='UPDATE' and old.status in ('published','superseded','withdrawn') then
    if old.status='withdrawn' and new.status<>'withdrawn' then
      raise exception 'Withdrawn curriculum time allocations cannot return to an active lifecycle state';
    end if;
    if old.status='superseded' and new.status not in ('superseded','withdrawn') then
      raise exception 'Superseded curriculum time allocations cannot return to an active lifecycle state';
    end if;
    if old.status='published' and new.status not in ('published','superseded','withdrawn') then
      raise exception 'Published curriculum time allocations cannot return to a mutable lifecycle state';
    end if;
    if v_content_changed
      or new.verified_by_user_id is distinct from old.verified_by_user_id
      or new.verified_at is distinct from old.verified_at
      or new.conflict_acknowledged_by_user_id is distinct from old.conflict_acknowledged_by_user_id
      or new.conflict_acknowledged_at is distinct from old.conflict_acknowledged_at then
      raise exception 'Published curriculum time allocation content and provenance are immutable';
    end if;
  end if;

  new.updated_at:=now();
  return new;
end;
$allocation_guard$;

revoke all on function app_private.guard_curriculum_time_allocation()
from public,anon,authenticated;

create trigger curriculum_time_allocation_guard_trg
before insert or update or delete on public.curriculum_time_allocations
for each row execute function app_private.guard_curriculum_time_allocation();

create or replace function app_private.guard_curriculum_time_slot_subject()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $slot_guard$
declare
  v_old_status text;
  v_new_status text;
  v_new_kind text;
begin
  if tg_op in ('UPDATE','DELETE') then
    select status into v_old_status
    from public.curriculum_time_allocations
    where id=old.allocation_id;
  end if;

  if tg_op in ('INSERT','UPDATE') then
    select status,target_kind into v_new_status,v_new_kind
    from public.curriculum_time_allocations
    where id=new.allocation_id;

    if v_new_status is null then
      raise exception 'Curriculum time allocation not found';
    end if;
    if v_new_kind='subject' then
      raise exception 'Slot-subject eligibility can only be attached to non-subject curriculum allocation slots';
    end if;
  end if;

  if v_old_status in ('published','superseded','withdrawn')
     or v_new_status in ('published','superseded','withdrawn') then
    raise exception 'Published curriculum time slot eligibility is immutable; create a new allocation version';
  end if;

  return case when tg_op='DELETE' then old else new end;
end;
$slot_guard$;

revoke all on function app_private.guard_curriculum_time_slot_subject()
from public,anon,authenticated;

create trigger curriculum_time_slot_subject_guard_trg
before insert or update or delete on public.curriculum_time_slot_subjects
for each row execute function app_private.guard_curriculum_time_slot_subject();

create or replace function app_private.guard_curriculum_scheduling_constraint()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $constraint_guard$
declare
  v_allocation public.curriculum_time_allocations%rowtype;
  v_profile public.curriculum_time_profiles%rowtype;
  v_version_subject_id uuid;
  v_content_changed boolean:=false;
begin
  if tg_op='DELETE' then
    if old.status<>'draft' then
      raise exception 'Only draft curriculum scheduling constraints may be deleted';
    end if;
    return old;
  end if;

  if tg_op='INSERT' and new.status<>'draft' then
    raise exception 'Curriculum scheduling constraints must begin in draft state';
  end if;

  if new.curriculum_version_id is not null then
    select curriculum_subject_id into v_version_subject_id
    from public.curriculum_versions
    where id=new.curriculum_version_id;
    if v_version_subject_id is null
       or (new.curriculum_subject_id is not null and v_version_subject_id is distinct from new.curriculum_subject_id) then
      raise exception 'Scheduling constraint curriculum version does not match its canonical subject';
    end if;
  end if;

  if new.allocation_id is not null then
    select * into v_allocation
    from public.curriculum_time_allocations
    where id=new.allocation_id;
    if not found then raise exception 'Curriculum time allocation not found'; end if;

    select * into v_profile from public.curriculum_time_profiles where id=v_allocation.profile_id;

    if new.curriculum_subject_id is not null
       and v_allocation.curriculum_subject_id is not null
       and new.curriculum_subject_id<>v_allocation.curriculum_subject_id then
      raise exception 'Scheduling constraint curriculum subject does not match its linked allocation';
    end if;
    if new.cycle_length is not null and new.cycle_length<>v_profile.cycle_length then
      raise exception 'Scheduling constraint cycle length does not match its linked allocation profile';
    end if;
    if new.status='published' and v_allocation.status not in ('published','superseded') then
      raise exception 'Scheduling constraints can only be published against a published allocation';
    end if;
  end if;

  if tg_op='UPDATE' then
    v_content_changed :=
      new.source_id is distinct from old.source_id
      or new.curriculum_subject_id is distinct from old.curriculum_subject_id
      or new.curriculum_version_id is distinct from old.curriculum_version_id
      or new.allocation_id is distinct from old.allocation_id
      or new.constraint_key is distinct from old.constraint_key
      or new.constraint_type is distinct from old.constraint_type
      or new.grade_from is distinct from old.grade_from
      or new.grade_to is distinct from old.grade_to
      or new.cycle_length is distinct from old.cycle_length
      or new.rule_strength is distinct from old.rule_strength
      or new.numeric_value is distinct from old.numeric_value
      or new.value is distinct from old.value
      or new.source_locator is distinct from old.source_locator
      or new.effective_from_year is distinct from old.effective_from_year
      or new.effective_to_year is distinct from old.effective_to_year
      or new.supersedes_constraint_id is distinct from old.supersedes_constraint_id
      or new.created_at is distinct from old.created_at;

    if old.status='verified' and v_content_changed and new.status<>'draft' then
      raise exception 'Verified curriculum scheduling constraint must return to draft before content is changed';
    end if;
  end if;

  if new.status='draft' then
    new.verified_by_user_id:=null;
    new.verified_at:=null;
  elsif new.status='verified' and (tg_op='INSERT' or old.status is distinct from 'verified') then
    if auth.uid() is null then raise exception 'Authentication required'; end if;
    new.verified_by_user_id:=auth.uid();
    new.verified_at:=now();
  end if;

  if (old.status='draft' and new.status not in ('draft','verified'))
     or (old.status='verified' and new.status not in ('draft','verified','published'))
     or (old.status='published' and new.status not in ('published','superseded','withdrawn'))
     or (old.status='superseded' and new.status not in ('superseded','withdrawn'))
     or (old.status='withdrawn' and new.status<>'withdrawn') then
    raise exception 'Curriculum scheduling constraint lifecycle transition is not allowed';
  end if;

  if new.status='published' and old.status<>'verified' then
    raise exception 'Curriculum scheduling constraint must be verified before publication';
  end if;

  if new.status='published' then
    perform app_private.require_verified_curriculum_time_source(new.source_id);
  end if;

  if tg_op='UPDATE' and old.status in ('published','superseded','withdrawn') then
    if old.status='withdrawn' and new.status<>'withdrawn' then
      raise exception 'Withdrawn curriculum scheduling constraints cannot return to an active lifecycle state';
    end if;
    if old.status='superseded' and new.status not in ('superseded','withdrawn') then
      raise exception 'Superseded curriculum scheduling constraints cannot return to an active lifecycle state';
    end if;
    if old.status='published' and new.status not in ('published','superseded','withdrawn') then
      raise exception 'Published curriculum scheduling constraints cannot return to a mutable lifecycle state';
    end if;
    if v_content_changed
      or new.verified_by_user_id is distinct from old.verified_by_user_id
      or new.verified_at is distinct from old.verified_at then
      raise exception 'Published curriculum scheduling constraint content and provenance are immutable';
    end if;
  end if;

  new.updated_at:=now();
  return new;
end;
$constraint_guard$;

revoke all on function app_private.guard_curriculum_scheduling_constraint()
from public,anon,authenticated;

create trigger curriculum_scheduling_constraint_guard_trg
before insert or update or delete on public.curriculum_scheduling_constraints
for each row execute function app_private.guard_curriculum_scheduling_constraint();

create or replace function app_private.audit_curriculum_time_registry()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $audit_time_registry$
declare
  v_event_type text;
begin
  if tg_table_name='curriculum_time_profiles'
     and new.status='published'
     and old.status is distinct from 'published' then
    v_event_type:='curriculum_time_profile_published';
  elsif tg_table_name='curriculum_time_allocations'
     and new.status='published'
     and old.status is distinct from 'published' then
    v_event_type:='curriculum_time_allocation_published';
  elsif tg_table_name='curriculum_time_allocations'
     and new.status='superseded'
     and old.status is distinct from 'superseded' then
    v_event_type:='curriculum_time_allocation_superseded';
  elsif tg_table_name='curriculum_scheduling_constraints'
     and new.status='published'
     and old.status is distinct from 'published' then
    v_event_type:='curriculum_time_constraint_published';
  else
    return new;
  end if;

  insert into public.audit_events(
    actor_user_id,event_type,entity_type,entity_id,metadata
  )
  values(
    auth.uid(),
    v_event_type,
    tg_table_name,
    new.id,
    jsonb_build_object(
      'status',new.status,
      'source_scope','national_curriculum_time_registry'
    )
  );

  return new;
end;
$audit_time_registry$;

revoke all on function app_private.audit_curriculum_time_registry()
from public,anon,authenticated;

create trigger curriculum_time_profile_audit_trg
after update of status on public.curriculum_time_profiles
for each row execute function app_private.audit_curriculum_time_registry();

create trigger curriculum_time_allocation_audit_trg
after update of status on public.curriculum_time_allocations
for each row execute function app_private.audit_curriculum_time_registry();

create trigger curriculum_scheduling_constraint_audit_trg
after update of status on public.curriculum_scheduling_constraints
for each row execute function app_private.audit_curriculum_time_registry();

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
security invoker
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
      from base_candidates replacement
      where replacement.supersedes_allocation_id=c.id
        and replacement.id<>c.id
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
      and (c.cycle_length is null or c.cycle_length=p_cycle_length)
      and (
        c.allocation_id=sel.id
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
      from constraint_base replacement
      where replacement.supersedes_constraint_id=c.id
        and replacement.id<>c.id
    )
  ),
  constraint_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',ac.id,
          'constraintKey',ac.constraint_key,
          'constraintType',ac.constraint_type,
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


-- Control Room remediation after exact-head Codex review.
-- These final guards intentionally override/extend the earlier Slice-1 definitions.

create or replace function app_private.guard_curriculum_time_source_evidence()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $time_source_finality$
declare
  v_is_final boolean:=false;
begin
  select exists(
    select 1
    from public.curriculum_time_profiles p
    where p.source_id=old.id
      and p.status in ('published','superseded','withdrawn')
    union all
    select 1
    from public.curriculum_scheduling_constraints c
    where c.source_id=old.id
      and c.status in ('published','superseded','withdrawn')
  ) into v_is_final;

  if not v_is_final then
    return case when tg_op='DELETE' then old else new end;
  end if;

  if tg_op='DELETE' then
    raise exception 'Curriculum source evidence used by final national time rules is immutable';
  end if;

  if new.id is distinct from old.id
     or new.authority is distinct from old.authority
     or new.source_key is distinct from old.source_key
     or new.title is distinct from old.title
     or new.source_url is distinct from old.source_url
     or new.source_document_date is distinct from old.source_document_date
     or new.checksum is distinct from old.checksum
     or new.provenance is distinct from old.provenance
     or new.status is distinct from old.status
     or new.created_at is distinct from old.created_at then
    raise exception 'Curriculum source evidence used by final national time rules is immutable';
  end if;

  return new;
end;
$time_source_finality$;

revoke all on function app_private.guard_curriculum_time_source_evidence()
from public,anon,authenticated;

drop trigger if exists curriculum_time_source_evidence_guard_trg on public.curriculum_sources;
create trigger curriculum_time_source_evidence_guard_trg
before update or delete on public.curriculum_sources
for each row execute function app_private.guard_curriculum_time_source_evidence();

create or replace function app_private.guard_curriculum_time_registry_identity()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog
as $time_identity$
begin
  if new.id is distinct from old.id then
    raise exception 'Curriculum time registry identities are immutable';
  end if;
  return new;
end;
$time_identity$;

revoke all on function app_private.guard_curriculum_time_registry_identity()
from public,anon,authenticated;

drop trigger if exists curriculum_time_profile_identity_guard_trg on public.curriculum_time_profiles;
drop trigger if exists curriculum_time_00_profile_identity_guard_trg on public.curriculum_time_profiles;
create trigger curriculum_time_00_profile_identity_guard_trg
before update on public.curriculum_time_profiles
for each row execute function app_private.guard_curriculum_time_registry_identity();

drop trigger if exists curriculum_time_allocation_identity_guard_trg on public.curriculum_time_allocations;
drop trigger if exists curriculum_time_00_allocation_identity_guard_trg on public.curriculum_time_allocations;
create trigger curriculum_time_00_allocation_identity_guard_trg
before update on public.curriculum_time_allocations
for each row execute function app_private.guard_curriculum_time_registry_identity();

drop trigger if exists curriculum_time_constraint_identity_guard_trg on public.curriculum_scheduling_constraints;
drop trigger if exists curriculum_time_00_constraint_identity_guard_trg on public.curriculum_scheduling_constraints;
drop trigger if exists aa_curriculum_time_constraint_identity_guard_trg on public.curriculum_scheduling_constraints;
create trigger aa_curriculum_time_constraint_identity_guard_trg
before update on public.curriculum_scheduling_constraints
for each row execute function app_private.guard_curriculum_time_registry_identity();

create or replace function app_private.guard_curriculum_time_allocation_supersession()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $allocation_supersession_guard$
declare
  v_new_cycle_kind text;
  v_new_cycle_length smallint;
  v_previous_cycle_kind text;
  v_previous_cycle_length smallint;
  v_cycle_detected boolean:=false;
begin
  if new.supersedes_allocation_id is null then
    return new;
  end if;

  select cycle_kind,cycle_length
    into v_new_cycle_kind,v_new_cycle_length
  from public.curriculum_time_profiles
  where id=new.profile_id;

  select p.cycle_kind,p.cycle_length
    into v_previous_cycle_kind,v_previous_cycle_length
  from public.curriculum_time_allocations a
  join public.curriculum_time_profiles p on p.id=a.profile_id
  where a.id=new.supersedes_allocation_id;

  if v_previous_cycle_kind is null then
    raise exception 'Superseded curriculum time allocation was not found';
  end if;

  if v_new_cycle_kind is distinct from v_previous_cycle_kind
     or v_new_cycle_length is distinct from v_previous_cycle_length then
    raise exception 'Curriculum time allocation supersession must remain within the same exact cycle variant';
  end if;

  with recursive predecessor_chain as (
    select
      a.id,
      a.supersedes_allocation_id,
      array[a.id]::uuid[] as path
    from public.curriculum_time_allocations a
    where a.id=new.supersedes_allocation_id

    union all

    select
      a.id,
      a.supersedes_allocation_id,
      chain.path || a.id
    from predecessor_chain chain
    join public.curriculum_time_allocations a
      on a.id=chain.supersedes_allocation_id
    where not a.id=any(chain.path)
  )
  select exists(
    select 1 from predecessor_chain where id=new.id
  ) into v_cycle_detected;

  if v_cycle_detected then
    raise exception 'Curriculum time allocation supersession chain cannot contain a cycle';
  end if;

  return new;
end;
$allocation_supersession_guard$;

revoke all on function app_private.guard_curriculum_time_allocation_supersession()
from public,anon,authenticated;

drop trigger if exists curriculum_time_allocation_supersession_guard_trg on public.curriculum_time_allocations;
create trigger curriculum_time_allocation_supersession_guard_trg
before insert or update on public.curriculum_time_allocations
for each row execute function app_private.guard_curriculum_time_allocation_supersession();


create or replace function app_private.guard_curriculum_time_slot_subject()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $slot_guard$
declare
  v_old_status text;
  v_new_status text;
  v_new_kind text;
begin
  if tg_op in ('UPDATE','DELETE') then
    select status into v_old_status
    from public.curriculum_time_allocations
    where id=old.allocation_id;
  end if;

  if tg_op in ('INSERT','UPDATE') then
    select status,target_kind into v_new_status,v_new_kind
    from public.curriculum_time_allocations
    where id=new.allocation_id;

    if v_new_status is null then
      raise exception 'Curriculum time allocation not found';
    end if;
    if v_new_kind='subject' then
      raise exception 'Slot-subject eligibility can only be attached to non-subject curriculum allocation slots';
    end if;
  end if;

  if v_old_status in ('verified','published','superseded','withdrawn')
     or v_new_status in ('verified','published','superseded','withdrawn') then
    raise exception 'Verified curriculum time slot eligibility is immutable; return the parent allocation to draft or create a new allocation version';
  end if;

  return case when tg_op='DELETE' then old else new end;
end;
$slot_guard$;

revoke all on function app_private.guard_curriculum_time_slot_subject()
from public,anon,authenticated;

create or replace function app_private.guard_curriculum_time_allocation_overlap()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $allocation_overlap_guard$
declare
  v_profile public.curriculum_time_profiles%rowtype;
  v_conflict boolean:=false;
begin
  if tg_op<>'UPDATE'
     or new.status<>'published'
     or old.status='published' then
    return new;
  end if;

  select * into v_profile
  from public.curriculum_time_profiles
  where id=new.profile_id;

  select exists(
    select 1
    from public.curriculum_time_allocations other
    join public.curriculum_time_profiles other_profile on other_profile.id=other.profile_id
    where other.id<>new.id
      and other.status='published'
      and other_profile.status='published'
      and other_profile.cycle_kind=v_profile.cycle_kind
      and other_profile.cycle_length=v_profile.cycle_length
      and other_profile.effective_from_year<=coalesce(v_profile.effective_to_year,2200)
      and coalesce(other_profile.effective_to_year,2200)>=v_profile.effective_from_year
      and coalesce(other.grade_from,0)<=coalesce(new.grade_to,20)
      and coalesce(other.grade_to,20)>=coalesce(new.grade_from,0)
      and other.id is distinct from new.supersedes_allocation_id
      and other.supersedes_allocation_id is distinct from new.id
      and (
        (new.target_kind='subject'
          and other.target_kind='subject'
          and other.curriculum_subject_id=new.curriculum_subject_id)
        or
        (new.target_kind='subject'
          and other.target_kind<>'subject'
          and exists(
            select 1
            from public.curriculum_time_slot_subjects ss
            where ss.allocation_id=other.id
              and ss.curriculum_subject_id=new.curriculum_subject_id
          ))
        or
        (new.target_kind<>'subject'
          and other.target_kind='subject'
          and exists(
            select 1
            from public.curriculum_time_slot_subjects ss
            where ss.allocation_id=new.id
              and ss.curriculum_subject_id=other.curriculum_subject_id
          ))
        or
        (new.target_kind<>'subject'
          and other.target_kind<>'subject'
          and (
            (new.target_kind=other.target_kind and new.allocation_key=other.allocation_key)
            or exists(
              select 1
              from public.curriculum_time_slot_subjects new_ss
              join public.curriculum_time_slot_subjects other_ss
                on other_ss.curriculum_subject_id=new_ss.curriculum_subject_id
              where new_ss.allocation_id=new.id
                and other_ss.allocation_id=other.id
            )
          ))
      )
  ) into v_conflict;

  if v_conflict then
    if new.conflict_acknowledgement_reason is null
       or btrim(new.conflict_acknowledgement_reason)='' then
      raise exception 'Publishing this curriculum time allocation would create an unresolved source conflict';
    end if;
    if auth.uid() is null then raise exception 'Authentication required'; end if;
    new.conflict_acknowledged_by_user_id:=auth.uid();
    new.conflict_acknowledged_at:=now();
  else
    new.conflict_acknowledgement_reason:=null;
    new.conflict_acknowledged_by_user_id:=null;
    new.conflict_acknowledged_at:=null;
  end if;

  return new;
end;
$allocation_overlap_guard$;

revoke all on function app_private.guard_curriculum_time_allocation_overlap()
from public,anon,authenticated;

drop trigger if exists curriculum_time_allocation_overlap_guard_trg on public.curriculum_time_allocations;
create trigger curriculum_time_allocation_overlap_guard_trg
before update on public.curriculum_time_allocations
for each row execute function app_private.guard_curriculum_time_allocation_overlap();

create or replace function app_private.guard_curriculum_time_conflict_provenance()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog
as $time_conflict_provenance$
begin
  if old.status in ('published','superseded','withdrawn')
     and new.conflict_acknowledgement_reason is distinct from old.conflict_acknowledgement_reason then
    raise exception 'Published curriculum time conflict acknowledgement reason is immutable provenance';
  end if;
  return new;
end;
$time_conflict_provenance$;

revoke all on function app_private.guard_curriculum_time_conflict_provenance()
from public,anon,authenticated;

drop trigger if exists curriculum_time_allocation_conflict_provenance_guard_trg on public.curriculum_time_allocations;
create trigger curriculum_time_allocation_conflict_provenance_guard_trg
before update on public.curriculum_time_allocations
for each row execute function app_private.guard_curriculum_time_conflict_provenance();


create or replace function app_private.audit_curriculum_time_registry()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $audit_time_registry$
declare
  v_event_type text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if tg_table_name='curriculum_time_profiles' then
    if new.status='published' then
      v_event_type:='curriculum_time_profile_published';
    elsif new.status='superseded' then
      v_event_type:='curriculum_time_profile_superseded';
    elsif new.status='withdrawn' then
      v_event_type:='curriculum_time_profile_withdrawn';
    end if;
  elsif tg_table_name='curriculum_time_allocations' then
    if new.status='published' then
      v_event_type:='curriculum_time_allocation_published';
    elsif new.status='superseded' then
      v_event_type:='curriculum_time_allocation_superseded';
    elsif new.status='withdrawn' then
      v_event_type:='curriculum_time_allocation_withdrawn';
    end if;
  elsif tg_table_name='curriculum_scheduling_constraints' then
    if new.status='published' then
      v_event_type:='curriculum_time_constraint_published';
    elsif new.status='superseded' then
      v_event_type:='curriculum_time_constraint_superseded';
    elsif new.status='withdrawn' then
      v_event_type:='curriculum_time_constraint_withdrawn';
    end if;
  end if;

  if v_event_type is null then
    return new;
  end if;

  insert into public.audit_events(
    actor_user_id,event_type,entity_type,entity_id,metadata
  )
  values(
    auth.uid(),
    v_event_type,
    tg_table_name,
    new.id,
    jsonb_strip_nulls(jsonb_build_object(
      'old_status',old.status,
      'status',new.status,
      'source_scope','national_curriculum_time_registry',
      'conflict_acknowledgement_reason',
        case when tg_table_name='curriculum_time_allocations'
          then to_jsonb(new)->>'conflict_acknowledgement_reason'
          else null end
    ))
  );

  return new;
end;
$audit_time_registry$;

revoke all on function app_private.audit_curriculum_time_registry()
from public,anon,authenticated;
