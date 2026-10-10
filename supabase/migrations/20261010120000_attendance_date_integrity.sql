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
  v_existing public.attendance_register_submissions%rowtype;
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
    select * into v_existing
    from public.attendance_register_submissions
    where school_id = v_class.school_id and client_mutation_id = p_client_mutation_id;

    if found then
      if v_existing.register_class_id <> v_class.id or v_existing.attendance_date <> p_attendance_date then
        raise exception 'Attendance mutation identity does not match the register class and date';
      end if;
      return v_existing.id;
    end if;
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

comment on function public.submit_daily_register(uuid,date,jsonb,text,uuid,uuid,text) is
'Submits one auditable daily register. Idempotent retries must retain the original register class and attendance date.';
