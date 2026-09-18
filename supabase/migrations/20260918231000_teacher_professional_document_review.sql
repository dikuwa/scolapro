-- Issue #495: teacher-selected professional-document submission and HOD review.
-- Reuses teacher_professional_documents and subject_department_responsibilities.
-- No official Ministry/NIED teacher-file taxonomy is introduced.

create table public.teacher_professional_document_review_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  document_id uuid not null unique references public.teacher_professional_documents(id) on delete restrict,
  owner_staff_member_id uuid not null references public.staff_members(id) on delete restrict,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  submitted_by_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'submitted' check (status in ('submitted','returned','reviewed')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index teacher_professional_document_review_queue_idx
  on public.teacher_professional_document_review_submissions(school_id,subject_id,status,submitted_at desc);

create table public.teacher_professional_document_review_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  submission_id uuid not null references public.teacher_professional_document_review_submissions(id) on delete restrict,
  event_kind text not null check (event_kind in ('submitted','returned','reviewed','resubmitted')),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_role_snapshot text not null check (actor_role_snapshot in ('teacher','class_teacher','hod')),
  actor_staff_member_id uuid references public.staff_members(id) on delete restrict,
  actor_staff_assignment_id uuid references public.staff_school_assignments(id) on delete set null,
  comment text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index teacher_professional_document_review_events_submission_idx
  on public.teacher_professional_document_review_events(submission_id,occurred_at,id);

alter table public.teacher_professional_document_review_submissions enable row level security;
alter table public.teacher_professional_document_review_events enable row level security;

revoke all on public.teacher_professional_document_review_submissions from anon,authenticated;
revoke all on public.teacher_professional_document_review_events from anon,authenticated;
grant select on public.teacher_professional_document_review_submissions to authenticated;
grant select on public.teacher_professional_document_review_events to authenticated;

create or replace function app_private.can_review_teacher_professional_document_submission(
  p_submission_id uuid
) returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select exists (
    select 1
    from public.teacher_professional_document_review_submissions s
    join public.teacher_professional_documents d on d.id=s.document_id
    where s.id=p_submission_id
      and s.school_id=d.school_id
      and s.owner_staff_member_id=d.owner_staff_member_id
      and s.submitted_by_user_id <> auth.uid()
      and app_private.user_current_school_matches((select auth.uid()),s.school_id)
      and exists (
        select 1
        from public.school_memberships sm
        join public.staff_members staff
          on staff.id=sm.staff_member_id
         and staff.user_id=auth.uid()
         and staff.status='active'
        join public.staff_school_assignments ssa
          on ssa.staff_member_id=sm.staff_member_id
         and ssa.school_id=sm.school_id
         and ssa.tenant_id=sm.tenant_id
         and ssa.effective_from<=current_date
         and (ssa.effective_to is null or ssa.effective_to>=current_date)
        where sm.user_id=auth.uid()
          and sm.school_id=s.school_id
          and sm.role_key='hod'
          and sm.active_from<=current_date
          and (sm.active_to is null or sm.active_to>=current_date)
      )
      and app_private.hod_responsible_for_subject(s.school_id,s.subject_id)
  );
$$;

revoke all on function app_private.can_review_teacher_professional_document_submission(uuid)
from public,anon;
grant execute on function app_private.can_review_teacher_professional_document_submission(uuid)
to authenticated;

create or replace function app_private.can_read_teacher_professional_document_submission(
  p_submission_id uuid
) returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select exists (
    select 1
    from public.teacher_professional_document_review_submissions s
    where s.id=p_submission_id
      and (
        app_private.user_owns_teacher_professional_documents(
          auth.uid(),s.school_id,s.owner_staff_member_id
        )
        or app_private.can_review_teacher_professional_document_submission(s.id)
      )
  );
$$;

revoke all on function app_private.can_read_teacher_professional_document_submission(uuid)
from public,anon;
grant execute on function app_private.can_read_teacher_professional_document_submission(uuid)
to authenticated;

create policy "scoped staff read professional document review submissions"
on public.teacher_professional_document_review_submissions
for select to authenticated
using (app_private.can_read_teacher_professional_document_submission(id));

create policy "scoped staff read professional document review events"
on public.teacher_professional_document_review_events
for select to authenticated
using (app_private.can_read_teacher_professional_document_submission(submission_id));

-- Existing professional-document rows remain owner-only unless the teacher
-- explicitly submitted that exact document and the viewer currently owns the
-- matching HOD subject responsibility.
create policy "responsible hod reads explicitly submitted professional documents"
on public.teacher_professional_documents
for select to authenticated
using (
  exists (
    select 1
    from public.teacher_professional_document_review_submissions s
    where s.document_id=teacher_professional_documents.id
      and app_private.can_review_teacher_professional_document_submission(s.id)
  )
);

create or replace function app_private.enforce_teacher_professional_document_review_submission_integrity()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if tg_op='DELETE' then
    raise exception 'Professional document review submissions preserve history and cannot be deleted';
  end if;
  if new.id is distinct from old.id
    or new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.document_id is distinct from old.document_id
    or new.owner_staff_member_id is distinct from old.owner_staff_member_id
    or new.subject_id is distinct from old.subject_id
    or new.submitted_by_user_id is distinct from old.submitted_by_user_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Professional document review submission identity is immutable';
  end if;
  new.updated_at:=now();
  return new;
end;
$$;

revoke all on function app_private.enforce_teacher_professional_document_review_submission_integrity()
from public,anon,authenticated;

create trigger teacher_professional_document_review_submission_integrity_trg
before update or delete on public.teacher_professional_document_review_submissions
for each row execute function app_private.enforce_teacher_professional_document_review_submission_integrity();

create or replace function app_private.prevent_teacher_professional_document_review_event_mutation()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  raise exception 'Professional document review history is append-only';
end;
$$;

revoke all on function app_private.prevent_teacher_professional_document_review_event_mutation()
from public,anon,authenticated;

create trigger teacher_professional_document_review_event_immutable_trg
before update or delete on public.teacher_professional_document_review_events
for each row execute function app_private.prevent_teacher_professional_document_review_event_mutation();

create or replace function public.submit_teacher_professional_document_for_review(
  p_document_id uuid,
  p_subject_id uuid
) returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_document public.teacher_professional_documents%rowtype;
  v_submission public.teacher_professional_document_review_submissions%rowtype;
  v_actor_role text;
  v_assignment_id uuid;
  v_event_kind text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_document
  from public.teacher_professional_documents
  where id=p_document_id
  for share;
  if not found then raise exception 'Professional document not found'; end if;

  if v_document.status<>'active' then
    raise exception 'Only active professional documents can be submitted for review';
  end if;

  if not app_private.user_owns_teacher_professional_documents(
    auth.uid(),v_document.school_id,v_document.owner_staff_member_id
  ) then
    raise exception 'Teacher document owner authority required';
  end if;

  if not exists (
    select 1
    from public.teacher_allocations ta
    join public.subject_offerings so
      on so.id=ta.subject_offering_id
     and so.school_id=ta.school_id
     and so.tenant_id=ta.tenant_id
    where ta.school_id=v_document.school_id
      and ta.staff_member_id=v_document.owner_staff_member_id
      and so.subject_id=p_subject_id
      and ta.active_from<=current_date
      and (ta.active_to is null or ta.active_to>=current_date)
  ) then
    raise exception 'Review subject must be one of the teacher current allocations';
  end if;

  select sm.role_key,ssa.id
  into v_actor_role,v_assignment_id
  from public.school_memberships sm
  join public.staff_school_assignments ssa
    on ssa.staff_member_id=sm.staff_member_id
   and ssa.school_id=sm.school_id
   and ssa.tenant_id=sm.tenant_id
   and ssa.effective_from<=current_date
   and (ssa.effective_to is null or ssa.effective_to>=current_date)
  where sm.user_id=auth.uid()
    and sm.school_id=v_document.school_id
    and sm.staff_member_id=v_document.owner_staff_member_id
    and sm.role_key in ('teacher','class_teacher','hod')
    and sm.active_from<=current_date
    and (sm.active_to is null or sm.active_to>=current_date)
  order by case sm.role_key when 'teacher' then 1 when 'class_teacher' then 2 else 3 end,
           ssa.effective_from desc
  limit 1;

  if v_actor_role is null then raise exception 'Current teacher placement is required'; end if;

  select * into v_submission
  from public.teacher_professional_document_review_submissions
  where document_id=v_document.id
  for update;

  if not found then
    insert into public.teacher_professional_document_review_submissions(
      tenant_id,school_id,document_id,owner_staff_member_id,subject_id,
      submitted_by_user_id,status,submitted_at
    ) values(
      v_document.tenant_id,v_document.school_id,v_document.id,
      v_document.owner_staff_member_id,p_subject_id,auth.uid(),'submitted',now()
    )
    returning * into v_submission;
    v_event_kind:='submitted';
  else
    if v_submission.submitted_by_user_id<>auth.uid() then
      raise exception 'Only the original teacher submitter can resubmit this document';
    end if;
    if v_submission.subject_id<>p_subject_id then
      raise exception 'Resubmission must keep the original review subject';
    end if;
    if v_submission.status='submitted' then
      raise exception 'Professional document is already awaiting review';
    end if;
    if v_submission.status='reviewed' then
      raise exception 'Reviewed professional documents are final for this review cycle';
    end if;

    update public.teacher_professional_document_review_submissions
    set status='submitted',submitted_at=now(),reviewed_at=null,review_note=null
    where id=v_submission.id
    returning * into v_submission;
    v_event_kind:='resubmitted';
  end if;

  insert into public.teacher_professional_document_review_events(
    tenant_id,school_id,submission_id,event_kind,actor_user_id,
    actor_role_snapshot,actor_staff_member_id,actor_staff_assignment_id
  ) values(
    v_submission.tenant_id,v_submission.school_id,v_submission.id,v_event_kind,
    auth.uid(),v_actor_role,v_submission.owner_staff_member_id,v_assignment_id
  );

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_submission.tenant_id,v_submission.school_id,auth.uid(),
    case when v_event_kind='submitted'
      then 'teacher_professional_document.review_submitted'
      else 'teacher_professional_document.review_resubmitted' end,
    'teacher_professional_document_review',v_submission.id,
    jsonb_build_object('document_id',v_document.id,'subject_id',v_submission.subject_id)
  );

  return v_submission.id;
