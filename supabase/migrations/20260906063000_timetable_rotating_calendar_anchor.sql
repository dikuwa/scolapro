-- Resolve real calendar dates to the configured timetable day without coupling
-- attendance's weekly register semantics to rotating timetables.

create table if not exists public.timetable_cycle_anchors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  anchor_date date not null,
  anchor_day smallint not null check (anchor_day between 1 and 10),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, academic_year)
);

create index if not exists timetable_cycle_anchors_school_year_idx
  on public.timetable_cycle_anchors (school_id, academic_year);

alter table public.timetable_cycle_anchors enable row level security;

revoke all on table public.timetable_cycle_anchors from anon, authenticated;
grant select on table public.timetable_cycle_anchors to authenticated;

create policy "school members can read timetable cycle anchors"
on public.timetable_cycle_anchors for select
to authenticated
using (app_private.has_school_access(school_id));

create or replace function public.configure_timetable_cycle_anchor(
  p_school_id uuid,
  p_academic_year integer,
  p_anchor_date date,
  p_anchor_day smallint
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_school public.schools%rowtype;
  v_year public.academic_years%rowtype;
  v_anchor_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_school_role(p_school_id,array['school_admin','principal'])
     and not app_private.has_platform_role(array['platform_admin']) then
    raise exception 'Permission denied';
  end if;

  select * into v_school
  from public.schools
  where id=p_school_id and status='active';
  if not found then raise exception 'School not found or inactive'; end if;

  if v_school.timetable_cycle_mode <> 'rotating' then
    raise exception 'Calendar anchors apply only to rotating timetable cycles';
  end if;
  if p_anchor_day is null or p_anchor_day < 1 or p_anchor_day > v_school.timetable_cycle_length then
    raise exception 'Anchor day must be inside this school''s configured timetable cycle';
  end if;
  if p_anchor_date is null then raise exception 'Anchor date is required'; end if;

  select * into v_year
  from public.academic_years
  where school_id=p_school_id and year=p_academic_year;
  if not found then raise exception 'Configure the academic year before setting a timetable cycle anchor'; end if;

  if v_year.starts_on is not null and p_anchor_date < v_year.starts_on then
    raise exception 'Anchor date cannot be before the academic year starts';
  end if;
  if v_year.ends_on is not null and p_anchor_date > v_year.ends_on then
    raise exception 'Anchor date cannot be after the academic year ends';
  end if;
  if not app_private.is_expected_school_day(p_school_id,p_anchor_date) then
    raise exception 'Anchor date must be a configured school day';
  end if;

  insert into public.timetable_cycle_anchors(
    tenant_id,school_id,academic_year,anchor_date,anchor_day,created_by_user_id
  ) values (
    v_school.tenant_id,p_school_id,p_academic_year,p_anchor_date,p_anchor_day,auth.uid()
  )
  on conflict (school_id,academic_year)
  do update set
    anchor_date=excluded.anchor_date,
    anchor_day=excluded.anchor_day,
    created_by_user_id=auth.uid(),
    updated_at=now()
  returning id into v_anchor_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values (
    v_school.tenant_id,p_school_id,auth.uid(),
    'timetable.cycle_anchor.configured','timetable_cycle_anchor',v_anchor_id,
    jsonb_build_object(
      'academic_year',p_academic_year,
      'anchor_date',p_anchor_date,
      'anchor_day',p_anchor_day,
      'cycle_length',v_school.timetable_cycle_length
    )
  );

  return v_anchor_id;
end;
$$;

revoke all on function public.configure_timetable_cycle_anchor(uuid,integer,date,smallint)
from public,anon;
grant execute on function public.configure_timetable_cycle_anchor(uuid,integer,date,smallint)
to authenticated;

create or replace function public.resolve_timetable_day(
  p_school_id uuid,
  p_academic_year integer,
  p_target_date date
)
returns smallint
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_mode text;
  v_length smallint;
  v_anchor_date date;
  v_anchor_day smallint;
  v_year_start date;
  v_year_end date;
  v_school_days integer;
  v_steps integer;
  v_resolved integer;
begin
  if p_target_date is null then return null; end if;

  select s.timetable_cycle_mode,s.timetable_cycle_length
    into v_mode,v_length
  from public.schools s
  where s.id=p_school_id and s.status='active';
  if not found then return null; end if;

  select ay.starts_on,ay.ends_on
    into v_year_start,v_year_end
  from public.academic_years ay
  where ay.school_id=p_school_id and ay.year=p_academic_year;
  if not found then return null; end if;

  if v_year_start is not null and p_target_date < v_year_start then return null; end if;
  if v_year_end is not null and p_target_date > v_year_end then return null; end if;
  if not app_private.is_expected_school_day(p_school_id,p_target_date) then return null; end if;

  if v_mode='weekday' then
    v_resolved := extract(isodow from p_target_date)::integer;
    if v_resolved > v_length then return null; end if;
    return v_resolved::smallint;
  end if;

  select a.anchor_date,a.anchor_day
    into v_anchor_date,v_anchor_day
  from public.timetable_cycle_anchors a
  where a.school_id=p_school_id and a.academic_year=p_academic_year;
  if not found then return null; end if;

  if p_target_date >= v_anchor_date then
    select count(*)::integer
      into v_school_days
    from generate_series(v_anchor_date,p_target_date,interval '1 day') g(day_value)
    where app_private.is_expected_school_day(p_school_id,g.day_value::date);
    v_steps := greatest(v_school_days-1,0);
    return (((v_anchor_day-1+v_steps) % v_length)+1)::smallint;
  end if;

  select count(*)::integer
    into v_school_days
  from generate_series(p_target_date,v_anchor_date,interval '1 day') g(day_value)
  where app_private.is_expected_school_day(p_school_id,g.day_value::date);
  v_steps := greatest(v_school_days-1,0);
  v_resolved := ((v_anchor_day-1-v_steps) % v_length + v_length) % v_length + 1;
  return v_resolved::smallint;
end;
$$;

revoke all on function public.resolve_timetable_day(uuid,integer,date)
from public,anon;
grant execute on function public.resolve_timetable_day(uuid,integer,date)
to authenticated;

create or replace function app_private.enforce_school_timetable_cycle_configuration()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_max_day smallint;
  v_max_anchor_day smallint;
begin
  if new.timetable_cycle_mode='weekday' and new.timetable_cycle_length>7 then
    raise exception 'Standard weekday timetable cycles cannot exceed 7 days' using errcode='23514';
  end if;

  if new.timetable_cycle_length<1 or new.timetable_cycle_length>10 then
    raise exception 'Timetable cycle length must be between 1 and 10 days' using errcode='23514';
  end if;

  if tg_op='UPDATE' and new.timetable_cycle_length < old.timetable_cycle_length then
    select max(ts.weekday)
      into v_max_day
    from public.timetable_slots ts
    where ts.school_id=new.id and ts.status='active';

    if v_max_day is not null and v_max_day>new.timetable_cycle_length then
      raise exception 'Timetable cycle cannot be shortened below Day % while active slots still use that day',v_max_day
        using errcode='23514';
    end if;
  end if;

  if new.timetable_cycle_mode='rotating' then
    select max(a.anchor_day)
      into v_max_anchor_day
    from public.timetable_cycle_anchors a
    where a.school_id=new.id;

    if v_max_anchor_day is not null and v_max_anchor_day>new.timetable_cycle_length then
      raise exception 'Timetable cycle cannot be shortened below configured anchor Day %',v_max_anchor_day
        using errcode='23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_school_timetable_cycle_configuration()
from public,anon,authenticated;

comment on table public.timetable_cycle_anchors is
  'Per-academic-year real-date anchor for numbered rotating timetable cycles.';
comment on function public.configure_timetable_cycle_anchor(uuid,integer,date,smallint) is
  'Governed School Admin/Principal boundary for defining which real school date corresponds to a rotating Day N.';
comment on function public.resolve_timetable_day(uuid,integer,date) is
  'Maps a real school date to the applicable timetable day index. Rotating mode advances only across expected school days and respects school_day_overrides.';
