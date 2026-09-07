-- N17/N18: teaching-impact semantics and effective-dated bell schedules.
-- Bell schedules are school/year data. Seasonal examples belong in tests only.

create table public.timetable_bell_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  display_name text not null check (btrim(display_name) <> ''),
  effective_from date not null,
  effective_to date,
  applies_to_weekdays smallint[] not null default array[1,2,3,4,5]::smallint[],
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  check (cardinality(applies_to_weekdays) between 1 and 7),
  check (applies_to_weekdays <@ array[1,2,3,4,5,6,7]::smallint[])
);

create index timetable_bell_schedules_school_year_dates_idx
  on public.timetable_bell_schedules (school_id, academic_year, effective_from desc, effective_to);

create table public.timetable_bell_schedule_periods (
  id uuid primary key default gen_random_uuid(),
  bell_schedule_id uuid not null references public.timetable_bell_schedules(id) on delete cascade,
  timetable_period_id uuid not null references public.timetable_periods(id) on delete cascade,
  starts_at time,
  ends_at time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bell_schedule_id, timetable_period_id),
  check ((starts_at is null and ends_at is null) or (starts_at is not null and ends_at is not null and ends_at > starts_at))
);

alter table public.timetable_bell_schedules enable row level security;
alter table public.timetable_bell_schedule_periods enable row level security;

grant select on public.timetable_bell_schedules, public.timetable_bell_schedule_periods to authenticated;

create policy "school members can read bell schedules"
on public.timetable_bell_schedules for select to authenticated
using (app_private.has_school_access(school_id));

