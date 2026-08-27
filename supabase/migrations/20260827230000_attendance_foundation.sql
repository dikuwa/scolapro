create table if not exists public.attendance_reasons (
  id uuid primary key default gen_random_uuid(),
  reason_code text not null unique,
  display_name text not null,
  audience text not null default 'learner' check (audience in ('learner','staff')),
  sensitive boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

insert into public.attendance_reasons (reason_code, display_name, audience, sensitive, sort_order)
values
  ('sick', 'Sick', 'learner', false, 10),
  ('medical_appointment', 'Medical appointment', 'learner', true, 20),
  ('compassionate', 'Compassionate', 'learner', true, 30),
  ('late_coming', 'Late coming', 'learner', false, 40),
  ('transport', 'Transport', 'learner', false, 50),
  ('permission', 'Special permission', 'learner', false, 60),
  ('extramural', 'Extramural activities', 'learner', false, 70),
  ('national_duties', 'National duties', 'learner', false, 80),
  ('weather', 'Weather', 'learner', false, 90),
  ('other', 'Other', 'learner', false, 999)
on conflict (reason_code) do update
set display_name = excluded.display_name,
    audience = excluded.audience,
    sensitive = excluded.sensitive,
    sort_order = excluded.sort_order;

create table if not exists public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  learner_id uuid not null references public.learners(id) on delete restrict,
  enrolment_id uuid not null references public.enrolments(id) on delete restrict,
  register_class_id uuid not null references public.register_classes(id) on delete restrict,
  attendance_date date not null,
  observation_type text not null default 'daily_register' check (observation_type in ('daily_register','subject_period')),
  timetable_slot_id uuid references public.timetable_slots(id) on delete restrict,
  status text not null check (status in ('present','absent','late','excused','unknown')),
  reason_id uuid references public.attendance_reasons(id) on delete restrict,
  note text,
  recorded_by_user_id uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  source text not null default 'online' check (source in ('online','offline_sync','import')),
  client_mutation_id uuid,
  replaces_event_id uuid references public.attendance_events(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (
    (observation_type = 'daily_register' and timetable_slot_id is null)
    or (observation_type = 'subject_period' and timetable_slot_id is not null)
  )
);

create unique index if not exists attendance_events_client_mutation_uidx
  on public.attendance_events (school_id, client_mutation_id)
  where client_mutation_id is not null;

create index if not exists attendance_events_register_day_idx
  on public.attendance_events (school_id, register_class_id, attendance_date, recorded_at desc);

create index if not exists attendance_events_learner_day_idx
  on public.attendance_events (school_id, learner_id, attendance_date, recorded_at desc);

alter table public.attendance_reasons enable row level security;
alter table public.attendance_events enable row level security;

create policy "authenticated users can read attendance reasons"
on public.attendance_reasons for select
to authenticated
using (active = true);

create policy "school members can read attendance events"
on public.attendance_events for select
to authenticated
using (app_private.has_school_access(school_id));

create or replace function app_private.can_record_attendance(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or exists (
      select 1
      from public.school_memberships sm
      where sm.school_id = target_school_id
        and sm.user_id = auth.uid()
        and sm.role_key in ('school_admin','principal','deputy_principal','hod','teacher','class_teacher')
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
    );
$$;

grant execute on function app_private.can_record_attendance(uuid) to authenticated;

create or replace function public.record_attendance_event(
  p_enrolment_id uuid,
  p_attendance_date date,
  p_status text,
  p_reason_id uuid default null,
  p_note text default null,
  p_observation_type text default 'daily_register',
  p_timetable_slot_id uuid default null,
  p_client_mutation_id uuid default null,
  p_replaces_event_id uuid default null,
  p_source text default 'online'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrolment public.enrolments%rowtype;
  v_event_id uuid;
  v_existing_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_enrolment from public.enrolments where id = p_enrolment_id;
  if not found then raise exception 'Enrolment not found'; end if;
  if not app_private.can_record_attendance(v_enrolment.school_id) then raise exception 'Permission denied'; end if;

  if p_status not in ('present','absent','late','excused','unknown') then raise exception 'Attendance status is invalid'; end if;
  if p_observation_type not in ('daily_register','subject_period') then raise exception 'Attendance observation type is invalid'; end if;
  if p_source not in ('online','offline_sync','import') then raise exception 'Attendance source is invalid'; end if;
  if p_observation_type = 'daily_register' and p_timetable_slot_id is not null then raise exception 'Daily register attendance cannot reference a timetable slot'; end if;
  if p_observation_type = 'subject_period' and p_timetable_slot_id is null then raise exception 'Subject-period attendance requires a timetable slot'; end if;

  if p_reason_id is not null and not exists (
    select 1 from public.attendance_reasons where id = p_reason_id and audience = 'learner' and active = true
  ) then raise exception 'Attendance reason is invalid'; end if;

  if p_client_mutation_id is not null then
    select id into v_existing_id
    from public.attendance_events
    where school_id = v_enrolment.school_id and client_mutation_id = p_client_mutation_id;
    if v_existing_id is not null then return v_existing_id; end if;
  end if;

  if p_replaces_event_id is not null and not exists (
    select 1 from public.attendance_events ae
    where ae.id = p_replaces_event_id
      and ae.school_id = v_enrolment.school_id
      and ae.learner_id = v_enrolment.learner_id
  ) then raise exception 'Replacement attendance event is invalid'; end if;

  insert into public.attendance_events (
    tenant_id, school_id, academic_year, learner_id, enrolment_id, register_class_id,
    attendance_date, observation_type, timetable_slot_id, status, reason_id, note,
    recorded_by_user_id, source, client_mutation_id, replaces_event_id
  ) values (
    v_enrolment.tenant_id,
    v_enrolment.school_id,
    v_enrolment.academic_year,
    v_enrolment.learner_id,
    v_enrolment.id,
    v_enrolment.register_class_id,
    p_attendance_date,
    p_observation_type,
    p_timetable_slot_id,
    p_status,
    p_reason_id,
    nullif(btrim(coalesce(p_note, '')), ''),
    auth.uid(),
    p_source,
    p_client_mutation_id,
    p_replaces_event_id
  ) returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all on function public.record_attendance_event(uuid,date,text,uuid,text,text,uuid,uuid,uuid,text) from public, anon;
grant execute on function public.record_attendance_event(uuid,date,text,uuid,text,text,uuid,uuid,uuid,text) to authenticated;

create or replace view public.attendance_current
with (security_invoker = true)
as
select distinct on (
  ae.school_id,
  ae.learner_id,
  ae.attendance_date,
  ae.observation_type,
  coalesce(ae.timetable_slot_id, '00000000-0000-0000-0000-000000000000'::uuid)
)
  ae.*
from public.attendance_events ae
order by
  ae.school_id,
  ae.learner_id,
  ae.attendance_date,
  ae.observation_type,
  coalesce(ae.timetable_slot_id, '00000000-0000-0000-0000-000000000000'::uuid),
  ae.recorded_at desc,
  ae.created_at desc;

grant select on public.attendance_current to authenticated;

comment on table public.attendance_events is 'Append-only attendance observations. Corrections append a replacement event rather than rewriting attendance history.';
comment on view public.attendance_current is 'Latest effective attendance observation per learner/date/session key, evaluated with caller RLS privileges.';
