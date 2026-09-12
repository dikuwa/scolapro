-- Review hardening for the academic/calendar lifecycle audit.
-- Preserve canonical mutation side effects and structural guards while binding school-local
-- leadership mutations to the deterministic current school. Existing platform_admin
-- overrides remain explicit where they already existed.

create or replace function public.activate_academic_year(p_academic_year_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_year public.academic_years%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_year from public.academic_years where id=p_academic_year_id for update;
  if not found then raise exception 'Academic year not found'; end if;
  if not app_private.has_platform_role(array['platform_admin']) and (
       not app_private.user_targets_current_school(auth.uid(),v_year.school_id)
       or not app_private.has_school_role(v_year.school_id,array['school_admin','principal','deputy_principal'])
     ) then raise exception 'Permission denied'; end if;
  if v_year.status='closed' then raise exception 'Closed academic years cannot be reactivated'; end if;
  if v_year.status='active' then return true; end if;
  if not exists(select 1 from public.grades g where g.school_id=v_year.school_id and g.academic_year=v_year.year) then
    raise exception 'Configure at least one grade before activating the academic year';
  end if;
  if not exists(select 1 from public.register_classes rc where rc.school_id=v_year.school_id and rc.academic_year=v_year.year) then
    raise exception 'Configure at least one register class before activating the academic year';
  end if;
  if exists(select 1 from public.academic_years ay where ay.school_id=v_year.school_id and ay.status='active' and ay.id<>v_year.id) then
    raise exception 'Another academic year is already active for this school';
  end if;

  update public.academic_years set status='active',updated_at=now() where id=v_year.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_year.tenant_id,v_year.school_id,auth.uid(),'academic.year.activated','academic_year',v_year.id,jsonb_build_object('year',v_year.year));
  return true;
end;
$$;

create or replace function public.close_academic_year(p_academic_year_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_year public.academic_years%rowtype;
  v_current_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_year from public.academic_years where id=p_academic_year_id for update;
  if not found then raise exception 'Academic year not found'; end if;
  if not app_private.has_platform_role(array['platform_admin']) and (
       not app_private.user_targets_current_school(auth.uid(),v_year.school_id)
       or not app_private.has_school_role(v_year.school_id,array['school_admin','principal','deputy_principal'])
     ) then raise exception 'Permission denied'; end if;
  if v_year.status='closed' then return true; end if;

  select count(*) into v_current_count
  from public.enrolments e
  where e.school_id=v_year.school_id and e.academic_year=v_year.year and e.status='current';
  if v_current_count>0 then
    raise exception 'Academic year cannot close while % learner enrolment(s) remain current',v_current_count;
  end if;

  update public.academic_terms set status='closed',updated_at=now()
  where school_id=v_year.school_id and academic_year_id=v_year.id and status<>'closed';
  update public.academic_years set status='closed',updated_at=now() where id=v_year.id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_year.tenant_id,v_year.school_id,auth.uid(),'academic.year.closed','academic_year',v_year.id,jsonb_build_object('year',v_year.year));
  return true;
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

  if v_mode not in ('weekday','rotating') then
    raise exception 'Timetable cycle mode must be weekday or rotating';
  end if;
  if p_cycle_length is null or p_cycle_length<1 or p_cycle_length>10 then
    raise exception 'Timetable cycle length must be between 1 and 10 days';
  end if;
  if v_mode='weekday' and p_cycle_length>7 then
    raise exception 'Standard weekday timetable cycles cannot exceed 7 days';
  end if;

  update public.schools
  set timetable_cycle_mode=v_mode,
      timetable_cycle_length=p_cycle_length,
      updated_at=now()
  where id=p_school_id and status='active';

  if not found then raise exception 'School not found or inactive'; end if;
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
declare
  v_school public.schools%rowtype;
  v_id uuid;
  v_weekdays smallint[];
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_platform_role(array['platform_admin']) and (
       not app_private.user_targets_current_school(auth.uid(),p_school_id)
       or not app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])
     ) then raise exception 'Permission denied'; end if;
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

  select array_agg(distinct d order by d) into v_weekdays
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
  if not app_private.has_platform_role(array['platform_admin']) and (
       not app_private.user_targets_current_school(auth.uid(),v_schedule.school_id)
       or not app_private.has_school_role(v_schedule.school_id,array['school_admin','principal','deputy_principal'])
     ) then raise exception 'Permission denied'; end if;
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

revoke all on function public.activate_academic_year(uuid) from public,anon;
revoke all on function public.close_academic_year(uuid) from public,anon;
revoke all on function public.update_school_timetable_cycle(uuid,text,smallint) from public,anon;
revoke all on function public.upsert_timetable_bell_schedule(uuid,integer,text,date,date,smallint[]) from public,anon;
revoke all on function public.upsert_timetable_bell_schedule_period(uuid,uuid,time,time) from public,anon;
revoke all on function public.configure_school_teaching_day(uuid,date,text,text,uuid,text) from public,anon;
grant execute on function public.activate_academic_year(uuid) to authenticated;
grant execute on function public.close_academic_year(uuid) to authenticated;
grant execute on function public.update_school_timetable_cycle(uuid,text,smallint) to authenticated;
grant execute on function public.upsert_timetable_bell_schedule(uuid,integer,text,date,date,smallint[]) to authenticated;
grant execute on function public.upsert_timetable_bell_schedule_period(uuid,uuid,time,time) to authenticated;
grant execute on function public.configure_school_teaching_day(uuid,date,text,text,uuid,text) to authenticated;