create policy "school leaders can manage bell schedules"
on public.timetable_bell_schedules for all to authenticated
using (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal']))
with check (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal']));

create policy "school members can read bell schedule periods"
on public.timetable_bell_schedule_periods for select to authenticated
using (exists (
  select 1 from public.timetable_bell_schedules bs
  where bs.id=bell_schedule_id and app_private.has_school_access(bs.school_id)
));

create policy "school leaders can manage bell schedule periods"
on public.timetable_bell_schedule_periods for all to authenticated
using (exists (
  select 1 from public.timetable_bell_schedules bs
  where bs.id=bell_schedule_id and app_private.has_school_role(bs.school_id,array['school_admin','principal','deputy_principal'])
))
with check (exists (
  select 1 from public.timetable_bell_schedules bs
  where bs.id=bell_schedule_id and app_private.has_school_role(bs.school_id,array['school_admin','principal','deputy_principal'])
));

alter table public.school_day_overrides
  add column teaching_impact text not null default 'NORMAL',
  add column bell_schedule_id uuid references public.timetable_bell_schedules(id) on delete set null;

update public.school_day_overrides
set teaching_impact=case when is_school_day then 'NORMAL' else 'NO_TEACHING' end;

alter table public.school_day_overrides
  add constraint school_day_overrides_teaching_impact_check
    check (teaching_impact in ('NORMAL','NO_TEACHING','PARTIAL_DAY','ALTERED_TIMETABLE','EXAM_TIMETABLE')),
  add constraint school_day_overrides_teaching_impact_school_day_check
    check ((teaching_impact='NO_TEACHING' and is_school_day=false) or (teaching_impact<>'NO_TEACHING' and is_school_day=true)),
  add constraint school_day_overrides_bell_schedule_impact_check
    check (bell_schedule_id is null or teaching_impact in ('ALTERED_TIMETABLE','EXAM_TIMETABLE'));

create or replace function public.upsert_timetable_bell_schedule(
  p_school_id uuid,
  p_academic_year integer,
  p_display_name text,
  p_effective_from date,
  p_effective_to date default null,
  p_applies_to_weekdays smallint[] default array[1,2,3,4,5]::smallint[]
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_school public.schools%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])
     and not app_private.has_platform_role(array['platform_admin']) then raise exception 'Permission denied'; end if;
  if btrim(coalesce(p_display_name,''))='' then raise exception 'Bell schedule name is required'; end if;
  if p_effective_from is null then raise exception 'Bell schedule start date is required'; end if;
  if p_effective_to is not null and p_effective_to<p_effective_from then raise exception 'Bell schedule end date cannot be before start date'; end if;
  if p_applies_to_weekdays is null or cardinality(p_applies_to_weekdays)<1 or not (p_applies_to_weekdays <@ array[1,2,3,4,5,6,7]::smallint[]) then
    raise exception 'Choose at least one valid weekday';
  end if;

  select * into v_school from public.schools where id=p_school_id and status='active';
  if not found then raise exception 'School not found or inactive'; end if;
  if not exists(select 1 from public.academic_years where school_id=p_school_id and year=p_academic_year) then
    raise exception 'Configure the academic year before creating a bell schedule';
  end if;

  insert into public.timetable_bell_schedules(
    tenant_id,school_id,academic_year,display_name,effective_from,effective_to,applies_to_weekdays,created_by_user_id
  ) values (
    v_school.tenant_id,p_school_id,p_academic_year,btrim(p_display_name),p_effective_from,p_effective_to,
    (select array_agg(distinct d order by d) from unnest(p_applies_to_weekdays) d),auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.upsert_timetable_bell_schedule_period(
  p_bell_schedule_id uuid,
  p_timetable_period_id uuid,
  p_starts_at time default null,
  p_ends_at time default null
)
returns void
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_schedule public.timetable_bell_schedules%rowtype;
  v_period public.timetable_periods%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_schedule from public.timetable_bell_schedules where id=p_bell_schedule_id;
  if not found then raise exception 'Bell schedule not found'; end if;
  if not app_private.has_school_role(v_schedule.school_id,array['school_admin','principal','deputy_principal'])
     and not app_private.has_platform_role(array['platform_admin']) then raise exception 'Permission denied'; end if;
  select * into v_period from public.timetable_periods where id=p_timetable_period_id;
  if not found or v_period.school_id<>v_schedule.school_id or v_period.academic_year<>v_schedule.academic_year then
    raise exception 'Timetable period is outside bell schedule school/year scope';
  end if;
  if (p_starts_at is null)<>(p_ends_at is null) then raise exception 'Provide both bell times or leave both empty for Anytime'; end if;
  if p_starts_at is not null and p_ends_at<=p_starts_at then raise exception 'Bell schedule end time must be after start time'; end if;

  insert into public.timetable_bell_schedule_periods(bell_schedule_id,timetable_period_id,starts_at,ends_at)
  values(p_bell_schedule_id,p_timetable_period_id,p_starts_at,p_ends_at)
  on conflict(bell_schedule_id,timetable_period_id)
  do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,updated_at=now();
end;
$$;

create or replace function public.configure_school_teaching_day(
  p_school_id uuid,
  p_school_date date,
  p_teaching_impact text,
  p_reason text default null,
  p_bell_schedule_id uuid default null,
  p_source text default 'school'
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_school public.schools%rowtype;
  v_impact text:=upper(btrim(coalesce(p_teaching_impact,'')));
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])
     and not app_private.has_platform_role(array['platform_admin']) then raise exception 'Permission denied'; end if;
  if v_impact not in ('NORMAL','NO_TEACHING','PARTIAL_DAY','ALTERED_TIMETABLE','EXAM_TIMETABLE') then raise exception 'Teaching impact is invalid'; end if;
  if p_source not in ('national','regional','school','emergency') then raise exception 'School-day source is invalid'; end if;
  if p_bell_schedule_id is not null and v_impact not in ('ALTERED_TIMETABLE','EXAM_TIMETABLE') then raise exception 'Bell schedule override is only valid for altered or exam timetable days'; end if;

  select * into v_school from public.schools where id=p_school_id and status='active';
  if not found then raise exception 'School not found or inactive'; end if;
  if p_bell_schedule_id is not null and not exists(
    select 1 from public.timetable_bell_schedules bs
    where bs.id=p_bell_schedule_id and bs.school_id=p_school_id
      and p_school_date between bs.effective_from and coalesce(bs.effective_to,'infinity'::date)
  ) then raise exception 'Selected bell schedule is not effective for this school and date'; end if;

  insert into public.school_day_overrides(
    tenant_id,school_id,school_date,is_school_day,reason,source,created_by_user_id,teaching_impact,bell_schedule_id
  ) values (
    v_school.tenant_id,p_school_id,p_school_date,v_impact<>'NO_TEACHING',nullif(btrim(coalesce(p_reason,'')),''),p_source,auth.uid(),v_impact,p_bell_schedule_id
  )
  on conflict(school_id,school_date) do update set
    is_school_day=excluded.is_school_day,reason=excluded.reason,source=excluded.source,
    created_by_user_id=auth.uid(),teaching_impact=excluded.teaching_impact,bell_schedule_id=excluded.bell_schedule_id,updated_at=now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.resolve_school_teaching_impact(p_school_id uuid,p_target_date date)
returns text language sql stable security definer set search_path=pg_catalog,public,app_private as $$
  select coalesce(
    (select sdo.teaching_impact from public.school_day_overrides sdo where sdo.school_id=p_school_id and sdo.school_date=p_target_date),
    case when app_private.is_expected_school_day(p_school_id,p_target_date) then 'NORMAL' else 'NO_TEACHING' end
  );
$$;

create or replace function public.resolve_timetable_bell_schedule(p_school_id uuid,p_academic_year integer,p_target_date date)
returns uuid language sql stable security definer set search_path=pg_catalog,public as $$
  select coalesce(
    (select sdo.bell_schedule_id from public.school_day_overrides sdo
      where sdo.school_id=p_school_id and sdo.school_date=p_target_date
        and sdo.teaching_impact in ('ALTERED_TIMETABLE','EXAM_TIMETABLE') and sdo.bell_schedule_id is not null),
    (select bs.id from public.timetable_bell_schedules bs
      where bs.school_id=p_school_id and bs.academic_year=p_academic_year
        and p_target_date between bs.effective_from and coalesce(bs.effective_to,'infinity'::date)
        and extract(isodow from p_target_date)::smallint=any(bs.applies_to_weekdays)
      order by bs.effective_from desc,bs.created_at desc,bs.id desc limit 1)
  );
$$;

create or replace function public.resolve_timetable_bell_periods(p_school_id uuid,p_academic_year integer,p_target_date date)
returns table(period_id uuid,period_number smallint,display_name text,starts_at time,ends_at time,bell_schedule_id uuid,bell_schedule_name text)
language sql stable security definer set search_path=pg_catalog,public as $$
  with chosen as (select public.resolve_timetable_bell_schedule(p_school_id,p_academic_year,p_target_date) id)
  select tp.id,tp.period_number,tp.display_name,
    coalesce(bsp.starts_at,tp.starts_at),coalesce(bsp.ends_at,tp.ends_at),bs.id,bs.display_name
  from public.timetable_periods tp
  left join chosen c on true
  left join public.timetable_bell_schedules bs on bs.id=c.id
  left join public.timetable_bell_schedule_periods bsp on bsp.bell_schedule_id=bs.id and bsp.timetable_period_id=tp.id
  where tp.school_id=p_school_id and tp.academic_year=p_academic_year and tp.is_teaching_period=true
  order by tp.period_number;
$$;

revoke all on function public.upsert_timetable_bell_schedule(uuid,integer,text,date,date,smallint[]) from public,anon;
revoke all on function public.upsert_timetable_bell_schedule_period(uuid,uuid,time,time) from public,anon;
revoke all on function public.configure_school_teaching_day(uuid,date,text,text,uuid,text) from public,anon;
revoke all on function public.resolve_school_teaching_impact(uuid,date) from public,anon;
revoke all on function public.resolve_timetable_bell_schedule(uuid,integer,date) from public,anon;
revoke all on function public.resolve_timetable_bell_periods(uuid,integer,date) from public,anon;
grant execute on function public.upsert_timetable_bell_schedule(uuid,integer,text,date,date,smallint[]) to authenticated;
grant execute on function public.upsert_timetable_bell_schedule_period(uuid,uuid,time,time) to authenticated;
grant execute on function public.configure_school_teaching_day(uuid,date,text,text,uuid,text) to authenticated;
grant execute on function public.resolve_school_teaching_impact(uuid,date) to authenticated;
grant execute on function public.resolve_timetable_bell_schedule(uuid,integer,date) to authenticated;
grant execute on function public.resolve_timetable_bell_periods(uuid,integer,date) to authenticated;

comment on table public.timetable_bell_schedules is 'Effective-dated, weekday-aware school bell schedules. No universal seasonal defaults are seeded.';
comment on column public.school_day_overrides.teaching_impact is 'Teaching semantics for the date: NORMAL, NO_TEACHING, PARTIAL_DAY, ALTERED_TIMETABLE or EXAM_TIMETABLE.';
comment on function public.resolve_timetable_bell_schedule(uuid,integer,date) is 'Resolves an explicit altered/exam-day bell schedule first, otherwise the latest effective weekday schedule.';