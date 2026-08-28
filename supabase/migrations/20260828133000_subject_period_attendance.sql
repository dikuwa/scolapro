-- Subject-period attendance is operational/classroom evidence and is deliberately
-- separate from the official morning register used by statutory attendance.

create table public.subject_attendance_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  timetable_slot_id uuid not null references public.timetable_slots(id) on delete restrict,
  register_class_id uuid not null references public.register_classes(id) on delete restrict,
  attendance_date date not null,
  default_status text not null default 'present' check (default_status='present'),
  note text,
  recorded_by_user_id uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  client_mutation_id uuid,
  replaces_submission_id uuid references public.subject_attendance_submissions(id) on delete restrict,
  source text not null default 'online' check (source in ('online','offline_sync','import')),
  created_at timestamptz not null default now()
);

alter table public.attendance_events add column if not exists subject_submission_id uuid references public.subject_attendance_submissions(id) on delete restrict;
create unique index subject_attendance_client_mutation_uidx on public.subject_attendance_submissions(school_id,client_mutation_id) where client_mutation_id is not null;
create index subject_attendance_slot_day_idx on public.subject_attendance_submissions(timetable_slot_id,attendance_date,recorded_at desc);

alter table public.subject_attendance_submissions enable row level security;

create or replace function app_private.can_record_subject_attendance(p_timetable_slot_id uuid,p_on_date date default current_date)
returns boolean language sql stable security definer set search_path=public,app_private as $$
  select exists(
    select 1
    from public.timetable_slots ts
    join public.teacher_allocations ta on ta.id=ts.teacher_allocation_id
    join public.staff_members sm on sm.id=ta.staff_member_id
    where ts.id=p_timetable_slot_id and ts.status='active'
      and ta.active_from<=p_on_date and (ta.active_to is null or ta.active_to>=p_on_date)
      and (
        sm.user_id=(select auth.uid())
        or app_private.has_school_role(ts.school_id,array['school_admin','principal','deputy_principal','hod'])
        or app_private.has_platform_role(array['platform_admin'])
      )
  );
$$;

create policy "authorized users read subject attendance submissions" on public.subject_attendance_submissions
for select to authenticated using (app_private.can_view_operational_learners(school_id));

