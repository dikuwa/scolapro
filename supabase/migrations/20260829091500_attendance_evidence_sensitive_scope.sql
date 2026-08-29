-- Daily/weekly and subject-period submission RPCs are now the canonical attendance
-- mutation paths. Close the older raw event endpoint, and treat attached evidence as
-- potentially health-sensitive rather than generic school-wide learner data.

revoke execute on function public.record_attendance_event(uuid,date,text,uuid,text,text,uuid,uuid,uuid,text) from authenticated;

create or replace function app_private.can_read_attendance_evidence(p_evidence_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select exists(
    select 1
    from public.attendance_evidence ae
    join public.attendance_register_submissions ars on ars.id=ae.register_submission_id
    join public.register_classes rc on rc.id=ars.register_class_id
    where ae.id=p_evidence_id
      and (
        ae.uploaded_by_user_id=(select auth.uid())
        or app_private.has_platform_role(array['platform_admin'])
        or exists(
          select 1
          from public.school_memberships sm
          where sm.school_id=ae.school_id
            and sm.user_id=(select auth.uid())
            and sm.role_key in ('school_admin','principal','deputy_principal','counsellor')
            and sm.active_from<=current_date
            and (sm.active_to is null or sm.active_to>=current_date)
        )
        or exists(
          select 1
          from public.staff_members staff
          join public.school_memberships sm on sm.school_id=ae.school_id
            and sm.user_id=(select auth.uid())
            and sm.staff_member_id=staff.id
            and sm.role_key='class_teacher'
            and sm.active_from<=current_date
            and (sm.active_to is null or sm.active_to>=current_date)
          where staff.id=rc.register_teacher_staff_id
            and staff.user_id=(select auth.uid())
            and staff.status='active'
        )
      )
  );
$$;
revoke all on function app_private.can_read_attendance_evidence(uuid) from public,anon,authenticated;

drop policy if exists "attendance recorders can read attendance evidence" on public.attendance_evidence;
create policy "need to know users read attendance evidence"
on public.attendance_evidence for select to authenticated
using (app_private.can_read_attendance_evidence(id));

drop policy if exists "attendance recorders can insert attendance evidence" on public.attendance_evidence;
create policy "submission owner inserts attendance evidence"
on public.attendance_evidence for insert to authenticated
with check (
  uploaded_by_user_id=(select auth.uid())
  and exists(
    select 1
    from public.attendance_register_submissions ars
    where ars.id=register_submission_id
      and ars.school_id=attendance_evidence.school_id
      and ars.recorded_by_user_id=(select auth.uid())
  )
);

create or replace function app_private.enforce_attendance_evidence_integrity()
returns trigger
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_submission public.attendance_register_submissions%rowtype;
  v_enrolment public.enrolments%rowtype;
begin
  select * into v_submission
  from public.attendance_register_submissions
  where id=new.register_submission_id;
  if not found then raise exception 'Attendance register submission not found' using errcode='23503'; end if;

  select * into v_enrolment
  from public.enrolments
  where id=new.enrolment_id;
  if not found then raise exception 'Attendance evidence enrolment not found' using errcode='23503'; end if;

  if new.tenant_id<>v_submission.tenant_id
    or new.school_id<>v_submission.school_id
    or new.attendance_date<>v_submission.attendance_date
  then raise exception 'Attendance evidence does not match register submission scope' using errcode='23514'; end if;

  if v_enrolment.tenant_id<>new.tenant_id
    or v_enrolment.school_id<>new.school_id
    or v_enrolment.register_class_id<>v_submission.register_class_id
    or v_enrolment.academic_year<>v_submission.academic_year
    or v_enrolment.enrolled_from>new.attendance_date
    or (v_enrolment.enrolled_to is not null and v_enrolment.enrolled_to<new.attendance_date)
  then raise exception 'Attendance evidence learner is outside the submitted register scope' using errcode='23514'; end if;

  return new;
end;
$$;
revoke all on function app_private.enforce_attendance_evidence_integrity() from public,anon,authenticated;

drop trigger if exists attendance_evidence_integrity_guard on public.attendance_evidence;
create trigger attendance_evidence_integrity_guard
before insert or update on public.attendance_evidence
for each row execute function app_private.enforce_attendance_evidence_integrity();

-- Upload may occur just before metadata registration, so the uploader can place an
-- object in their own school/user prefix. Reads become need-to-know once metadata links
-- the object to a register submission; own uploader access remains available for cleanup.
drop policy if exists "attendance users can read evidence" on storage.objects;
create policy "need to know users read attendance evidence objects"
on storage.objects for select to authenticated
using (
  bucket_id='attendance-evidence'
  and (
    (array_length(storage.foldername(name),1)>=2 and (storage.foldername(name))[2]=(select auth.uid())::text)
    or exists(
      select 1
      from public.attendance_evidence ae
      where ae.storage_path=name
        and app_private.can_read_attendance_evidence(ae.id)
    )
  )
);

comment on function app_private.can_read_attendance_evidence(uuid) is
'Need-to-know health/evidence scope: uploader, platform admin, school leadership/counsellor, or the learner assigned register teacher. Generic teacher/HOD/librarian access is insufficient.';

comment on function public.record_attendance_event(uuid,date,text,uuid,text,text,uuid,uuid,uuid,text) is
'Legacy raw attendance mutation retained for historical compatibility but not executable by authenticated clients. Use submit_daily_register or submit_subject_period_attendance.';