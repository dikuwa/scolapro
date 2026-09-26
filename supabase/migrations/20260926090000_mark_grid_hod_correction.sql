-- Issue #685: mark-grid review/correction authority hardening.
-- Reuses canonical assessment instances, append-only learner marks and audit events.

create or replace function app_private.can_review_assessment_subject(
  p_school_id uuid,
  p_subject_offering_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or (
      app_private.user_current_school_matches((select auth.uid()),p_school_id)
      and not app_private.has_platform_role(array['platform_support'])
      and (
        app_private.has_school_role(
          p_school_id,
          array['school_admin','principal','deputy_principal']
        )
        or exists(
          select 1
          from public.subject_offerings so
          where so.id=p_subject_offering_id
            and so.school_id=p_school_id
            and app_private.hod_responsible_for_subject(
              p_school_id,
              so.subject_id
            )
        )
      )
    );
$$;

revoke all on function app_private.can_review_assessment_subject(uuid,uuid)
from public,anon;
grant execute on function app_private.can_review_assessment_subject(uuid,uuid)
to authenticated;

create or replace function app_private.can_manage_assessment_instance_scope(
  p_school_id uuid,
  p_academic_year integer,
  p_subject_offering_id uuid,
  p_register_class_id uuid,
  p_teacher_allocation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.can_review_assessment_subject(
      p_school_id,p_subject_offering_id
    )
    or (
      (select auth.uid()) is not null
      and not app_private.has_platform_role(array['platform_support'])
      and app_private.is_current_school(p_school_id)
      and exists(
        select 1
        from public.school_memberships sm
        join public.staff_members staff
          on staff.id=sm.staff_member_id
         and staff.tenant_id=sm.tenant_id
         and staff.status='active'
        join public.teacher_allocations ta
          on ta.id=p_teacher_allocation_id
         and ta.staff_member_id=staff.id
         and ta.tenant_id=sm.tenant_id
         and ta.school_id=p_school_id
         and ta.academic_year=p_academic_year
         and ta.subject_offering_id=p_subject_offering_id
         and ta.register_class_id=p_register_class_id
         and ta.active_from<=current_date
         and (ta.active_to is null or ta.active_to>=current_date)
        where sm.user_id=(select auth.uid())
          and sm.school_id=p_school_id
          and sm.role_key in ('teacher','class_teacher','hod')
          and sm.active_from<=current_date
          and (sm.active_to is null or sm.active_to>=current_date)
          and app_private.staff_member_covers_school_period(
            staff.id,p_school_id,current_date,current_date
          )
      )
    );
$$;

revoke all on function app_private.can_manage_assessment_instance_scope(uuid,integer,uuid,uuid,uuid)
from public,anon;
grant execute on function app_private.can_manage_assessment_instance_scope(uuid,integer,uuid,uuid,uuid)
to authenticated;

create or replace function public.review_mark_submission(
  p_submission_id uuid,
  p_decision text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,app_private,auth
as $$
declare
  v_submission public.mark_submissions%rowtype;
  v_instance public.assessment_instances%rowtype;
  v_new_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_decision not in ('return','verify') then raise exception 'Decision must be return or verify'; end if;
  select * into v_submission from public.mark_submissions where id=p_submission_id for update;
  if not found then raise exception 'Mark submission not found'; end if;
  select * into v_instance from public.assessment_instances where id=v_submission.assessment_instance_id for update;
  if not app_private.can_review_assessment_subject(v_instance.school_id,v_instance.subject_offering_id) then
    raise exception 'Permission denied';
  end if;
  if v_submission.status<>'submitted' then raise exception 'Submission has already been reviewed'; end if;
  if p_decision='return' and nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'A return reason is required'; end if;

  v_new_status:=case when p_decision='verify' then 'verified' else 'returned' end;
  update public.mark_submissions
     set status=v_new_status,reviewed_by_user_id=auth.uid(),reviewed_at=now(),
         review_note=nullif(btrim(coalesce(p_note,'')),'')
   where id=v_submission.id;
  update public.assessment_instances
     set status=case when p_decision='verify' then 'verified' else 'returned' end,
         updated_at=now()
   where id=v_instance.id;
  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_instance.tenant_id,v_instance.school_id,auth.uid(),
    'assessment.reviewed','assessment_instance',v_instance.id,
    jsonb_build_object(
      'submission_id',v_submission.id,'decision',p_decision,
      'note',nullif(btrim(coalesce(p_note,'')),'')
    )
  );
  return true;
end;
$$;

revoke all on function public.review_mark_submission(uuid,text,text)
from public,anon;
grant execute on function public.review_mark_submission(uuid,text,text)
to authenticated;

create table if not exists public.assessment_correction_requests(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  assessment_instance_id uuid not null references public.assessment_instances(id) on delete restrict,
  reason text not null check (char_length(btrim(reason))>=3),
  status text not null default 'requested'
    check (status in ('requested','reopened','closed')),
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  reopened_by_user_id uuid references auth.users(id) on delete restrict,
  reopened_at timestamptz,
  closed_at timestamptz
);

create index if not exists assessment_correction_requests_instance_idx
  on public.assessment_correction_requests(assessment_instance_id,requested_at desc);

alter table public.assessment_correction_requests enable row level security;

create policy "scoped academic staff can read assessment correction requests"
on public.assessment_correction_requests for select to authenticated
using (
  exists(
    select 1 from public.assessment_instances ai
    where ai.id=assessment_correction_requests.assessment_instance_id
      and app_private.can_access_assessment_instance(ai.id)
  )
);

revoke all on public.assessment_correction_requests from anon;
grant select on public.assessment_correction_requests to authenticated;

create or replace function public.request_assessment_correction(
  p_assessment_instance_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private,auth
as $$
declare
  v_instance public.assessment_instances%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null or char_length(btrim(p_reason))<3 then
    raise exception 'A correction reason is required';
  end if;
  select * into v_instance
  from public.assessment_instances
  where id=p_assessment_instance_id
  for update;
  if not found then raise exception 'Assessment instance not found'; end if;
  if not app_private.can_access_assessment_instance(v_instance.id) then
    raise exception 'Permission denied';
  end if;
  if v_instance.status not in ('review','verified','locked') then
    raise exception 'Correction request is only required after submission';
  end if;

  insert into public.assessment_correction_requests(
    tenant_id,school_id,assessment_instance_id,reason,requested_by_user_id
  ) values(
    v_instance.tenant_id,v_instance.school_id,v_instance.id,btrim(p_reason),auth.uid()
  ) returning id into v_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_instance.tenant_id,v_instance.school_id,auth.uid(),
    'assessment.correction_requested','assessment_instance',v_instance.id,
    jsonb_build_object('correction_request_id',v_id,'reason',btrim(p_reason),'status',v_instance.status)
  );
  return v_id;
end;
$$;

create or replace function public.reopen_assessment_for_correction(
  p_correction_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,app_private,auth
as $$
declare
  v_request public.assessment_correction_requests%rowtype;
  v_instance public.assessment_instances%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_request
  from public.assessment_correction_requests
  where id=p_correction_request_id
  for update;
  if not found then raise exception 'Assessment correction request not found'; end if;
  if v_request.status<>'requested' then raise exception 'Assessment correction request is already resolved'; end if;

  select * into v_instance
  from public.assessment_instances
  where id=v_request.assessment_instance_id
  for update;
  if not app_private.can_review_assessment_subject(v_instance.school_id,v_instance.subject_offering_id) then
    raise exception 'Permission denied';
  end if;

  -- Locked source data may already underpin immutable official results. This
  -- bounded workflow never silently unlocks that finality.
  if v_instance.status='locked' then
    raise exception 'Locked assessment requires the governed official-result correction workflow';
  end if;
  if v_instance.status not in ('review','verified') then
    raise exception 'Assessment is not eligible for governed reopen';
  end if;

  update public.assessment_instances
     set status='returned',updated_at=now()
   where id=v_instance.id;
  update public.mark_submissions
     set status='returned',reviewed_by_user_id=auth.uid(),reviewed_at=now(),
         review_note=v_request.reason
   where assessment_instance_id=v_instance.id
     and status in ('submitted','verified');

  update public.assessment_correction_requests
     set status='reopened',reopened_by_user_id=auth.uid(),reopened_at=now()
   where id=v_request.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_instance.tenant_id,v_instance.school_id,auth.uid(),
    'assessment.reopened_for_correction','assessment_instance',v_instance.id,
    jsonb_build_object('correction_request_id',v_request.id,'reason',v_request.reason)
  );
  return true;
end;
$$;

revoke all on function public.request_assessment_correction(uuid,text)
from public,anon;
grant execute on function public.request_assessment_correction(uuid,text)
to authenticated;
revoke all on function public.reopen_assessment_for_correction(uuid)
from public,anon;
grant execute on function public.reopen_assessment_for_correction(uuid)
to authenticated;

comment on function app_private.can_review_assessment_subject(uuid,uuid) is
'Assessment review authority: Platform Admin; current-school School Admin/Principal/Deputy; or current-school HOD only for an explicitly assigned subject portfolio. Platform Support is excluded.';
comment on table public.assessment_correction_requests is
'Governed correction requests for submitted assessment instances. A reason and audit event are mandatory; locked official-result source data is never silently unlocked.';
