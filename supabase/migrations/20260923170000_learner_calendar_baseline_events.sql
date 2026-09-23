-- Issue #677: national learner-calendar baseline plus school event overlay.
-- Events are independent records; only their explicit teaching_impact changes
-- teaching-day behavior. Teacher and hostel calendars remain separate domains.

create table public.learner_calendar_events (
  id uuid primary key default gen_random_uuid(),
  event_scope text not null check (event_scope in ('national','school')),
  tenant_id uuid references public.tenants(id) on delete restrict,
  school_id uuid references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  category text not null check (char_length(btrim(category)) between 1 and 80),
  starts_on date not null,
  ends_on date not null,
  starts_at time,
  ends_at time,
  audience_scope text not null default 'all_learners'
    check (audience_scope in ('all_learners','grade','register_class','teaching_group')),
  audience_reference_id uuid,
  description text,
  teaching_impact text not null default 'NORMAL'
    check (teaching_impact in ('NORMAL','NO_TEACHING','PARTIAL_DAY','ALTERED_TIMETABLE','EXAM_TIMETABLE')),
  bell_schedule_id uuid references public.timetable_bell_schedules(id) on delete restrict,
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active','cancelled')),
  supersedes_event_id uuid references public.learner_calendar_events(id) on delete restrict,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  check ((starts_at is null and ends_at is null) or (starts_at is not null and ends_at is not null and ends_at > starts_at)),
  check ((audience_scope = 'all_learners' and audience_reference_id is null)
    or (audience_scope <> 'all_learners' and audience_reference_id is not null)),
  check (bell_schedule_id is null or teaching_impact in ('ALTERED_TIMETABLE','EXAM_TIMETABLE')),
  check ((event_scope='national' and tenant_id is null and school_id is null and bell_schedule_id is null and audience_scope='all_learners')
    or (event_scope='school' and tenant_id is not null and school_id is not null)),
  check (supersedes_event_id is null or supersedes_event_id <> id)
);

create index learner_calendar_events_national_dates_idx
  on public.learner_calendar_events (academic_year,starts_on,ends_on)
  where event_scope='national';
create index learner_calendar_events_school_dates_idx
  on public.learner_calendar_events (school_id,academic_year,starts_on,ends_on)
  where event_scope='school';
create unique index learner_calendar_events_supersedes_once_idx
  on public.learner_calendar_events (supersedes_event_id)
  where supersedes_event_id is not null;

alter table public.learner_calendar_events enable row level security;
revoke all on table public.learner_calendar_events from anon,authenticated;
grant select on table public.learner_calendar_events to authenticated;

create policy learner_calendar_events_scoped_read
on public.learner_calendar_events for select to authenticated
using (
  event_scope='national'
  or (school_id is not null and app_private.has_school_access(school_id))
);

create or replace function app_private.enforce_learner_calendar_event_integrity()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_school public.schools%rowtype;
  v_year public.academic_years%rowtype;
  v_prior public.learner_calendar_events%rowtype;
begin
  if tg_op in ('UPDATE','DELETE') then
    raise exception 'Learner calendar events are append-only; create a revision instead';
  end if;

  if auth.uid() is not null then
    if new.created_by_user_id is distinct from auth.uid() then
      raise exception 'Calendar event actor must match the authenticated user';
    end if;
  end if;

  if new.event_scope='national' then
    if not app_private.user_is_active_platform_admin(new.created_by_user_id) then
      raise exception 'National learner calendar events require current platform authority';
    end if;
  else
    select * into v_school from public.schools where id=new.school_id and status='active';
    if not found or v_school.tenant_id is distinct from new.tenant_id then
      raise exception 'Calendar event school and tenant scope do not match';
    end if;

    if not exists (
      select 1 from public.school_memberships sm
      where sm.user_id=new.created_by_user_id
        and sm.school_id=new.school_id
        and sm.tenant_id=new.tenant_id
        and sm.role_key in ('school_admin','principal','deputy_principal')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    ) or not app_private.user_targets_current_school(new.created_by_user_id,new.school_id) then
      raise exception 'School learner calendar events require current school leadership authority';
    end if;

    select * into v_year from public.academic_years
    where school_id=new.school_id and year=new.academic_year;
    if not found then raise exception 'Configure the academic year before adding calendar events'; end if;
    if v_year.status='closed' then raise exception 'Closed academic-year calendar history is final'; end if;
    if v_year.starts_on is not null and new.starts_on<v_year.starts_on then
      raise exception 'Calendar event cannot start before the academic year';
    end if;
    if v_year.ends_on is not null and new.ends_on>v_year.ends_on then
      raise exception 'Calendar event cannot end after the academic year';
    end if;

    if new.audience_scope='grade' and not exists(
      select 1 from public.grades g where g.id=new.audience_reference_id
        and g.school_id=new.school_id and g.academic_year=new.academic_year
    ) then raise exception 'Calendar event grade is outside school/year scope'; end if;
    if new.audience_scope='register_class' and not exists(
      select 1 from public.register_classes rc where rc.id=new.audience_reference_id
        and rc.school_id=new.school_id and rc.academic_year=new.academic_year
    ) then raise exception 'Calendar event register class is outside school/year scope'; end if;
    if new.audience_scope='teaching_group' and not exists(
      select 1 from public.teaching_groups tg where tg.id=new.audience_reference_id
        and tg.school_id=new.school_id and tg.academic_year=new.academic_year
    ) then raise exception 'Calendar event teaching group is outside school/year scope'; end if;

    if new.bell_schedule_id is not null and not exists(
      select 1 from public.timetable_bell_schedules bs
      where bs.id=new.bell_schedule_id and bs.school_id=new.school_id
        and bs.academic_year=new.academic_year
        and new.starts_on>=bs.effective_from
        and new.ends_on<=coalesce(bs.effective_to,new.ends_on)
    ) then raise exception 'Selected bell schedule is outside school, year, or event dates'; end if;
  end if;

  if new.supersedes_event_id is not null then
    select * into v_prior from public.learner_calendar_events where id=new.supersedes_event_id;
    if not found then raise exception 'Superseded calendar event was not found'; end if;
    if v_prior.event_scope is distinct from new.event_scope
       or v_prior.tenant_id is distinct from new.tenant_id
       or v_prior.school_id is distinct from new.school_id then
      raise exception 'Calendar revisions cannot cross scope';
    end if;
    if v_prior.ends_on<current_date then
      raise exception 'Historical calendar events are final';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_learner_calendar_event_integrity() from public,anon,authenticated;
