create table if not exists public.school_day_overrides (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  school_date date not null,
  is_school_day boolean not null,
  reason text,
  source text not null default 'school' check (source in ('national','regional','school','emergency')),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, school_date)
);

alter table public.school_day_overrides enable row level security;

create policy "authorized staff can read school day overrides"
on public.school_day_overrides for select
to authenticated
using (app_private.can_view_operational_learners(school_id));

create policy "school leaders can manage school day overrides"
on public.school_day_overrides for all
to authenticated
using (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal']))
with check (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal']));

create or replace function app_private.is_expected_school_day(target_school_id uuid, target_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select sdo.is_school_day
     from public.school_day_overrides sdo
     where sdo.school_id = target_school_id and sdo.school_date = target_date),
    extract(isodow from target_date) between 1 and 5
  );
$$;

grant execute on function app_private.is_expected_school_day(uuid,date) to authenticated;

create or replace function app_private.can_record_register_class(target_register_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.register_classes rc
    where rc.id = target_register_class_id
      and (
        app_private.has_platform_role(array['platform_admin'])
        or app_private.has_school_role(rc.school_id, array['school_admin','principal','deputy_principal','hod'])
        or exists (
          select 1
          from public.school_memberships sm
          where sm.school_id = rc.school_id
            and sm.user_id = auth.uid()
            and sm.staff_member_id is not null
            and sm.role_key in ('teacher','class_teacher')
            and sm.active_from <= current_date
            and (sm.active_to is null or sm.active_to >= current_date)
            and (
              rc.register_teacher_staff_id = sm.staff_member_id
              or exists (
                select 1
                from public.teacher_allocations ta
                where ta.school_id = rc.school_id
                  and ta.register_class_id = rc.id
                  and ta.academic_year = rc.academic_year
                  and ta.staff_member_id = sm.staff_member_id
                  and ta.active_from <= current_date
                  and (ta.active_to is null or ta.active_to >= current_date)
              )
            )
        )
      )
  );
$$;

grant execute on function app_private.can_record_register_class(uuid) to authenticated;

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
  if not app_private.can_record_register_class(v_class.id) then raise exception 'Permission denied for this register class'; end if;
  if not app_private.is_expected_school_day(v_class.school_id, p_attendance_date) then raise exception 'This date is not configured as a school day'; end if;
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

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_class.tenant_id, v_class.school_id, auth.uid(), 'attendance.register.submitted', 'attendance_register_submission', v_submission_id,
    jsonb_build_object('register_class_id', v_class.id, 'attendance_date', p_attendance_date, 'exception_count', jsonb_array_length(p_exceptions)));

  return v_submission_id;
end;
$$;

revoke all on function public.submit_daily_register(uuid,date,jsonb,text,uuid,uuid,text) from public, anon;
grant execute on function public.submit_daily_register(uuid,date,jsonb,text,uuid,uuid,text) to authenticated;

create or replace function public.submit_weekly_register(
  p_register_class_id uuid,
  p_days jsonb,
  p_source text default 'online'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_date date;
  v_submission_id uuid;
  v_results jsonb := '[]'::jsonb;
  v_monday date;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_record_register_class(p_register_class_id) then raise exception 'Permission denied for this register class'; end if;
  if jsonb_typeof(p_days) <> 'array' then raise exception 'Weekly register days must be an array'; end if;

  v_count := jsonb_array_length(p_days);
  if v_count < 1 or v_count > 5 then raise exception 'Weekly register must contain one to five school days'; end if;

  for v_item in select value from jsonb_array_elements(p_days)
  loop
    v_date := (v_item ->> 'date')::date;
    if extract(isodow from v_date) > 5 then raise exception 'Normal weekly attendance cannot include Saturday or Sunday'; end if;

    if v_monday is null then
      v_monday := v_date - (extract(isodow from v_date)::integer - 1);
    elsif v_date < v_monday or v_date > v_monday + 4 then
      raise exception 'All submitted attendance dates must belong to the same Monday-Friday week';
    end if;

    if not app_private.is_expected_school_day((select school_id from public.register_classes where id = p_register_class_id), v_date) then
      continue;
    end if;

    v_submission_id := public.submit_daily_register(
      p_register_class_id,
      v_date,
      coalesce(v_item -> 'exceptions', '[]'::jsonb),
      null,
      nullif(v_item ->> 'client_mutation_id', '')::uuid,
      nullif(v_item ->> 'replaces_submission_id', '')::uuid,
      p_source
    );
    v_results := v_results || jsonb_build_array(jsonb_build_object('date', v_date, 'submission_id', v_submission_id));
  end loop;

  return v_results;
end;
$$;

revoke all on function public.submit_weekly_register(uuid,jsonb,text) from public, anon;
grant execute on function public.submit_weekly_register(uuid,jsonb,text) to authenticated;

comment on table public.school_day_overrides is 'Explicit school-day exceptions layered over the normal Monday-Friday calendar. Supports holidays, closures and approved special weekend school days.';
comment on function app_private.can_record_register_class(uuid) is 'Class-scoped attendance authorization. Leaders/HODs may support broadly; teachers are limited to register or allocated classes.';