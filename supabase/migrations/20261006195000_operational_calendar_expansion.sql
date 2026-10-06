-- Issue #1131: governed operational calendar expansion.
-- Extends the existing learner-calendar/attendance engine without creating a
-- parallel source of truth for school-day resolution.

create table if not exists public.academic_term_calendar_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_term_id uuid not null references public.academic_terms(id) on delete cascade,
  teacher_starts_on date,
  teacher_ends_on date,
  official_learner_day_count integer check (official_learner_day_count is null or official_learner_day_count between 0 and 366),
  source_kind text not null default 'manual' check (source_kind in ('official_source','manual','structured_import','ocr_review','recovery')),
  source_label text,
  source_reference text,
  configured_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academic_term_id),
  check (teacher_ends_on is null or teacher_starts_on is null or teacher_ends_on >= teacher_starts_on)
);

create index if not exists academic_term_calendar_profiles_school_idx
  on public.academic_term_calendar_profiles(school_id,academic_term_id);

alter table public.academic_term_calendar_profiles enable row level security;
revoke all on public.academic_term_calendar_profiles from anon,authenticated;
grant select on public.academic_term_calendar_profiles to authenticated;

drop policy if exists academic_term_calendar_profiles_read on public.academic_term_calendar_profiles;
create policy academic_term_calendar_profiles_read
on public.academic_term_calendar_profiles for select to authenticated
using (app_private.has_school_access(school_id));

create table if not exists public.operational_calendar_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  scope_kind text not null check (scope_kind in ('school','department')),
  event_kind text not null check (event_kind in (
    'event','deadline','meeting','class_visit','assessment','submission',
    'examination','school_activity','teaching_cutoff','ceremony','sport','other'
  )),
  title text not null check (char_length(btrim(title)) between 1 and 180),
  starts_on date not null,
  ends_on date not null,
  starts_at time,
  ends_at time,
  audience_scope text not null default 'all_school' check (audience_scope in (
    'all_school','all_staff','teachers','learners','parents','department_staff','specific_teacher'
  )),
  department_head_staff_assignment_id uuid references public.staff_school_assignments(id) on delete restrict,
  target_staff_member_id uuid references public.staff_members(id) on delete restrict,
  description text,
  learner_day_effect text not null default 'UNCHANGED' check (learner_day_effect in (
    'UNCHANGED','NO_TEACHING','SCHOOL_DAY','PARTIAL_DAY','ALTERED_TIMETABLE','EXAM_TIMETABLE'
  )),
  bell_schedule_id uuid references public.timetable_bell_schedules(id) on delete restrict,
  learner_calendar_event_id uuid references public.learner_calendar_events(id) on delete restrict,
  linked_module text,
  linked_path text,
  source_kind text not null default 'manual' check (source_kind in ('manual','ocr_review','structured_import')),
  source_reference text,
  source_intake_job_id uuid references public.document_intake_jobs(id) on delete restrict,
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active','cancelled')),
  supersedes_event_id uuid references public.operational_calendar_events(id) on delete restrict,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  check ((starts_at is null and ends_at is null) or (starts_at is not null and ends_at is not null and ends_at > starts_at)),
  check ((scope_kind='school' and department_head_staff_assignment_id is null)
    or (scope_kind='department' and department_head_staff_assignment_id is not null)),
  check ((audience_scope='specific_teacher' and target_staff_member_id is not null)
    or (audience_scope<>'specific_teacher')),
  check (bell_schedule_id is null or learner_day_effect in ('ALTERED_TIMETABLE','EXAM_TIMETABLE')),
  check (supersedes_event_id is null or supersedes_event_id<>id)
);

create index if not exists operational_calendar_events_school_dates_idx
  on public.operational_calendar_events(school_id,academic_year,starts_on,ends_on);
create index if not exists operational_calendar_events_department_idx
  on public.operational_calendar_events(department_head_staff_assignment_id,starts_on,ends_on)
  where scope_kind='department';
create unique index if not exists operational_calendar_events_supersedes_once_idx
  on public.operational_calendar_events(supersedes_event_id)
  where supersedes_event_id is not null;

alter table public.operational_calendar_events enable row level security;
revoke all on public.operational_calendar_events from anon,authenticated;
grant select on public.operational_calendar_events to authenticated;

drop policy if exists operational_calendar_events_school_read on public.operational_calendar_events;
create policy operational_calendar_events_school_read
on public.operational_calendar_events for select to authenticated
using (app_private.has_school_access(school_id));

