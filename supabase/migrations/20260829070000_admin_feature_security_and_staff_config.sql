-- Security closure and the smallest school-scoped staff configuration required by
-- the parent/class administration UI. Candidate writes remain governed and
-- guardian evidence metadata must refer to a real private object owned by the
-- submitting account.

create or replace function app_private.enforce_examination_candidate_identity()
returns trigger
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_enrolment public.enrolments%rowtype;
  v_cycle public.examination_cycles%rowtype;
begin
  select * into v_enrolment from public.enrolments where id=new.enrolment_id;
  select * into v_cycle from public.examination_cycles where id=new.examination_cycle_id;
  if not found or v_enrolment.id is null or v_cycle.id is null then
    raise exception 'Candidate cycle and enrolment are required';
  end if;
  if new.learner_id<>v_enrolment.learner_id then
    raise exception 'Candidate learner must match the selected enrolment' using errcode='23514';
  end if;
  if new.school_id<>v_enrolment.school_id or new.school_id<>v_cycle.school_id
     or new.tenant_id<>v_enrolment.tenant_id or new.tenant_id<>v_cycle.tenant_id then
    raise exception 'Candidate, enrolment and examination cycle must share school and tenant' using errcode='23514';
  end if;
  return new;
end;
$$;

drop trigger if exists examination_candidate_identity_scope on public.examination_candidates;
create trigger examination_candidate_identity_scope
before insert or update of learner_id,enrolment_id,examination_cycle_id,school_id,tenant_id
on public.examination_candidates
for each row execute function app_private.enforce_examination_candidate_identity();

create or replace function public.register_examination_candidate(
  p_examination_cycle_id uuid,
  p_enrolment_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_cycle public.examination_cycles%rowtype;
  v_enrolment public.enrolments%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_cycle from public.examination_cycles where id=p_examination_cycle_id;
  select * into v_enrolment from public.enrolments where id=p_enrolment_id;
  if v_cycle.id is null or v_enrolment.id is null then raise exception 'Examination cycle or enrolment not found'; end if;
  if not app_private.can_manage_examinations(v_cycle.school_id) then raise exception 'Permission denied'; end if;
  if v_cycle.school_id<>v_enrolment.school_id or v_cycle.tenant_id<>v_enrolment.tenant_id then
    raise exception 'Enrolment does not belong to this examination cycle school';
  end if;
  insert into public.examination_candidates(
    tenant_id,school_id,examination_cycle_id,learner_id,enrolment_id,status
  ) values(
    v_cycle.tenant_id,v_cycle.school_id,v_cycle.id,v_enrolment.learner_id,v_enrolment.id,'draft'
  )
  on conflict(examination_cycle_id,learner_id) do update
    set enrolment_id=excluded.enrolment_id,updated_at=now()
  returning id into v_id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_cycle.tenant_id,v_cycle.school_id,auth.uid(),'examination.candidate.registered','examination_candidate',v_id,
    jsonb_build_object('cycle_id',v_cycle.id,'enrolment_id',v_enrolment.id,'learner_id',v_enrolment.learner_id));
  return v_id;
end;
$$;

revoke insert,update,delete on public.examination_candidates from authenticated;
revoke all on function public.register_examination_candidate(uuid,uuid) from public,anon;
grant execute on function public.register_examination_candidate(uuid,uuid) to authenticated;

alter table public.staff_school_assignments
  add column if not exists staff_code text,
  add column if not exists default_room_id uuid references public.school_rooms(id) on delete set null;

create unique index if not exists staff_school_assignments_active_code_uidx
  on public.staff_school_assignments(school_id,lower(staff_code))
  where staff_code is not null and effective_to is null;
create index if not exists staff_school_assignments_default_room_idx
  on public.staff_school_assignments(default_room_id)
  where default_room_id is not null;