end;
$$;

revoke all on function public.submit_teacher_professional_document_for_review(uuid,uuid)
from public,anon;
grant execute on function public.submit_teacher_professional_document_for_review(uuid,uuid)
to authenticated;

create or replace function public.review_teacher_professional_document_submission(
  p_submission_id uuid,
  p_action text,
  p_comment text default null
) returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_submission public.teacher_professional_document_review_submissions%rowtype;
  v_staff_member_id uuid;
  v_assignment_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_action not in ('reviewed','returned') then
    raise exception 'Review action must be reviewed or returned';
  end if;
  if length(coalesce(p_comment,''))>2000 then
    raise exception 'Review feedback is too long';
  end if;

  select * into v_submission
  from public.teacher_professional_document_review_submissions
  where id=p_submission_id
  for update;
  if not found then raise exception 'Professional document review submission not found'; end if;

  if not app_private.can_review_teacher_professional_document_submission(v_submission.id) then
    raise exception 'Permission denied: current responsible HOD authority required';
  end if;
  if v_submission.status<>'submitted' then
    raise exception 'Only submitted professional documents can be reviewed or returned';
  end if;

  select sm.staff_member_id,ssa.id
  into v_staff_member_id,v_assignment_id
  from public.school_memberships sm
  join public.staff_school_assignments ssa
    on ssa.staff_member_id=sm.staff_member_id
   and ssa.school_id=sm.school_id
   and ssa.tenant_id=sm.tenant_id
   and ssa.effective_from<=current_date
   and (ssa.effective_to is null or ssa.effective_to>=current_date)
  where sm.user_id=auth.uid()
    and sm.school_id=v_submission.school_id
    and sm.role_key='hod'
    and sm.active_from<=current_date
    and (sm.active_to is null or sm.active_to>=current_date)
  order by ssa.effective_from desc
  limit 1;

  if v_staff_member_id is null then
    raise exception 'Permission denied: current responsible HOD authority required';
  end if;

  update public.teacher_professional_document_review_submissions
  set status=p_action,reviewed_at=now(),review_note=nullif(btrim(coalesce(p_comment,'')),'')
  where id=v_submission.id;

  insert into public.teacher_professional_document_review_events(
    tenant_id,school_id,submission_id,event_kind,actor_user_id,
    actor_role_snapshot,actor_staff_member_id,actor_staff_assignment_id,comment
  ) values(
    v_submission.tenant_id,v_submission.school_id,v_submission.id,p_action,
    auth.uid(),'hod',v_staff_member_id,v_assignment_id,
    nullif(btrim(coalesce(p_comment,'')),'')
  );

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_submission.tenant_id,v_submission.school_id,auth.uid(),
    case when p_action='reviewed'
      then 'teacher_professional_document.reviewed'
      else 'teacher_professional_document.returned' end,
    'teacher_professional_document_review',v_submission.id,
    jsonb_build_object('document_id',v_submission.document_id,'subject_id',v_submission.subject_id)
  );

  return true;
end;
$$;

revoke all on function public.review_teacher_professional_document_submission(uuid,text,text)
from public,anon;
grant execute on function public.review_teacher_professional_document_submission(uuid,text,text)
to authenticated;

comment on table public.teacher_professional_document_review_submissions is
'Teacher-selected review metadata over the canonical teacher_professional_documents row. The document remains teacher-owned; HOD visibility exists only for explicit submissions within current subject responsibility.';
comment on table public.teacher_professional_document_review_events is
'Append-only professional-document review lifecycle provenance: submit, return, review and resubmit.';
comment on function public.submit_teacher_professional_document_for_review(uuid,uuid) is
'Owner-only submission/resubmission of an active professional document to a subject-scoped HOD review. Review subject must come from a current teacher allocation.';
comment on function public.review_teacher_professional_document_submission(uuid,text,text) is
'Current responsible HOD review/return action with self-review separation, effective placement and append-only feedback provenance.';
