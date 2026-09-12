-- Bind school-local academic calendar mutations to the deterministic current school
-- and preserve terminal academic year/term finality.

create or replace function app_private.user_targets_current_school(
  p_user_id uuid,
  p_school_id uuid
) returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select p_school_id = (
    select sm.school_id
    from public.school_memberships sm
    where sm.user_id = p_user_id
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
    order by sm.active_from desc, sm.id asc
    limit 1
  );
$$;
revoke all on function app_private.user_targets_current_school(uuid,uuid) from public,anon;
grant execute on function app_private.user_targets_current_school(uuid,uuid) to authenticated;

create or replace function public.configure_academic_year(
  p_school_id uuid,
  p_year integer,
  p_starts_on date default null,
  p_ends_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = public,app_private
as $$
declare
  v_school public.schools%rowtype;
  v_existing public.academic_years%rowtype;
  v_year_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.user_targets_current_school(auth.uid(),p_school_id)
     or not app_private.can_manage_school_members(p_school_id) then
    raise exception 'Permission denied';
  end if;
  if p_year < 2000 or p_year > 2200 then raise exception 'Academic year is invalid'; end if;
  if p_starts_on is not null and p_ends_on is not null and p_ends_on < p_starts_on then raise exception 'Academic year end date cannot be before start date'; end if;

  select * into v_school from public.schools where id = p_school_id and status = 'active';
  if not found then raise exception 'School not found or inactive'; end if;

  select * into v_existing
  from public.academic_years
  where school_id=p_school_id and year=p_year;
  if found and v_existing.status='closed' then
    raise exception 'Closed academic year is final';
  end if;

  insert into public.academic_years (tenant_id, school_id, year, starts_on, ends_on)
  values (v_school.tenant_id, p_school_id, p_year, p_starts_on, p_ends_on)
  on conflict (school_id, year)
  do update set starts_on = excluded.starts_on, ends_on = excluded.ends_on, updated_at = now()
  returning id into v_year_id;

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_school.tenant_id, p_school_id, auth.uid(), 'academic.year.configured', 'academic_year', v_year_id, jsonb_build_object('year', p_year));

  return v_year_id;
end;
$$;

create or replace function public.configure_academic_term(
  p_academic_year_id uuid,
  p_term_number smallint,
  p_display_name text,
  p_starts_on date default null,
  p_ends_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = public,app_private
as $$
declare
  v_year public.academic_years%rowtype;
  v_existing public.academic_terms%rowtype;
  v_term_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_year from public.academic_years where id = p_academic_year_id;
  if not found then raise exception 'Academic year not found'; end if;
  if not app_private.user_targets_current_school(auth.uid(),v_year.school_id)
     or not app_private.can_manage_school_members(v_year.school_id) then
    raise exception 'Permission denied';
  end if;
  if v_year.status='closed' then raise exception 'Closed academic year is final'; end if;
  if p_term_number < 1 or p_term_number > 6 then raise exception 'Term number is invalid'; end if;
  if btrim(coalesce(p_display_name, '')) = '' then raise exception 'Term name is required'; end if;
  if p_starts_on is not null and p_ends_on is not null and p_ends_on < p_starts_on then raise exception 'Term end date cannot be before start date'; end if;

  select * into v_existing
  from public.academic_terms
  where academic_year_id=p_academic_year_id and term_number=p_term_number;
  if found and v_existing.status='closed' then
    raise exception 'Closed academic term is final';
  end if;

  insert into public.academic_terms (tenant_id, school_id, academic_year_id, term_number, display_name, starts_on, ends_on)
  values (v_year.tenant_id, v_year.school_id, v_year.id, p_term_number, btrim(p_display_name), p_starts_on, p_ends_on)
  on conflict (academic_year_id, term_number)
  do update set display_name = excluded.display_name, starts_on = excluded.starts_on, ends_on = excluded.ends_on, updated_at = now()
  returning id into v_term_id;

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_year.tenant_id, v_year.school_id, auth.uid(), 'academic.term.configured', 'academic_term', v_term_id, jsonb_build_object('term_number', p_term_number));

  return v_term_id;
end;
$$;

