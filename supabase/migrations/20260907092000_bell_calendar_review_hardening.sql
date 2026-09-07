-- P1 review hardening for N17/N18: preserve legacy day writes, close direct DML,
-- enforce resolver caller scope, preserve explicit Anytime overrides, and audit mutations.

create or replace function app_private.normalize_school_day_teaching_impact()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.is_school_day = false then
    new.teaching_impact := 'NO_TEACHING';
    new.bell_schedule_id := null;
  elsif new.teaching_impact = 'NO_TEACHING' then
    -- Legacy writers may reopen a previously closed day by only toggling
    -- is_school_day back to true. Derive the canonical default in that case.
    new.teaching_impact := 'NORMAL';
  end if;

  return new;
end;
$$;

revoke all on function app_private.normalize_school_day_teaching_impact()
from public, anon, authenticated;

drop trigger if exists school_day_override_teaching_impact_normalize_trg
on public.school_day_overrides;
create trigger school_day_override_teaching_impact_normalize_trg
before insert or update of is_school_day, teaching_impact, bell_schedule_id
on public.school_day_overrides
for each row execute function app_private.normalize_school_day_teaching_impact();

alter table public.school_day_overrides
  drop constraint if exists school_day_overrides_teaching_impact_school_day_check,
  add constraint school_day_overrides_teaching_impact_school_day_check
    check (
      (teaching_impact = 'NO_TEACHING' and is_school_day = false)
      or (teaching_impact <> 'NO_TEACHING' and is_school_day = true)
    );

-- Bell schedule writes are governed through SECURITY DEFINER RPCs only.
drop policy if exists "school leaders can manage bell schedules"
on public.timetable_bell_schedules;
drop policy if exists "school leaders can manage bell schedule periods"
on public.timetable_bell_schedule_periods;

revoke all on table public.timetable_bell_schedules from public, anon, authenticated;
revoke all on table public.timetable_bell_schedule_periods from public, anon, authenticated;
grant select on table public.timetable_bell_schedules to authenticated;
grant select on table public.timetable_bell_schedule_periods to authenticated;

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
  v_weekdays smallint[];
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

  select array_agg(distinct d order by d)
    into v_weekdays
  from unnest(p_applies_to_weekdays) d;

  insert into public.timetable_bell_schedules(
    tenant_id,school_id,academic_year,display_name,effective_from,effective_to,applies_to_weekdays,created_by_user_id
  ) values (
    v_school.tenant_id,p_school_id,p_academic_year,btrim(p_display_name),p_effective_from,p_effective_to,
    v_weekdays,auth.uid()
  ) returning id into v_id;

  insert into public.audit_events(
    tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
  ) values (
    v_school.tenant_id, p_school_id, auth.uid(), 'timetable.bell_schedule.created',
    'timetable_bell_schedule', v_id,
    jsonb_build_object(
      'academic_year', p_academic_year,
      'display_name', btrim(p_display_name),
      'effective_from', p_effective_from,
      'effective_to', p_effective_to,
      'applies_to_weekdays', to_jsonb(v_weekdays)
    )
  );

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
  v_override_id uuid;
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
  do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,updated_at=now()
  returning id into v_override_id;

  insert into public.audit_events(
    tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
  ) values (
    v_schedule.tenant_id, v_schedule.school_id, auth.uid(), 'timetable.bell_period.changed',
    'timetable_bell_schedule_period', v_override_id,
    jsonb_build_object(
      'bell_schedule_id', p_bell_schedule_id,
      'timetable_period_id', p_timetable_period_id,
      'starts_at', p_starts_at,
      'ends_at', p_ends_at,
      'anytime', p_starts_at is null and p_ends_at is null
    )
  );
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

  insert into public.audit_events(
    tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
  ) values (
    v_school.tenant_id, p_school_id, auth.uid(), 'calendar.teaching_impact.changed',
    'school_day_override', v_id,
    jsonb_build_object(
      'school_date', p_school_date,
      'teaching_impact', v_impact,
      'reason', nullif(btrim(coalesce(p_reason,'')),''),
      'source', p_source,
      'bell_schedule_id', p_bell_schedule_id
    )
  );

  return v_id;
end;
$$;

create or replace function public.resolve_timetable_bell_periods(
  p_school_id uuid,
  p_academic_year integer,
  p_target_date date
)
returns table(
  period_id uuid,
  period_number smallint,
  display_name text,
  starts_at time,
  ends_at time,
  bell_schedule_id uuid,
  bell_schedule_name text
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not app_private.has_school_access(p_school_id) then
    raise exception 'Permission denied';
  end if;

  return query
  with chosen as (
    select public.resolve_timetable_bell_schedule(p_school_id,p_academic_year,p_target_date) id
  )
  select
    tp.id,
    tp.period_number,
    tp.display_name,
    case when bsp.id is null then tp.starts_at else bsp.starts_at end,
    case when bsp.id is null then tp.ends_at else bsp.ends_at end,
    bs.id,
    bs.display_name
  from public.timetable_periods tp
  left join chosen c on true
  left join public.timetable_bell_schedules bs on bs.id=c.id
  left join public.timetable_bell_schedule_periods bsp
    on bsp.bell_schedule_id=bs.id and bsp.timetable_period_id=tp.id
  where tp.school_id=p_school_id
    and tp.academic_year=p_academic_year
    and tp.is_teaching_period=true
  order by tp.period_number;
end;
$$;

revoke all on function public.upsert_timetable_bell_schedule(uuid,integer,text,date,date,smallint[]) from public,anon;
revoke all on function public.upsert_timetable_bell_schedule_period(uuid,uuid,time,time) from public,anon;
revoke all on function public.configure_school_teaching_day(uuid,date,text,text,uuid,text) from public,anon;
revoke all on function public.resolve_timetable_bell_periods(uuid,integer,date) from public,anon;
grant execute on function public.upsert_timetable_bell_schedule(uuid,integer,text,date,date,smallint[]) to authenticated;
grant execute on function public.upsert_timetable_bell_schedule_period(uuid,uuid,time,time) to authenticated;
grant execute on function public.configure_school_teaching_day(uuid,date,text,text,uuid,text) to authenticated;
grant execute on function public.resolve_timetable_bell_periods(uuid,integer,date) to authenticated;
