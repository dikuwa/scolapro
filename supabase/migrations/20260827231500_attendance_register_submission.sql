create table if not exists public.attendance_register_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  register_class_id uuid not null references public.register_classes(id) on delete restrict,
  attendance_date date not null,
  default_status text not null default 'present' check (default_status = 'present'),
  note text,
  recorded_by_user_id uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  source text not null default 'online' check (source in ('online','offline_sync','import')),
  client_mutation_id uuid,
  replaces_submission_id uuid references public.attendance_register_submissions(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.attendance_events
  add column if not exists register_submission_id uuid references public.attendance_register_submissions(id) on delete restrict;

create unique index if not exists attendance_register_client_mutation_uidx
  on public.attendance_register_submissions (school_id, client_mutation_id)
  where client_mutation_id is not null;

create index if not exists attendance_register_class_day_idx
  on public.attendance_register_submissions (school_id, register_class_id, attendance_date, recorded_at desc);

alter table public.attendance_register_submissions enable row level security;

create policy "school members can read register submissions"
on public.attendance_register_submissions for select
to authenticated
using (app_private.has_school_access(school_id));

create or replace function public.submit_daily_register(
  p_register_class_id uuid,
  p_attendance_date date,
  p_exceptions jsonb default '[]'::jsonb,
  p_note text default null,
  p_client_mutation_id uuid default null,
  p_replaces_submission_id uuid default null,
  p_source text default 'online'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class public.register_classes%rowtype;
  v_submission_id uuid;
  v_existing_id uuid;
  v_item jsonb;
  v_enrolment public.enrolments%rowtype;
  v_status text;
  v_reason_id uuid;
  v_exception_note text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_class from public.register_classes where id = p_register_class_id;
  if not found then raise exception 'Register class not found'; end if;
  if not app_private.can_record_attendance(v_class.school_id) then raise exception 'Permission denied'; end if;
  if p_source not in ('online','offline_sync','import') then raise exception 'Attendance source is invalid'; end if;
  if jsonb_typeof(p_exceptions) <> 'array' then raise exception 'Attendance exceptions must be an array'; end if;

  if p_client_mutation_id is not null then
    select id into v_existing_id
    from public.attendance_register_submissions
    where school_id = v_class.school_id and client_mutation_id = p_client_mutation_id;
    if v_existing_id is not null then return v_existing_id; end if;
  end if;

  if p_replaces_submission_id is not null and not exists (
    select 1 from public.attendance_register_submissions ars
    where ars.id = p_replaces_submission_id
      and ars.school_id = v_class.school_id
      and ars.register_class_id = v_class.id
      and ars.attendance_date = p_attendance_date
  ) then raise exception 'Replacement register submission is invalid'; end if;

  insert into public.attendance_register_submissions (
    tenant_id, school_id, academic_year, register_class_id, attendance_date,
    note, recorded_by_user_id, source, client_mutation_id, replaces_submission_id
  ) values (
    v_class.tenant_id, v_class.school_id, v_class.academic_year, v_class.id, p_attendance_date,
    nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), p_source, p_client_mutation_id, p_replaces_submission_id
  ) returning id into v_submission_id;

  for v_item in select value from jsonb_array_elements(p_exceptions)
  loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'Each attendance exception must be an object'; end if;

    select * into v_enrolment
    from public.enrolments
    where id = (v_item ->> 'enrolment_id')::uuid
      and school_id = v_class.school_id
      and register_class_id = v_class.id
      and academic_year = v_class.academic_year
      and enrolled_from <= p_attendance_date
      and (enrolled_to is null or enrolled_to >= p_attendance_date);

    if not found then raise exception 'Attendance exception contains an invalid enrolment'; end if;

    v_status := lower(coalesce(v_item ->> 'status', ''));
    if v_status not in ('absent','late','excused','unknown') then raise exception 'Exception status must be absent, late, excused or unknown'; end if;

    v_reason_id := nullif(v_item ->> 'reason_id', '')::uuid;
    if v_reason_id is not null and not exists (
      select 1 from public.attendance_reasons ar
      where ar.id = v_reason_id and ar.audience = 'learner' and ar.active = true
    ) then raise exception 'Attendance reason is invalid'; end if;

    v_exception_note := nullif(btrim(coalesce(v_item ->> 'note', '')), '');

    insert into public.attendance_events (
      tenant_id, school_id, academic_year, learner_id, enrolment_id, register_class_id,
      attendance_date, observation_type, status, reason_id, note, recorded_by_user_id,
      source, register_submission_id
    ) values (
      v_class.tenant_id, v_class.school_id, v_class.academic_year, v_enrolment.learner_id,
      v_enrolment.id, v_class.id, p_attendance_date, 'daily_register', v_status,
      v_reason_id, v_exception_note, auth.uid(), p_source, v_submission_id
    );
  end loop;

  return v_submission_id;
end;
$$;

revoke all on function public.submit_daily_register(uuid,date,jsonb,text,uuid,uuid,text) from public, anon;
grant execute on function public.submit_daily_register(uuid,date,jsonb,text,uuid,uuid,text) to authenticated;

create or replace view public.daily_register_current
with (security_invoker = true)
as
with latest_submission as (
  select distinct on (school_id, register_class_id, attendance_date)
    ars.*
  from public.attendance_register_submissions ars
  order by school_id, register_class_id, attendance_date, recorded_at desc, created_at desc
)
select
  ls.id as submission_id,
  ls.tenant_id,
  ls.school_id,
  ls.academic_year,
  ls.register_class_id,
  ls.attendance_date,
  e.id as enrolment_id,
  e.learner_id,
  l.first_names,
  l.surname,
  coalesce(ae.status, ls.default_status) as status,
  ae.reason_id,
  ae.note,
  ls.recorded_by_user_id,
  ls.recorded_at
from latest_submission ls
join public.enrolments e
  on e.school_id = ls.school_id
  and e.register_class_id = ls.register_class_id
  and e.academic_year = ls.academic_year
  and e.enrolled_from <= ls.attendance_date
  and (e.enrolled_to is null or e.enrolled_to >= ls.attendance_date)
join public.learners l on l.id = e.learner_id
left join public.attendance_events ae
  on ae.register_submission_id = ls.id
  and ae.enrolment_id = e.id;

grant select on public.daily_register_current to authenticated;

comment on table public.attendance_register_submissions is 'One class/day register confirmation with implicit present default and explicit exception events.';
comment on view public.daily_register_current is 'Current effective daily register where learners without an exception are present by the latest class submission.';