create or replace function public.update_school_timetable_cycle(
  p_school_id uuid,
  p_cycle_mode text,
  p_cycle_length smallint
)
returns void
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_mode text := lower(btrim(coalesce(p_cycle_mode,'')));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.user_targets_current_school(auth.uid(),p_school_id)
     or not app_private.has_school_role(p_school_id,array['school_admin','principal']) then
    raise exception 'Permission denied';
  end if;

  if v_mode not in ('weekday','rotating') then raise exception 'Timetable cycle mode must be weekday or rotating'; end if;
  if p_cycle_length is null or p_cycle_length<1 or p_cycle_length>10 then raise exception 'Timetable cycle length must be between 1 and 10 days'; end if;
  if v_mode='weekday' and p_cycle_length>7 then raise exception 'Standard weekday timetable cycles cannot exceed 7 days'; end if;

  update public.schools
  set timetable_cycle_mode=v_mode,timetable_cycle_length=p_cycle_length,updated_at=now()
  where id=p_school_id and status='active';
  if not found then raise exception 'School not found or inactive'; end if;
end;
$$;

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
  if not app_private.has_platform_role(array['platform_admin']) and (
       not app_private.user_targets_current_school(auth.uid(),p_school_id)
       or not app_private.has_school_role(p_school_id,array['school_admin','principal'])
     ) then raise exception 'Permission denied'; end if;

  select * into v_school from public.schools where id=p_school_id and status='active';
  if not found then raise exception 'School not found or inactive'; end if;
  if v_school.timetable_cycle_mode <> 'rotating' then raise exception 'Calendar anchors apply only to rotating timetable cycles'; end if;
  if p_anchor_day is null or p_anchor_day < 1 or p_anchor_day > v_school.timetable_cycle_length then raise exception 'Anchor day must be inside this school''s configured timetable cycle'; end if;
  if p_anchor_date is null then raise exception 'Anchor date is required'; end if;

  select * into v_year from public.academic_years where school_id=p_school_id and year=p_academic_year;
  if not found then raise exception 'Configure the academic year before setting a timetable cycle anchor'; end if;
  if v_year.starts_on is not null and p_anchor_date < v_year.starts_on then raise exception 'Anchor date cannot be before the academic year starts'; end if;
  if v_year.ends_on is not null and p_anchor_date > v_year.ends_on then raise exception 'Anchor date cannot be after the academic year ends'; end if;
  if not app_private.is_expected_school_day(p_school_id,p_anchor_date) then raise exception 'Anchor date must be a configured school day'; end if;

  insert into public.timetable_cycle_anchors(tenant_id,school_id,academic_year,anchor_date,anchor_day,created_by_user_id)
  values(v_school.tenant_id,p_school_id,p_academic_year,p_anchor_date,p_anchor_day,auth.uid())
  on conflict (school_id,academic_year)
  do update set anchor_date=excluded.anchor_date,anchor_day=excluded.anchor_day,created_by_user_id=auth.uid(),updated_at=now()
  returning id into v_anchor_id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_school.tenant_id,p_school_id,auth.uid(),'timetable.cycle_anchor.configured','timetable_cycle_anchor',v_anchor_id,
    jsonb_build_object('academic_year',p_academic_year,'anchor_date',p_anchor_date,'anchor_day',p_anchor_day,'cycle_length',v_school.timetable_cycle_length));
  return v_anchor_id;