create or replace function public.submit_subject_period_attendance(
  p_timetable_slot_id uuid,
  p_attendance_date date,
  p_exceptions jsonb default '[]'::jsonb,
  p_note text default null,
  p_client_mutation_id uuid default null,
  p_replaces_submission_id uuid default null,
  p_source text default 'online'
)
returns uuid
language plpgsql security definer set search_path=public,app_private as $$
declare
  v_slot public.timetable_slots%rowtype;
  v_submission_id uuid;
  v_existing_id uuid;
  v_item jsonb;
  v_enrol public.enrolments%rowtype;
  v_status text;
  v_reason uuid;
  v_note text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_slot from public.timetable_slots where id=p_timetable_slot_id;
  if not found or v_slot.status<>'active' then raise exception 'Active timetable slot not found'; end if;
  if extract(isodow from p_attendance_date)::int <> v_slot.weekday then raise exception 'Attendance date does not match timetable weekday'; end if;
  if not app_private.can_record_subject_attendance(v_slot.id,p_attendance_date) then raise exception 'Permission denied'; end if;
  if p_source not in ('online','offline_sync','import') then raise exception 'Attendance source is invalid'; end if;
  if jsonb_typeof(p_exceptions)<>'array' then raise exception 'Attendance exceptions must be an array'; end if;

  if p_client_mutation_id is not null then
    select id into v_existing_id from public.subject_attendance_submissions where school_id=v_slot.school_id and client_mutation_id=p_client_mutation_id;
    if v_existing_id is not null then return v_existing_id; end if;
  end if;

  if p_replaces_submission_id is not null and not exists(
    select 1 from public.subject_attendance_submissions s where s.id=p_replaces_submission_id and s.timetable_slot_id=v_slot.id and s.attendance_date=p_attendance_date
  ) then raise exception 'Replacement subject attendance submission is invalid'; end if;

  insert into public.subject_attendance_submissions(
    tenant_id,school_id,academic_year,timetable_slot_id,register_class_id,attendance_date,note,recorded_by_user_id,client_mutation_id,replaces_submission_id,source
  ) values(v_slot.tenant_id,v_slot.school_id,v_slot.academic_year,v_slot.id,v_slot.register_class_id,p_attendance_date,nullif(btrim(coalesce(p_note,'')),''),auth.uid(),p_client_mutation_id,p_replaces_submission_id,p_source)
  returning id into v_submission_id;

  for v_item in select value from jsonb_array_elements(p_exceptions)
  loop
    select * into v_enrol from public.enrolments
    where id=(v_item->>'enrolment_id')::uuid
      and school_id=v_slot.school_id and register_class_id=v_slot.register_class_id and academic_year=v_slot.academic_year
      and enrolled_from<=p_attendance_date and (enrolled_to is null or enrolled_to>=p_attendance_date);
    if not found then raise exception 'Subject attendance exception contains invalid enrolment'; end if;
    v_status:=lower(coalesce(v_item->>'status',''));
    if v_status not in ('absent','late','excused','unknown') then raise exception 'Exception status must be absent, late, excused or unknown'; end if;
    v_reason:=nullif(v_item->>'reason_id','')::uuid;
    if v_reason is not null and not exists(select 1 from public.attendance_reasons where id=v_reason and audience='learner' and active=true) then raise exception 'Attendance reason is invalid'; end if;
    v_note:=nullif(btrim(coalesce(v_item->>'note','')),'');
    insert into public.attendance_events(
      tenant_id,school_id,academic_year,learner_id,enrolment_id,register_class_id,attendance_date,observation_type,timetable_slot_id,status,reason_id,note,recorded_by_user_id,source,subject_submission_id
    ) values(v_slot.tenant_id,v_slot.school_id,v_slot.academic_year,v_enrol.learner_id,v_enrol.id,v_slot.register_class_id,p_attendance_date,'subject_period',v_slot.id,v_status,v_reason,v_note,auth.uid(),p_source,v_submission_id);
  end loop;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_slot.tenant_id,v_slot.school_id,auth.uid(),'subject_attendance.submitted','timetable_slot',v_slot.id,jsonb_build_object('attendance_date',p_attendance_date,'exceptions',jsonb_array_length(p_exceptions)));
  return v_submission_id;
end; $$;

create or replace view public.subject_attendance_current with (security_invoker=true) as
with latest as (
  select distinct on (timetable_slot_id,attendance_date) s.*
  from public.subject_attendance_submissions s
  order by timetable_slot_id,attendance_date,recorded_at desc,created_at desc
)
select
  s.id submission_id,s.tenant_id,s.school_id,s.academic_year,s.timetable_slot_id,s.register_class_id,s.attendance_date,
  e.id enrolment_id,e.learner_id,l.first_names,l.surname,
  coalesce(ae.status,s.default_status) status,ae.reason_id,ae.note,s.recorded_by_user_id,s.recorded_at
from latest s
join public.enrolments e on e.school_id=s.school_id and e.register_class_id=s.register_class_id and e.academic_year=s.academic_year and e.enrolled_from<=s.attendance_date and (e.enrolled_to is null or e.enrolled_to>=s.attendance_date)
join public.learners l on l.id=e.learner_id
left join public.attendance_events ae on ae.subject_submission_id=s.id and ae.enrolment_id=e.id;

grant select on public.subject_attendance_current to authenticated;
revoke all on public.subject_attendance_submissions from anon;
grant select on public.subject_attendance_submissions to authenticated;
revoke all on function public.submit_subject_period_attendance(uuid,date,jsonb,text,uuid,uuid,text) from public,anon;
grant execute on function public.submit_subject_period_attendance(uuid,date,jsonb,text,uuid,uuid,text) to authenticated;