create or replace view public.effective_operational_calendar_events
with (security_invoker=true)
as
select event.*
from public.operational_calendar_events event
where event.lifecycle_status='active'
  and not exists (
    select 1
    from public.operational_calendar_events revision
    where revision.supersedes_event_id=event.id
  );

revoke all on public.effective_operational_calendar_events from anon,authenticated;
grant select on public.effective_operational_calendar_events to authenticated;

create or replace function app_private.can_manage_department_calendar(
  p_school_id uuid,
  p_department_head_staff_assignment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select
    app_private.user_targets_current_school(auth.uid(),p_school_id)
    and (
      app_private.has_platform_role(array['platform_admin'])
      or app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])
      or (
        app_private.has_school_role(p_school_id,array['hod'])
        and exists (
          select 1
          from public.staff_school_assignments ssa
          join public.school_memberships sm
            on sm.school_id=ssa.school_id
           and sm.staff_member_id=ssa.staff_member_id
           and sm.user_id=auth.uid()
           and sm.active_from<=current_date
           and (sm.active_to is null or sm.active_to>=current_date)
          where ssa.id=p_department_head_staff_assignment_id
            and ssa.school_id=p_school_id
            and ssa.effective_from<=current_date
            and (ssa.effective_to is null or ssa.effective_to>=current_date)
        )
        and exists (
          select 1
          from public.subject_department_responsibilities sdr
          where sdr.school_id=p_school_id
            and sdr.department_head_staff_assignment_id=p_department_head_staff_assignment_id
            and sdr.effective_from<=current_date
            and (sdr.effective_to is null or sdr.effective_to>=current_date)
        )
      )
    );
$$;

revoke all on function app_private.can_manage_department_calendar(uuid,uuid) from public,anon,authenticated;
grant execute on function app_private.can_manage_department_calendar(uuid,uuid) to authenticated;

create or replace function public.configure_academic_term_calendar_profile(
  p_academic_term_id uuid,
  p_teacher_starts_on date default null,
  p_teacher_ends_on date default null,
  p_official_learner_day_count integer default null,
  p_source_kind text default 'manual',
  p_source_label text default null,
  p_source_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_term public.academic_terms%rowtype;
  v_school public.schools%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_term from public.academic_terms where id=p_academic_term_id;
  if not found then raise exception 'Academic term not found'; end if;
  if not app_private.user_targets_current_school(auth.uid(),v_term.school_id)
     or not app_private.has_school_role(v_term.school_id,array['school_admin','principal','deputy_principal']) then
    raise exception 'Permission denied';
  end if;
  if p_source_kind not in ('official_source','manual','structured_import','ocr_review','recovery') then
    raise exception 'Calendar profile source is invalid';
  end if;
  if p_teacher_starts_on is not null and p_teacher_ends_on is not null and p_teacher_ends_on<p_teacher_starts_on then
    raise exception 'Teacher closing date cannot precede teacher opening date';
  end if;
  if p_official_learner_day_count is not null and (p_official_learner_day_count<0 or p_official_learner_day_count>366) then
    raise exception 'Official learner day count is invalid';
  end if;

  select * into v_school from public.schools where id=v_term.school_id;

  insert into public.academic_term_calendar_profiles(
    tenant_id,school_id,academic_term_id,teacher_starts_on,teacher_ends_on,
    official_learner_day_count,source_kind,source_label,source_reference,configured_by_user_id
  ) values(
    v_term.tenant_id,v_term.school_id,v_term.id,p_teacher_starts_on,p_teacher_ends_on,
    p_official_learner_day_count,p_source_kind,
    nullif(btrim(coalesce(p_source_label,'')),''),
    nullif(btrim(coalesce(p_source_reference,'')),''),
    auth.uid()
  )
  on conflict(academic_term_id) do update set
    teacher_starts_on=excluded.teacher_starts_on,
    teacher_ends_on=excluded.teacher_ends_on,
    official_learner_day_count=excluded.official_learner_day_count,
    source_kind=excluded.source_kind,
    source_label=excluded.source_label,
    source_reference=excluded.source_reference,
    configured_by_user_id=auth.uid(),
    updated_at=now()
  returning id into v_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_school.tenant_id,v_school.id,auth.uid(),'calendar.term_profile.configured',
    'academic_term_calendar_profile',v_id,
    jsonb_build_object(
      'academic_term_id',v_term.id,
      'teacher_starts_on',p_teacher_starts_on,
      'teacher_ends_on',p_teacher_ends_on,
      'official_learner_day_count',p_official_learner_day_count,
      'source_kind',p_source_kind,
      'source_label',nullif(btrim(coalesce(p_source_label,'')),''),
      'source_reference',nullif(btrim(coalesce(p_source_reference,'')),'')
    )
  );

  return v_id;