end;
$$;

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
declare v_school public.schools%rowtype; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_platform_role(array['platform_admin']) and (
       not app_private.user_targets_current_school(auth.uid(),p_school_id)
       or not app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])
     ) then raise exception 'Permission denied'; end if;
  if btrim(coalesce(p_display_name,''))='' then raise exception 'Bell schedule name is required'; end if;
  if p_effective_from is null then raise exception 'Bell schedule start date is required'; end if;
  if p_effective_to is not null and p_effective_to<p_effective_from then raise exception 'Bell schedule end date cannot be before start date'; end if;
  if p_applies_to_weekdays is null or cardinality(p_applies_to_weekdays)<1 or not (p_applies_to_weekdays <@ array[1,2,3,4,5,6,7]::smallint[]) then raise exception 'Choose at least one valid weekday'; end if;

  select * into v_school from public.schools where id=p_school_id and status='active';
  if not found then raise exception 'School not found or inactive'; end if;
  if not exists(select 1 from public.academic_years where school_id=p_school_id and year=p_academic_year) then raise exception 'Configure the academic year before creating a bell schedule'; end if;

  insert into public.timetable_bell_schedules(tenant_id,school_id,academic_year,display_name,effective_from,effective_to,applies_to_weekdays,created_by_user_id)
  values(v_school.tenant_id,p_school_id,p_academic_year,btrim(p_display_name),p_effective_from,p_effective_to,
    (select array_agg(distinct d order by d) from unnest(p_applies_to_weekdays) d),auth.uid()) returning id into v_id;
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
declare v_schedule public.timetable_bell_schedules%rowtype; v_period public.timetable_periods%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_schedule from public.timetable_bell_schedules where id=p_bell_schedule_id;
  if not found then raise exception 'Bell schedule not found'; end if;
  if not app_private.has_platform_role(array['platform_admin']) and (
       not app_private.user_targets_current_school(auth.uid(),v_schedule.school_id)
       or not app_private.has_school_role(v_schedule.school_id,array['school_admin','principal','deputy_principal'])
     ) then raise exception 'Permission denied'; end if;
  select * into v_period from public.timetable_periods where id=p_timetable_period_id;
  if not found or v_period.school_id<>v_schedule.school_id or v_period.academic_year<>v_schedule.academic_year then raise exception 'Timetable period is outside bell schedule school/year scope'; end if;
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
declare v_school public.schools%rowtype; v_impact text:=upper(btrim(coalesce(p_teaching_impact,''))); v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_platform_role(array['platform_admin']) and (
       not app_private.user_targets_current_school(auth.uid(),p_school_id)
       or not app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])
     ) then raise exception 'Permission denied'; end if;
  if v_impact not in ('NORMAL','NO_TEACHING','PARTIAL_DAY','ALTERED_TIMETABLE','EXAM_TIMETABLE') then raise exception 'Teaching impact is invalid'; end if;
  if p_source not in ('national','regional','school','emergency') then raise exception 'School-day source is invalid'; end if;
  if p_bell_schedule_id is not null and v_impact not in ('ALTERED_TIMETABLE','EXAM_TIMETABLE') then raise exception 'Bell schedule override is only valid for altered or exam timetable days'; end if;

  select * into v_school from public.schools where id=p_school_id and status='active';
  if not found then raise exception 'School not found or inactive'; end if;
  if p_bell_schedule_id is not null and not exists(
    select 1 from public.timetable_bell_schedules bs where bs.id=p_bell_schedule_id and bs.school_id=p_school_id
      and p_school_date between bs.effective_from and coalesce(bs.effective_to,'infinity'::date)
  ) then raise exception 'Selected bell schedule is not effective for this school and date'; end if;

  insert into public.school_day_overrides(tenant_id,school_id,school_date,is_school_day,reason,source,created_by_user_id,teaching_impact,bell_schedule_id)
  values(v_school.tenant_id,p_school_id,p_school_date,v_impact<>'NO_TEACHING',nullif(btrim(coalesce(p_reason,'')),''),p_source,auth.uid(),v_impact,p_bell_schedule_id)
  on conflict(school_id,school_date) do update set
    is_school_day=excluded.is_school_day,reason=excluded.reason,source=excluded.source,created_by_user_id=auth.uid(),
    teaching_impact=excluded.teaching_impact,bell_schedule_id=excluded.bell_schedule_id,updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.configure_academic_year(uuid,integer,date,date) from public,anon;
revoke all on function public.configure_academic_term(uuid,smallint,text,date,date) from public,anon;
revoke all on function public.update_school_timetable_cycle(uuid,text,smallint) from public,anon;
revoke all on function public.configure_timetable_cycle_anchor(uuid,integer,date,smallint) from public,anon;
revoke all on function public.upsert_timetable_bell_schedule(uuid,integer,text,date,date,smallint[]) from public,anon;
revoke all on function public.upsert_timetable_bell_schedule_period(uuid,uuid,time,time) from public,anon;
revoke all on function public.configure_school_teaching_day(uuid,date,text,text,uuid,text) from public,anon;
grant execute on function public.configure_academic_year(uuid,integer,date,date) to authenticated;
grant execute on function public.configure_academic_term(uuid,smallint,text,date,date) to authenticated;
grant execute on function public.update_school_timetable_cycle(uuid,text,smallint) to authenticated;
grant execute on function public.configure_timetable_cycle_anchor(uuid,integer,date,smallint) to authenticated;
grant execute on function public.upsert_timetable_bell_schedule(uuid,integer,text,date,date,smallint[]) to authenticated;
grant execute on function public.upsert_timetable_bell_schedule_period(uuid,uuid,time,time) to authenticated;
grant execute on function public.configure_school_teaching_day(uuid,date,text,text,uuid,text) to authenticated;

comment on function app_private.user_targets_current_school(uuid,uuid) is
'Deterministic current-school target check for school-local mutation boundaries; role authority remains enforced by the calling RPC.';
