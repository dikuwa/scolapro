-- Issue #1165: preserve official calendar provenance beneath school corrections
-- and allow governed school adjustments to be removed safely.

alter table public.school_day_overrides
  add column if not exists baseline_is_school_day boolean,
  add column if not exists baseline_reason text,
  add column if not exists baseline_source text,
  add column if not exists baseline_teaching_impact text,
  add column if not exists baseline_bell_schedule_id uuid references public.timetable_bell_schedules(id) on delete set null,
  add column if not exists baseline_created_by_user_id uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.school_day_overrides'::regclass
      and conname='school_day_overrides_baseline_source_check'
  ) then
    alter table public.school_day_overrides
      add constraint school_day_overrides_baseline_source_check
      check (baseline_source is null or baseline_source in ('national','regional'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.school_day_overrides'::regclass
      and conname='school_day_overrides_baseline_impact_check'
  ) then
    alter table public.school_day_overrides
      add constraint school_day_overrides_baseline_impact_check
      check (
        baseline_teaching_impact is null
        or baseline_teaching_impact in ('NORMAL','NO_TEACHING','PARTIAL_DAY','ALTERED_TIMETABLE','EXAM_TIMETABLE')
      );
  end if;
end;
$$;

update public.school_day_overrides
set baseline_is_school_day=is_school_day,
    baseline_reason=reason,
    baseline_source=source,
    baseline_teaching_impact=teaching_impact,
    baseline_bell_schedule_id=bell_schedule_id,
    baseline_created_by_user_id=created_by_user_id
where source in ('national','regional')
  and baseline_source is null;

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
set search_path=pg_catalog,public,app_private
as $$
declare
  v_school public.schools%rowtype;
  v_existing public.school_day_overrides%rowtype;
  v_impact text:=upper(btrim(coalesce(p_teaching_impact,'')));
  v_id uuid;
  v_baseline_is_school_day boolean;
  v_baseline_reason text;
  v_baseline_source text;
  v_baseline_teaching_impact text;
  v_baseline_bell_schedule_id uuid;
  v_baseline_created_by_user_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_platform_role(array['platform_admin']) and (
       not app_private.user_targets_current_school(auth.uid(),p_school_id)
       or not app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])
     ) then raise exception 'Permission denied'; end if;
  if v_impact not in ('NORMAL','NO_TEACHING','PARTIAL_DAY','ALTERED_TIMETABLE','EXAM_TIMETABLE') then
    raise exception 'Teaching impact is invalid';
  end if;
  if p_source not in ('national','regional','school','emergency') then
    raise exception 'School-day source is invalid';
  end if;
  if p_bell_schedule_id is not null and v_impact not in ('ALTERED_TIMETABLE','EXAM_TIMETABLE') then
    raise exception 'Bell schedule override is only valid for altered or exam timetable days';
  end if;

  select * into v_school from public.schools where id=p_school_id and status='active';
  if not found then raise exception 'School not found or inactive'; end if;
  if p_bell_schedule_id is not null and not exists(
    select 1 from public.timetable_bell_schedules bs
    where bs.id=p_bell_schedule_id and bs.school_id=p_school_id
      and p_school_date between bs.effective_from and coalesce(bs.effective_to,'infinity'::date)
  ) then
    raise exception 'Selected bell schedule is not effective for this school and date';
  end if;

  select * into v_existing
  from public.school_day_overrides
  where school_id=p_school_id and school_date=p_school_date
  for update;

  if found then
    v_baseline_is_school_day:=v_existing.baseline_is_school_day;
    v_baseline_reason:=v_existing.baseline_reason;
    v_baseline_source:=v_existing.baseline_source;
    v_baseline_teaching_impact:=v_existing.baseline_teaching_impact;
    v_baseline_bell_schedule_id:=v_existing.baseline_bell_schedule_id;
    v_baseline_created_by_user_id:=v_existing.baseline_created_by_user_id;

    if v_baseline_source is null
       and v_existing.source in ('national','regional')
       and p_source in ('school','emergency') then
      v_baseline_is_school_day:=v_existing.is_school_day;
      v_baseline_reason:=v_existing.reason;
      v_baseline_source:=v_existing.source;
      v_baseline_teaching_impact:=v_existing.teaching_impact;
      v_baseline_bell_schedule_id:=v_existing.bell_schedule_id;
      v_baseline_created_by_user_id:=v_existing.created_by_user_id;
    end if;
  end if;

  insert into public.school_day_overrides(
    tenant_id,school_id,school_date,is_school_day,reason,source,created_by_user_id,
    teaching_impact,bell_schedule_id,
    baseline_is_school_day,baseline_reason,baseline_source,baseline_teaching_impact,
    baseline_bell_schedule_id,baseline_created_by_user_id
  ) values (
    v_school.tenant_id,p_school_id,p_school_date,v_impact<>'NO_TEACHING',
    nullif(btrim(coalesce(p_reason,'')),''),p_source,auth.uid(),v_impact,p_bell_schedule_id,
    v_baseline_is_school_day,v_baseline_reason,v_baseline_source,v_baseline_teaching_impact,
    v_baseline_bell_schedule_id,v_baseline_created_by_user_id
  )
  on conflict(school_id,school_date) do update set
    is_school_day=excluded.is_school_day,
    reason=excluded.reason,
    source=excluded.source,
    created_by_user_id=auth.uid(),
    teaching_impact=excluded.teaching_impact,
    bell_schedule_id=excluded.bell_schedule_id,
    baseline_is_school_day=excluded.baseline_is_school_day,
    baseline_reason=excluded.baseline_reason,
    baseline_source=excluded.baseline_source,
    baseline_teaching_impact=excluded.baseline_teaching_impact,
    baseline_bell_schedule_id=excluded.baseline_bell_schedule_id,
    baseline_created_by_user_id=excluded.baseline_created_by_user_id,
    updated_at=now()
  returning id into v_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values (
    v_school.tenant_id,p_school_id,auth.uid(),'calendar.teaching_impact.changed',
    'school_day_override',v_id,
    jsonb_build_object(
      'school_date',p_school_date,
      'teaching_impact',v_impact,
      'reason',nullif(btrim(coalesce(p_reason,'')),''),
      'source',p_source,
      'bell_schedule_id',p_bell_schedule_id,
      'baseline_source',v_baseline_source,
      'preserved_official_baseline',v_baseline_source is not null
    )
  );

  return v_id;