end;
$$;

revoke all on function public.configure_academic_term_calendar_profile(uuid,date,date,integer,text,text,text) from public,anon;
grant execute on function public.configure_academic_term_calendar_profile(uuid,date,date,integer,text,text,text) to authenticated;

-- Academic terms are the normal learner-register boundary. Explicit school-day
-- overrides remain authoritative and can create an approved special day outside
-- the normal term/weekday baseline.
create or replace function app_private.is_expected_school_day(target_school_id uuid,target_date date)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select coalesce(
    (select sdo.is_school_day
       from public.school_day_overrides sdo
      where sdo.school_id=target_school_id
        and sdo.school_date=target_date),
    case
      when not exists (
        select 1
        from public.academic_terms term
        join public.academic_years year on year.id=term.academic_year_id
        where term.school_id=target_school_id
          and term.starts_on is not null
          and term.ends_on is not null
          and target_date between term.starts_on and term.ends_on
          and year.status in ('setup','active','closed')
      ) then false
      when app_private.resolve_learner_event_teaching_impact(target_school_id,target_date)='NO_TEACHING' then false
      else extract(isodow from target_date) between 1 and 5
    end
  );
$$;

revoke all on function app_private.is_expected_school_day(uuid,date) from public,anon;
grant execute on function app_private.is_expected_school_day(uuid,date) to authenticated;

create or replace function public.list_academic_term_calendar_summary(
  p_school_id uuid,
  p_academic_year integer
)
returns table(
  academic_term_id uuid,
  term_number smallint,
  term_name text,
  learner_starts_on date,
  learner_ends_on date,
  teacher_starts_on date,
  teacher_ends_on date,
  official_learner_day_count integer,
  calculated_learner_day_count integer,
  source_label text,
  source_reference text
)
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select
    term.id,
    term.term_number,
    term.display_name,
    term.starts_on,
    term.ends_on,
    profile.teacher_starts_on,
    profile.teacher_ends_on,
    profile.official_learner_day_count,
    case
      when term.starts_on is null or term.ends_on is null then 0
      else (
        select count(*)::integer
        from generate_series(term.starts_on,term.ends_on,interval '1 day') generated(day_value)
        where app_private.is_expected_school_day(p_school_id,generated.day_value::date)
      )
    end,
    profile.source_label,
    profile.source_reference
  from public.academic_terms term
  join public.academic_years year on year.id=term.academic_year_id
  left join public.academic_term_calendar_profiles profile on profile.academic_term_id=term.id
  where term.school_id=p_school_id
    and year.year=p_academic_year
    and app_private.has_school_access(p_school_id)
  order by term.term_number;
$$;

revoke all on function public.list_academic_term_calendar_summary(uuid,integer) from public,anon;
grant execute on function public.list_academic_term_calendar_summary(uuid,integer) to authenticated;

