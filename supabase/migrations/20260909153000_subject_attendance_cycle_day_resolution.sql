-- Subject-period attendance validates timetable days according to the school's
-- configured day model. Weekday mode retains ISO-weekday semantics; rotating mode
-- delegates calendar resolution to the canonical governed resolver.

create or replace function public.resolve_timetable_date_for_day(
  p_school_id uuid,
  p_academic_year integer,
  p_target_day smallint,
  p_reference_date date
)
returns date
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_cycle_mode text;
  v_cycle_length smallint;
  v_reference_day smallint;
  v_result date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_school_access(p_school_id) then raise exception 'Permission denied'; end if;
  if p_reference_date is null then return null; end if;

  select s.timetable_cycle_mode,s.timetable_cycle_length
    into v_cycle_mode,v_cycle_length
  from public.schools s
  where s.id=p_school_id and s.status='active';
  if not found then return null; end if;

  if v_cycle_mode='rotating' then
    if p_target_day is null or p_target_day < 1 or p_target_day > v_cycle_length then return null; end if;

    select candidate::date
      into v_result
    from generate_series(
      p_reference_date - 120,
      p_reference_date + 120,
      interval '1 day'
    ) candidate
    where app_private.is_expected_school_day(p_school_id,candidate::date)
      and public.resolve_timetable_day(p_school_id,p_academic_year,candidate::date)=p_target_day
    order by abs(candidate::date-p_reference_date),candidate::date
    limit 1;

    return v_result;
  end if;

  if p_target_day is null or p_target_day < 1 or p_target_day > 7 then return null; end if;
  v_reference_day:=extract(isodow from p_reference_date)::smallint;
  return p_reference_date + (p_target_day-v_reference_day)::integer;
end;
$$;

revoke all on function public.resolve_timetable_date_for_day(uuid,integer,smallint,date)
from public,anon;
grant execute on function public.resolve_timetable_date_for_day(uuid,integer,smallint,date)
to authenticated;

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
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_slot public.timetable_slots%rowtype;
  v_submission_id uuid;
  v_existing_id uuid;
  v_item jsonb;
  v_enrol public.enrolments%rowtype;
  v_status text;
  v_reason uuid;
  v_note text;
  v_cycle_mode text;
  v_resolved_day smallint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_slot
  from public.timetable_slots
  where id=p_timetable_slot_id;
  if not found or v_slot.status<>'active' then
    raise exception 'Active timetable slot not found';
  end if;

  select s.timetable_cycle_mode
    into v_cycle_mode
  from public.schools s
  where s.id=v_slot.school_id and s.status='active';
  if not found then
    raise exception 'Active school not found';
  end if;

  if v_cycle_mode='rotating' then
    v_resolved_day:=public.resolve_timetable_day(
      v_slot.school_id,
      v_slot.academic_year,
      p_attendance_date
    );
  else
    v_resolved_day:=extract(isodow from p_attendance_date)::smallint;
  end if;

  if v_resolved_day is distinct from v_slot.weekday then
    raise exception 'Attendance date does not match timetable day';
  end if;

  if not app_private.can_record_subject_attendance(v_slot.id,p_attendance_date) then
    raise exception 'Permission denied';
  end if;
  if p_source not in ('online','offline_sync','import') then
    raise exception 'Attendance source is invalid';
  end if;
  if jsonb_typeof(p_exceptions)<>'array' then
    raise exception 'Attendance exceptions must be an array';
  end if;

  if p_client_mutation_id is not null then
    select id into v_existing_id
    from public.subject_attendance_submissions
    where school_id=v_slot.school_id and client_mutation_id=p_client_mutation_id;
    if v_existing_id is not null then return v_existing_id; end if;
  end if;

  if p_replaces_submission_id is not null and not exists(
    select 1
    from public.subject_attendance_submissions s
    where s.id=p_replaces_submission_id
      and s.timetable_slot_id=v_slot.id
      and s.attendance_date=p_attendance_date
  ) then
    raise exception 'Replacement subject attendance submission is invalid';
  end if;

  insert into public.subject_attendance_submissions(
    tenant_id,school_id,academic_year,timetable_slot_id,register_class_id,
    attendance_date,note,recorded_by_user_id,client_mutation_id,
    replaces_submission_id,source
  ) values(
    v_slot.tenant_id,v_slot.school_id,v_slot.academic_year,v_slot.id,
    v_slot.register_class_id,p_attendance_date,
    nullif(btrim(coalesce(p_note,'')),''),auth.uid(),p_client_mutation_id,
    p_replaces_submission_id,p_source
  ) returning id into v_submission_id;

  for v_item in select value from jsonb_array_elements(p_exceptions) loop
    select * into v_enrol
    from public.enrolments
    where id=(v_item->>'enrolment_id')::uuid
      and school_id=v_slot.school_id
      and register_class_id=v_slot.register_class_id
      and academic_year=v_slot.academic_year
      and enrolled_from<=p_attendance_date
      and (enrolled_to is null or enrolled_to>=p_attendance_date);
    if not found then
      raise exception 'Subject attendance exception contains invalid enrolment';
    end if;

    v_status:=lower(coalesce(v_item->>'status',''));
    if v_status not in ('absent','late','excused','unknown') then
      raise exception 'Exception status must be absent, late, excused or unknown';
    end if;

    v_reason:=nullif(v_item->>'reason_id','')::uuid;
    if v_reason is not null and not exists(
      select 1 from public.attendance_reasons
      where id=v_reason and audience='learner' and active=true
    ) then
      raise exception 'Attendance reason is invalid';
    end if;

    v_note:=nullif(btrim(coalesce(v_item->>'note','')),'');
    insert into public.attendance_events(
      tenant_id,school_id,academic_year,learner_id,enrolment_id,
      register_class_id,attendance_date,observation_type,timetable_slot_id,
      status,reason_id,note,recorded_by_user_id,source,subject_submission_id
    ) values(
      v_slot.tenant_id,v_slot.school_id,v_slot.academic_year,v_enrol.learner_id,
      v_enrol.id,v_slot.register_class_id,p_attendance_date,'subject_period',
      v_slot.id,v_status,v_reason,v_note,auth.uid(),p_source,v_submission_id
    );
  end loop;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_slot.tenant_id,v_slot.school_id,auth.uid(),
    'subject_attendance.submitted','timetable_slot',v_slot.id,
    jsonb_build_object(
      'attendance_date',p_attendance_date,
      'exceptions',jsonb_array_length(p_exceptions)
    )
  );

  return v_submission_id;
end;
$$;