create or replace function app_private.enforce_staff_assignment_room_scope()
returns trigger
language plpgsql
security definer
set search_path=public,app_private
as $$
declare v_room public.school_rooms%rowtype;
begin
  new.staff_code:=nullif(upper(btrim(coalesce(new.staff_code,''))),'');
  if new.staff_code is not null and new.staff_code!~'^[A-Z0-9][A-Z0-9_-]{0,11}$' then
    raise exception 'Staff code must be 1-12 letters, numbers, hyphens or underscores' using errcode='22023';
  end if;
  if new.default_room_id is null then return new; end if;
  select * into v_room from public.school_rooms where id=new.default_room_id;
  if not found or v_room.school_id<>new.school_id or v_room.tenant_id<>new.tenant_id then
    raise exception 'Default room must belong to the same school and tenant' using errcode='23514';
  end if;
  return new;
end;
$$;

drop trigger if exists staff_assignment_room_scope on public.staff_school_assignments;
create trigger staff_assignment_room_scope
before insert or update of staff_code,default_room_id,school_id,tenant_id
on public.staff_school_assignments
for each row execute function app_private.enforce_staff_assignment_room_scope();

create or replace function public.configure_staff_school_assignment(
  p_assignment_id uuid,
  p_staff_code text default null,
  p_default_room_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare v_assignment public.staff_school_assignments%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_assignment from public.staff_school_assignments where id=p_assignment_id for update;
  if not found then raise exception 'Staff school assignment not found'; end if;
  if not app_private.has_school_role(v_assignment.school_id,array['school_admin'])
     and not app_private.has_platform_role(array['platform_admin']) then raise exception 'Permission denied'; end if;
  update public.staff_school_assignments
  set staff_code=p_staff_code,default_room_id=p_default_room_id,updated_at=now()
  where id=v_assignment.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_assignment.tenant_id,v_assignment.school_id,auth.uid(),'staff.assignment.configuration.updated','staff_school_assignment',v_assignment.id,
    jsonb_build_object('staff_code',nullif(upper(btrim(coalesce(p_staff_code,''))),''),'default_room_id',p_default_room_id));
  return true;
end;
$$;

revoke all on function public.configure_staff_school_assignment(uuid,text,uuid) from public,anon;
grant execute on function public.configure_staff_school_assignment(uuid,text,uuid) to authenticated;

create or replace function public.register_guardian_absence_attachment(
  p_notice_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint
)
returns uuid
language plpgsql security definer set search_path=public,storage as $$
declare v_notice public.guardian_absence_notices%rowtype; v_id uuid; v_prefix text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_notice from public.guardian_absence_notices where id=p_notice_id;
  if not found or v_notice.submitted_by_user_id<>auth.uid() then raise exception 'Absence notice not found'; end if;
  if v_notice.status not in ('submitted','returned') then raise exception 'Attachments can no longer be changed for this notice'; end if;
  if p_mime_type not in ('image/jpeg','image/png','image/webp','application/pdf') then raise exception 'Unsupported attachment type'; end if;
  if p_file_size_bytes<=0 or p_file_size_bytes>10485760 then raise exception 'Attachment must be 10 MB or smaller'; end if;
  v_prefix:=v_notice.tenant_id::text||'/'||v_notice.school_id::text||'/'||v_notice.id::text||'/'||auth.uid()::text||'/';
  if p_storage_path not like v_prefix||'%' or p_storage_path like '%..%' or btrim(coalesce(p_file_name,''))='' then
    raise exception 'Attachment path is invalid';
  end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='guardian-absence-evidence' and o.name=p_storage_path) then
    raise exception 'Uploaded attachment was not found';
  end if;
  insert into public.guardian_absence_notice_attachments(tenant_id,school_id,notice_id,storage_path,file_name,mime_type,file_size_bytes,uploaded_by_user_id)
  values(v_notice.tenant_id,v_notice.school_id,v_notice.id,p_storage_path,btrim(p_file_name),p_mime_type,p_file_size_bytes,auth.uid()) returning id into v_id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_notice.tenant_id,v_notice.school_id,auth.uid(),'guardian.absence_attachment.registered','guardian_absence_notice',v_notice.id,
    jsonb_build_object('attachment_id',v_id,'mime_type',p_mime_type,'file_size_bytes',p_file_size_bytes));
  return v_id;
end;
$$;

comment on column public.staff_school_assignments.staff_code is
'Editable school-specific operational code used on timetables and internal schedules; never derived from the staff member legal name.';
comment on column public.staff_school_assignments.default_room_id is
'Optional school-specific base teaching location used as a timetable-entry default, not as a permanent room booking.';