create or replace function public.create_operational_calendar_event(
  p_school_id uuid,
  p_academic_year integer,
  p_scope_kind text,
  p_event_kind text,
  p_title text,
  p_starts_on date,
  p_ends_on date,
  p_starts_at time default null,
  p_ends_at time default null,
  p_audience_scope text default 'all_school',
  p_department_head_staff_assignment_id uuid default null,
  p_target_staff_member_id uuid default null,
  p_description text default null,
  p_learner_day_effect text default 'UNCHANGED',
  p_bell_schedule_id uuid default null,
  p_linked_module text default null,
  p_linked_path text default null,
  p_source_kind text default 'manual',
  p_source_reference text default null,
  p_source_intake_job_id uuid default null,
  p_supersedes_event_id uuid default null,
  p_lifecycle_status text default 'active'
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_school public.schools%rowtype;
  v_id uuid;
  v_learner_event_id uuid;
  v_effect text:=upper(btrim(coalesce(p_learner_day_effect,'UNCHANGED')));
  v_day date;
  v_description text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_scope_kind not in ('school','department') then raise exception 'Calendar event scope is invalid'; end if;
  if p_event_kind not in (
    'event','deadline','meeting','class_visit','assessment','submission',
    'examination','school_activity','teaching_cutoff','ceremony','sport','other'
  ) then raise exception 'Calendar event kind is invalid'; end if;
  if p_audience_scope not in (
    'all_school','all_staff','teachers','learners','parents','department_staff','specific_teacher'
  ) then raise exception 'Calendar event audience is invalid'; end if;
  if v_effect not in ('UNCHANGED','NO_TEACHING','SCHOOL_DAY','PARTIAL_DAY','ALTERED_TIMETABLE','EXAM_TIMETABLE') then
    raise exception 'Learner-day effect is invalid';
  end if;
  if p_source_kind not in ('manual','ocr_review','structured_import') then raise exception 'Calendar event source is invalid'; end if;
  if p_lifecycle_status not in ('active','cancelled') then raise exception 'Calendar lifecycle status is invalid'; end if;
  if btrim(coalesce(p_title,''))='' then raise exception 'Calendar event title is required'; end if;
  if p_ends_on<p_starts_on then raise exception 'Calendar event end date cannot precede start date'; end if;
  if (p_starts_at is null)<>(p_ends_at is null) then raise exception 'Provide both event times or neither'; end if;
  if p_starts_at is not null and p_ends_at<=p_starts_at then raise exception 'Calendar event end time must be after start time'; end if;

  select * into v_school from public.schools where id=p_school_id and status='active';
  if not found then raise exception 'School not found or inactive'; end if;
  if not exists(select 1 from public.academic_years year where year.school_id=p_school_id and year.year=p_academic_year) then
    raise exception 'Academic year is not configured';
  end if;

  if p_scope_kind='school' then
    if p_department_head_staff_assignment_id is not null then raise exception 'School events cannot carry a department assignment'; end if;
    if not app_private.user_targets_current_school(auth.uid(),p_school_id)
       or not app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal']) then
      raise exception 'Permission denied';
    end if;
  else
    if p_department_head_staff_assignment_id is null then raise exception 'Department events require a governed HOD assignment'; end if;
    if not app_private.can_manage_department_calendar(p_school_id,p_department_head_staff_assignment_id) then
      raise exception 'Permission denied for this department calendar';
    end if;
    if v_effect<>'UNCHANGED' then raise exception 'Department events cannot change learner school-day status'; end if;
  end if;

  if p_audience_scope='specific_teacher' and p_target_staff_member_id is null then
    raise exception 'Specific-teacher events require a target teacher';
  end if;
  if p_target_staff_member_id is not null and not exists(
    select 1
    from public.staff_school_assignments ssa
    where ssa.school_id=p_school_id
      and ssa.staff_member_id=p_target_staff_member_id
      and ssa.effective_from<=p_ends_on
      and (ssa.effective_to is null or ssa.effective_to>=p_starts_on)
  ) then raise exception 'Target teacher is outside the school/date scope'; end if;

  if p_scope_kind='department' and p_target_staff_member_id is not null and not exists(
    select 1
    from public.subject_department_responsibilities sdr
    join public.subject_offerings so
      on so.school_id=sdr.school_id
     and so.subject_id=sdr.subject_id
     and so.academic_year=p_academic_year
    join public.teacher_allocations ta
      on ta.school_id=so.school_id
     and ta.subject_offering_id=so.id
     and ta.academic_year=p_academic_year
     and ta.staff_member_id=p_target_staff_member_id
    where sdr.school_id=p_school_id
      and sdr.department_head_staff_assignment_id=p_department_head_staff_assignment_id
      and sdr.effective_from<=p_ends_on
      and (sdr.effective_to is null or sdr.effective_to>=p_starts_on)
      and ta.active_from<=p_ends_on
      and (ta.active_to is null or ta.active_to>=p_starts_on)
  ) then raise exception 'Target teacher is outside this governed department'; end if;

  if p_bell_schedule_id is not null and v_effect not in ('ALTERED_TIMETABLE','EXAM_TIMETABLE') then
    raise exception 'Bell schedule is only valid for altered/exam learner-day effects';
  end if;

  insert into public.operational_calendar_events(
    tenant_id,school_id,academic_year,scope_kind,event_kind,title,starts_on,ends_on,
    starts_at,ends_at,audience_scope,department_head_staff_assignment_id,target_staff_member_id,
    description,learner_day_effect,bell_schedule_id,linked_module,linked_path,
    source_kind,source_reference,source_intake_job_id,lifecycle_status,supersedes_event_id,created_by_user_id
  ) values(
    v_school.tenant_id,p_school_id,p_academic_year,p_scope_kind,p_event_kind,btrim(p_title),p_starts_on,p_ends_on,
    p_starts_at,p_ends_at,p_audience_scope,p_department_head_staff_assignment_id,p_target_staff_member_id,
    nullif(btrim(coalesce(p_description,'')),''),
    v_effect,p_bell_schedule_id,
    nullif(btrim(coalesce(p_linked_module,'')),''),
    nullif(btrim(coalesce(p_linked_path,'')),''),
    p_source_kind,nullif(btrim(coalesce(p_source_reference,'')),''),
    p_source_intake_job_id,p_lifecycle_status,p_supersedes_event_id,auth.uid()
  ) returning id into v_id;

  if p_scope_kind='school' and p_lifecycle_status='active' and v_effect='SCHOOL_DAY' then
    for v_day in select generated::date from generate_series(p_starts_on,p_ends_on,interval '1 day') generated
    loop
      perform public.configure_school_teaching_day(
        p_school_id,v_day,'NORMAL',
        concat('Special school day: ',btrim(p_title)),
        null,'school'
      );
    end loop;
  elsif p_scope_kind='school' and p_lifecycle_status='active' and v_effect<>'UNCHANGED' then
    v_description:=concat_ws(
      E'\n',
      nullif(btrim(coalesce(p_description,'')),''),
      format('[Operational calendar event %s]',v_id)
    );
    select public.create_school_learner_calendar_event(
      p_school_id,p_academic_year,btrim(p_title),
      case when p_event_kind='school_activity' then 'School programme' else initcap(replace(p_event_kind,'_',' ')) end,
      p_starts_on,p_ends_on,p_starts_at,p_ends_at,
      'all_learners',null,v_description,
      v_effect,p_bell_schedule_id,null,'active'
    ) into v_learner_event_id;

    update public.operational_calendar_events
    set learner_calendar_event_id=v_learner_event_id
    where id=v_id;
  end if;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_school.tenant_id,p_school_id,auth.uid(),'calendar.operational_event.created',
    'operational_calendar_event',v_id,
    jsonb_build_object(
      'academic_year',p_academic_year,
      'scope_kind',p_scope_kind,
      'event_kind',p_event_kind,
      'starts_on',p_starts_on,
      'ends_on',p_ends_on,
      'audience_scope',p_audience_scope,
      'learner_day_effect',v_effect,
      'department_head_staff_assignment_id',p_department_head_staff_assignment_id,
      'target_staff_member_id',p_target_staff_member_id,
      'source_kind',p_source_kind,
      'source_intake_job_id',p_source_intake_job_id,
      'learner_calendar_event_id',v_learner_event_id
    )
  );

  return v_id;