end;
$$;

create or replace function public.remove_school_teaching_day_adjustment(
  p_school_id uuid,
  p_school_date date
)
returns text
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_school public.schools%rowtype;
  v_row public.school_day_overrides%rowtype;
  v_result text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_platform_role(array['platform_admin']) and (
       not app_private.user_targets_current_school(auth.uid(),p_school_id)
       or not app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])
     ) then raise exception 'Permission denied'; end if;

  select * into v_school from public.schools where id=p_school_id and status='active';
  if not found then raise exception 'School not found or inactive'; end if;

  select * into v_row
  from public.school_day_overrides
  where school_id=p_school_id and school_date=p_school_date
  for update;
  if not found then raise exception 'Calendar adjustment was not found'; end if;

  if v_row.source not in ('school','emergency') then
    raise exception 'Official national/regional calendar evidence cannot be deleted from a school. Add a school correction instead.';
  end if;

  if v_row.baseline_source is not null then
    update public.school_day_overrides
    set is_school_day=v_row.baseline_is_school_day,
        reason=v_row.baseline_reason,
        source=v_row.baseline_source,
        created_by_user_id=v_row.baseline_created_by_user_id,
        teaching_impact=v_row.baseline_teaching_impact,
        bell_schedule_id=v_row.baseline_bell_schedule_id,
        baseline_is_school_day=null,
        baseline_reason=null,
        baseline_source=null,
        baseline_teaching_impact=null,
        baseline_bell_schedule_id=null,
        baseline_created_by_user_id=null,
        updated_at=now()
    where id=v_row.id;
    v_result:='restored_baseline';
  else
    delete from public.school_day_overrides where id=v_row.id;
    v_result:='deleted';
  end if;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values (
    v_school.tenant_id,p_school_id,auth.uid(),'calendar.teaching_impact.removed',
    'school_day_override',v_row.id,
    jsonb_build_object(
      'school_date',p_school_date,
      'removed_source',v_row.source,
      'removed_teaching_impact',v_row.teaching_impact,
      'removed_reason',v_row.reason,
      'result',v_result,
      'restored_source',case when v_result='restored_baseline' then v_row.baseline_source else null end
    )
  );

  return v_result;
end;
$$;

revoke all on function public.configure_school_teaching_day(uuid,date,text,text,uuid,text) from public,anon;
grant execute on function public.configure_school_teaching_day(uuid,date,text,text,uuid,text) to authenticated;

revoke all on function public.remove_school_teaching_day_adjustment(uuid,date) from public,anon;
grant execute on function public.remove_school_teaching_day_adjustment(uuid,date) to authenticated;

comment on function public.remove_school_teaching_day_adjustment(uuid,date) is
'Removes a school/emergency learner-day adjustment. If the adjustment replaced national/regional evidence, the official baseline is restored instead of deleted.';