create trigger learner_calendar_event_integrity_trg
before insert or update or delete on public.learner_calendar_events
for each row execute function app_private.enforce_learner_calendar_event_integrity();

create view public.effective_learner_calendar_events
with (security_invoker=true)
as
select event.*
from public.learner_calendar_events event
where not exists (
  select 1 from public.learner_calendar_events revision
  where revision.supersedes_event_id=event.id
)
and event.lifecycle_status='active';

revoke all on public.effective_learner_calendar_events from anon,authenticated;
grant select on public.effective_learner_calendar_events to authenticated;

create or replace function public.create_national_learner_calendar_event(
  p_academic_year integer,
  p_title text,
  p_category text,
  p_starts_on date,
  p_ends_on date,
  p_starts_at time default null,
  p_ends_at time default null,
  p_description text default null,
  p_teaching_impact text default 'NORMAL',
  p_supersedes_event_id uuid default null,
  p_lifecycle_status text default 'active'
) returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_platform_role(array['platform_admin']) then raise exception 'Permission denied'; end if;
  insert into public.learner_calendar_events(
    event_scope,academic_year,title,category,starts_on,ends_on,starts_at,ends_at,
    audience_scope,description,teaching_impact,lifecycle_status,supersedes_event_id,created_by_user_id
  ) values (
    'national',p_academic_year,btrim(p_title),btrim(p_category),p_starts_on,p_ends_on,p_starts_at,p_ends_at,
    'all_learners',nullif(btrim(coalesce(p_description,'')),''),upper(btrim(p_teaching_impact)),
    p_lifecycle_status,p_supersedes_event_id,auth.uid()
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.create_school_learner_calendar_event(
  p_school_id uuid,
  p_academic_year integer,
  p_title text,
  p_category text,
  p_starts_on date,
  p_ends_on date,
  p_starts_at time default null,
  p_ends_at time default null,
  p_audience_scope text default 'all_learners',
  p_audience_reference_id uuid default null,
  p_description text default null,
  p_teaching_impact text default 'NORMAL',
  p_bell_schedule_id uuid default null,
  p_supersedes_event_id uuid default null,
  p_lifecycle_status text default 'active'
) returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare v_school public.schools%rowtype; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.user_targets_current_school(auth.uid(),p_school_id)
     or not app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal']) then
    raise exception 'Permission denied';
  end if;
  select * into v_school from public.schools where id=p_school_id and status='active';
  if not found then raise exception 'School not found or inactive'; end if;

  insert into public.learner_calendar_events(
    event_scope,tenant_id,school_id,academic_year,title,category,starts_on,ends_on,starts_at,ends_at,
    audience_scope,audience_reference_id,description,teaching_impact,bell_schedule_id,
    lifecycle_status,supersedes_event_id,created_by_user_id
  ) values (
    'school',v_school.tenant_id,p_school_id,p_academic_year,btrim(p_title),btrim(p_category),
    p_starts_on,p_ends_on,p_starts_at,p_ends_at,p_audience_scope,p_audience_reference_id,
    nullif(btrim(coalesce(p_description,'')),''),upper(btrim(p_teaching_impact)),p_bell_schedule_id,
    p_lifecycle_status,p_supersedes_event_id,auth.uid()
  ) returning id into v_id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_school.tenant_id,p_school_id,auth.uid(),'calendar.learner_event.created','learner_calendar_event',v_id,
    jsonb_build_object('academic_year',p_academic_year,'starts_on',p_starts_on,'ends_on',p_ends_on,
      'audience_scope',p_audience_scope,'teaching_impact',upper(btrim(p_teaching_impact)),
      'supersedes_event_id',p_supersedes_event_id,'lifecycle_status',p_lifecycle_status));
  return v_id;