end;
$$;

revoke all on function public.create_operational_calendar_event(
  uuid,integer,text,text,text,date,date,time,time,text,uuid,uuid,text,text,uuid,text,text,text,text,uuid,uuid,text
) from public,anon;
grant execute on function public.create_operational_calendar_event(
  uuid,integer,text,text,text,date,date,time,time,text,uuid,uuid,text,text,uuid,text,text,text,text,uuid,uuid,text
) to authenticated;

create or replace function public.list_my_operational_calendar_events(
  p_school_id uuid,
  p_from date,
  p_to date
)
returns table(
  event_id uuid,
  scope_kind text,
  event_kind text,
  title text,
  starts_on date,
  ends_on date,
  starts_at time,
  ends_at time,
  audience_scope text,
  description text,
  learner_day_effect text,
  department_label text,
  target_staff_member_id uuid,
  linked_path text
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_staff_member_id uuid;
  v_is_leadership boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.user_targets_current_school(auth.uid(),p_school_id) then raise exception 'Permission denied'; end if;

  select sm.staff_member_id into v_staff_member_id
  from public.school_memberships sm
  where sm.school_id=p_school_id
    and sm.user_id=auth.uid()
    and sm.active_from<=current_date
    and (sm.active_to is null or sm.active_to>=current_date)
    and sm.staff_member_id is not null
  order by case sm.role_key
    when 'principal' then 1 when 'deputy_principal' then 2 when 'school_admin' then 3
    when 'hod' then 4 when 'class_teacher' then 5 when 'teacher' then 6 else 9 end
  limit 1;

  v_is_leadership:=app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal']);

  return query
  select
    e.id,e.scope_kind,e.event_kind,e.title,e.starts_on,e.ends_on,e.starts_at,e.ends_at,
    e.audience_scope,e.description,e.learner_day_effect,
    case when e.scope_kind='department' then coalesce((
      select max(nullif(btrim(sdr.department_label),''))
      from public.subject_department_responsibilities sdr
      where sdr.school_id=e.school_id
        and sdr.department_head_staff_assignment_id=e.department_head_staff_assignment_id
        and sdr.effective_from<=e.ends_on
        and (sdr.effective_to is null or sdr.effective_to>=e.starts_on)
    ),'Department') else null end,
    e.target_staff_member_id,e.linked_path
  from public.effective_operational_calendar_events e
  where e.school_id=p_school_id
    and e.ends_on>=p_from
    and e.starts_on<=p_to
    and (
      v_is_leadership
      or e.scope_kind='school'
      or (
        e.scope_kind='department'
        and (
          app_private.can_manage_department_calendar(p_school_id,e.department_head_staff_assignment_id)
          or (
            v_staff_member_id is not null
            and (e.target_staff_member_id is null or e.target_staff_member_id=v_staff_member_id)
            and exists(
              select 1
              from public.subject_department_responsibilities sdr
              join public.subject_offerings so
                on so.school_id=sdr.school_id
               and so.subject_id=sdr.subject_id
               and so.academic_year=e.academic_year
              join public.teacher_allocations ta
                on ta.school_id=so.school_id
               and ta.subject_offering_id=so.id
               and ta.academic_year=e.academic_year
               and ta.staff_member_id=v_staff_member_id
              where sdr.school_id=e.school_id
                and sdr.department_head_staff_assignment_id=e.department_head_staff_assignment_id
                and sdr.effective_from<=e.ends_on
                and (sdr.effective_to is null or sdr.effective_to>=e.starts_on)
                and ta.active_from<=e.ends_on
                and (ta.active_to is null or ta.active_to>=e.starts_on)
            )
          )
        )
      )
    )
  order by e.starts_on,e.starts_at nulls first,e.title;
end;
$$;

revoke all on function public.list_my_operational_calendar_events(uuid,date,date) from public,anon;
grant execute on function public.list_my_operational_calendar_events(uuid,date,date) to authenticated;

-- Source-backed 2026 Namib High baseline from the Control Room supplied
-- Republic of Namibia / Ministry Government Schools calendar. This recovery is
-- intentionally bounded to the already-governed Namib High 2026 calendar.
do $seed$
declare
  v_school_id constant uuid := '22222222-2222-4222-8222-222222222222';
  v_tenant_id constant uuid := '11111111-1111-4111-8111-111111111111';
  v_year_id uuid;
  v_term record;
begin
  if exists(
    select 1
    from public.schools
    where id=v_school_id
      and tenant_id=v_tenant_id
      and name='Namib High School'
      and status='active'
  ) then
    select id into v_year_id
    from public.academic_years
    where school_id=v_school_id and year=2026;

    if v_year_id is not null then
      for v_term in
        select term.id,term.term_number
        from public.academic_terms term
        where term.academic_year_id=v_year_id
      loop
        insert into public.academic_term_calendar_profiles(
          tenant_id,school_id,academic_term_id,teacher_starts_on,teacher_ends_on,
          official_learner_day_count,source_kind,source_label,source_reference,configured_by_user_id
        ) values(
          v_tenant_id,v_school_id,v_term.id,
          case v_term.term_number
            when 1 then date '2026-01-08'
            when 2 then date '2026-05-29'
            when 3 then date '2026-09-03'
          end,
          case v_term.term_number
            when 1 then date '2026-04-30'
            when 2 then date '2026-08-21'
            when 3 then date '2026-12-08'
          end,
          case v_term.term_number when 1 then 75 when 2 then 59 when 3 then 65 end,
          'official_source',
          'Republic of Namibia / Ministry 2026 Calendar for Government Schools',
          'Control Room supplied official 2026 government-school calendar',
          null
        )
        on conflict(academic_term_id) do nothing;
      end loop;

      insert into public.school_day_overrides(
        tenant_id,school_id,school_date,is_school_day,reason,source,created_by_user_id,
        teaching_impact,bell_schedule_id
      ) values
        (v_tenant_id,v_school_id,date '2026-04-03',false,'Public Holiday - Good Friday','national',null,'NO_TEACHING',null),
        (v_tenant_id,v_school_id,date '2026-04-06',false,'Public Holiday - Easter Monday','national',null,'NO_TEACHING',null),
        (v_tenant_id,v_school_id,date '2026-10-05',false,'School Holiday - International Teacher''s Day','national',null,'NO_TEACHING',null)
      on conflict(school_id,school_date) do update set
        is_school_day=excluded.is_school_day,
        reason=excluded.reason,
        source=excluded.source,
        teaching_impact=excluded.teaching_impact,
        bell_schedule_id=null,
        updated_at=now();

      insert into public.audit_events(
        tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
      )
      select
        v_tenant_id,v_school_id,null,'calendar.official_2026_source_applied',
        'academic_year',v_year_id,
        jsonb_build_object(
          'learner_term_days',jsonb_build_array(75,59,65),
          'learner_total_days',199,
          'teacher_term_opening',jsonb_build_array('2026-01-08','2026-05-29','2026-09-03'),
          'teacher_term_closing',jsonb_build_array('2026-04-30','2026-08-21','2026-12-08'),
          'non_school_days',jsonb_build_array('2026-04-03','2026-04-06','2026-10-05'),
          'source','Control Room supplied Republic of Namibia / Ministry 2026 Calendar for Government Schools'
        )
      where not exists(
        select 1
        from public.audit_events ae
        where ae.school_id=v_school_id
          and ae.event_type='calendar.official_2026_source_applied'
          and ae.entity_id=v_year_id
      );
    end if;
  end if;
end;
$seed$;

comment on table public.academic_term_calendar_profiles is
'Term-level official calendar metadata layered onto canonical academic_terms. Learner term dates remain canonical in academic_terms; teacher dates and published learner-day counts are comparison metadata.';
comment on table public.operational_calendar_events is
'School and HOD/department operational events. Informational by default; only explicit school-scope learner_day_effect creates/changes learner teaching-day behavior.';
comment on function public.list_academic_term_calendar_summary(uuid,integer) is
'Compares published learner-day totals with resolved operational school days. Attendance/register logic uses the resolved count, never the published number alone.';
comment on function public.list_my_operational_calendar_events(uuid,date,date) is
'Role- and department-scoped staff calendar feed for compact upcoming-event surfaces.';


-- Calendar scan/OCR rows are deliberately staged through the existing intake
-- table. Only rows explicitly tagged as operational calendar candidates commit
-- to operational_calendar_events; legacy structured calendar rows keep the
-- existing learner-calendar commit path.
create or replace function public.commit_operational_intake_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_job public.document_intake_jobs%rowtype;
  v_row public.document_intake_adapter_rows%rowtype;
  v_entity_id uuid;
  v_committed integer:=0;
  v_skipped integer:=0;
  v_description text;
  v_event_kind text;
  v_learner_effect text;
  v_source_kind text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_job
  from public.document_intake_jobs
  where id=p_job_id
  for update;

  if not found or v_job.intake_type not in ('calendar','timetable') then raise exception 'Operational intake job not found'; end if;
  if not app_private.can_manage_document_intake(v_job.school_id,v_job.intake_type) then raise exception 'Permission denied'; end if;
  if v_job.status='committed' then
    return jsonb_build_object('job_id',v_job.id,'already_committed',true);
  end if;
  if v_job.status<>'ready' then raise exception 'Operational intake job must be fully reviewed before commit'; end if;
  if exists(select 1 from public.document_intake_adapter_rows r where r.job_id=v_job.id and r.review_decision='pending') then
    raise exception 'Every operational intake row requires a human review decision';
  end if;

  for v_row in
    select * from public.document_intake_adapter_rows
    where job_id=v_job.id
    order by row_number,id
    for update
  loop
    if v_row.review_decision='ignore' then
      update public.document_intake_adapter_rows
      set commit_status='skipped',updated_at=now()
      where id=v_row.id;
      v_skipped:=v_skipped+1;
      continue;
    end if;

    if v_job.intake_type='calendar' then
      v_description:=nullif(btrim(coalesce(v_row.normalized_payload->>'description','')),'');
      v_description:=concat_ws(
        E'\n',
        v_description,
        format(
          '[Imported via intake %s · source class %s · source row %s]',
          v_job.id,
          coalesce(v_row.source_class,'school'),
          v_row.row_number
        )
      );

      if coalesce(v_row.source_payload->>'calendar_target','')='operational' then
        v_event_kind:=case lower(btrim(coalesce(v_row.normalized_payload->>'category','')))
          when 'meeting' then 'meeting'
          when 'assessment' then 'assessment'
          when 'examination' then 'examination'
          when 'deadline' then 'deadline'
          when 'teaching cutoff' then 'teaching_cutoff'
          when 'class visit' then 'class_visit'
          when 'submission' then 'submission'
          when 'ceremony' then 'ceremony'
          when 'sport' then 'sport'
          when 'school activity' then 'school_activity'
          when 'school holiday' then 'school_activity'
          when 'public holiday' then 'school_activity'
          when 'other' then 'other'
          else 'event'
        end;

        v_learner_effect:=case upper(coalesce(v_row.normalized_payload->>'teaching_impact','NORMAL'))
          when 'NO_TEACHING' then 'NO_TEACHING'
          when 'PARTIAL_DAY' then 'PARTIAL_DAY'
          when 'ALTERED_TIMETABLE' then 'ALTERED_TIMETABLE'
          when 'EXAM_TIMETABLE' then 'EXAM_TIMETABLE'
          else 'UNCHANGED'
        end;

        v_source_kind:=case
          when v_job.source_kind='structured_import' then 'structured_import'
          else 'ocr_review'
        end;

        select public.create_operational_calendar_event(
          v_job.school_id,
          v_job.academic_year,
          'school',
          v_event_kind,
          v_row.normalized_payload->>'title',
          (v_row.normalized_payload->>'starts_on')::date,
          (v_row.normalized_payload->>'ends_on')::date,
          nullif(v_row.normalized_payload->>'starts_at','')::time,
          nullif(v_row.normalized_payload->>'ends_at','')::time,
          'all_school',
          null,
          null,
          v_description,
          v_learner_effect,
          nullif(v_row.normalized_payload->>'bell_schedule_id','')::uuid,
          null,
          null,
          v_source_kind,
          concat('Document intake ',v_job.id,' · row ',v_row.row_number),
          v_job.id,
          null,
          'active'
        ) into v_entity_id;
      else
        select public.create_school_learner_calendar_event(
          v_job.school_id,
          v_job.academic_year,
          v_row.normalized_payload->>'title',
          v_row.normalized_payload->>'category',
          (v_row.normalized_payload->>'starts_on')::date,
          (v_row.normalized_payload->>'ends_on')::date,
          nullif(v_row.normalized_payload->>'starts_at','')::time,
          nullif(v_row.normalized_payload->>'ends_at','')::time,
          coalesce(nullif(v_row.normalized_payload->>'audience_scope',''),'all_learners'),
          nullif(v_row.normalized_payload->>'audience_reference_id','')::uuid,
          v_description,
          coalesce(nullif(v_row.normalized_payload->>'teaching_impact',''),'NORMAL'),
          nullif(v_row.normalized_payload->>'bell_schedule_id','')::uuid,
          case when v_row.review_decision='update' then v_row.matched_entity_id else null end,
          'active'
        ) into v_entity_id;
      end if;
    else
      if v_row.review_decision<>'create' then
        raise exception 'Timetable intake rows can only create canonical slots or be ignored';
      end if;

      select public.create_timetable_slot(
        v_job.school_id,
        v_job.academic_year,
        v_row.normalized_payload->>'cycle_code',
        (v_row.normalized_payload->>'weekday')::smallint,
        (v_row.normalized_payload->>'period_id')::uuid,
        (v_row.normalized_payload->>'register_class_id')::uuid,
        (v_row.normalized_payload->>'teacher_allocation_id')::uuid,
        nullif(v_row.normalized_payload->>'room_label','')
      ) into v_entity_id;
    end if;

    update public.document_intake_adapter_rows
    set commit_status='committed',
        committed_entity_id=v_entity_id,
        error_message=null,
        updated_at=now()
    where id=v_row.id;
    v_committed:=v_committed+1;
  end loop;

  update public.document_intake_jobs
  set status='committed',
      committed_entity_type=case when intake_type='calendar' then 'calendar_event_batch' else 'timetable_slot_batch' end,
      committed_entity_id=id,
      committed_by_user_id=auth.uid(),
      committed_at=now(),
      updated_at=now()
  where id=v_job.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_job.tenant_id,v_job.school_id,auth.uid(),
    'document_intake.committed','document_intake_job',v_job.id,
    jsonb_build_object(
      'intake_type',v_job.intake_type,
      'committed_rows',v_committed,
      'skipped_rows',v_skipped,
      'source_kind',v_job.source_kind
    )
  );

  return jsonb_build_object(
    'job_id',v_job.id,
    'intake_type',v_job.intake_type,
    'committed_rows',v_committed,
    'skipped_rows',v_skipped
  );
end;
$$;

revoke all on function public.commit_operational_intake_job(uuid) from public,anon;
grant execute on function public.commit_operational_intake_job(uuid) to authenticated;

comment on function public.commit_operational_intake_job(uuid) is
'Commits fully reviewed calendar/timetable intake. OCR-tagged school activity rows become operational calendar events; existing structured learner-calendar imports continue through the canonical learner calendar RPC.';