end;
$$;

revoke all on function public.create_national_learner_calendar_event(integer,text,text,date,date,time,time,text,text,uuid,text) from public,anon;
revoke all on function public.create_school_learner_calendar_event(uuid,integer,text,text,date,date,time,time,text,uuid,text,text,uuid,uuid,text) from public,anon;
grant execute on function public.create_national_learner_calendar_event(integer,text,text,date,date,time,time,text,text,uuid,text) to authenticated;
grant execute on function public.create_school_learner_calendar_event(uuid,integer,text,text,date,date,time,time,text,uuid,text,text,uuid,uuid,text) to authenticated;

create or replace function app_private.resolve_learner_event_teaching_impact(
  p_school_id uuid,
  p_target_date date
) returns text
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select event.teaching_impact
  from public.effective_learner_calendar_events event
  where event.audience_scope='all_learners'
    and event.teaching_impact<>'NORMAL'
    and p_target_date between event.starts_on and event.ends_on
    and (event.event_scope='national' or event.school_id=p_school_id)
  order by case event.teaching_impact
      when 'NO_TEACHING' then 5 when 'EXAM_TIMETABLE' then 4
      when 'ALTERED_TIMETABLE' then 3 when 'PARTIAL_DAY' then 2 else 1 end desc,
    case event.event_scope when 'school' then 2 else 1 end desc,
    event.created_at desc
  limit 1;
$$;
revoke all on function app_private.resolve_learner_event_teaching_impact(uuid,date) from public,anon,authenticated;

create or replace function app_private.is_expected_school_day(target_school_id uuid,target_date date)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select coalesce(
    (select sdo.is_school_day from public.school_day_overrides sdo
      where sdo.school_id=target_school_id and sdo.school_date=target_date),
    case when app_private.resolve_learner_event_teaching_impact(target_school_id,target_date)='NO_TEACHING'
      then false else extract(isodow from target_date) between 1 and 5 end
  );
$$;
revoke all on function app_private.is_expected_school_day(uuid,date) from public,anon;
grant execute on function app_private.is_expected_school_day(uuid,date) to authenticated;

create or replace function public.resolve_school_teaching_impact(p_school_id uuid,p_target_date date)
returns text
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select coalesce(
    (select case when not sdo.is_school_day then 'NO_TEACHING' else sdo.teaching_impact end
      from public.school_day_overrides sdo where sdo.school_id=p_school_id and sdo.school_date=p_target_date),
    app_private.resolve_learner_event_teaching_impact(p_school_id,p_target_date),
    case when app_private.is_expected_school_day(p_school_id,p_target_date) then 'NORMAL' else 'NO_TEACHING' end
  );
$$;

create or replace function public.resolve_timetable_bell_schedule(p_school_id uuid,p_academic_year integer,p_target_date date)
returns uuid
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select coalesce(
    (select sdo.bell_schedule_id from public.school_day_overrides sdo
      where sdo.school_id=p_school_id and sdo.school_date=p_target_date
        and sdo.teaching_impact in ('ALTERED_TIMETABLE','EXAM_TIMETABLE') and sdo.bell_schedule_id is not null),
    (select event.bell_schedule_id from public.effective_learner_calendar_events event
      where event.event_scope='school' and event.school_id=p_school_id
        and event.academic_year=p_academic_year and event.audience_scope='all_learners'
        and event.teaching_impact in ('ALTERED_TIMETABLE','EXAM_TIMETABLE')
        and event.bell_schedule_id is not null and p_target_date between event.starts_on and event.ends_on
      order by event.created_at desc limit 1),
    (select bs.id from public.timetable_bell_schedules bs
      where bs.school_id=p_school_id and bs.academic_year=p_academic_year
        and p_target_date between bs.effective_from and coalesce(bs.effective_to,'infinity'::date)
        and extract(isodow from p_target_date)::smallint=any(bs.applies_to_weekdays)
      order by bs.effective_from desc limit 1)
  );
$$;

revoke all on function public.resolve_school_teaching_impact(uuid,date) from public,anon;
revoke all on function public.resolve_timetable_bell_schedule(uuid,integer,date) from public,anon;
grant execute on function public.resolve_school_teaching_impact(uuid,date) to authenticated;
grant execute on function public.resolve_timetable_bell_schedule(uuid,integer,date) to authenticated;

comment on table public.learner_calendar_events is
'Append-only national learner baseline and school learner-event overlay. Event existence is independent from teaching impact; teacher and hostel calendars are separate.';
comment on function app_private.resolve_learner_event_teaching_impact(uuid,date) is
'Resolves only explicit non-NORMAL all-learner event impact. Informational NORMAL events never create or remove a teaching day.';
