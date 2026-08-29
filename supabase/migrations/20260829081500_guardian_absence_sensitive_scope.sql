-- Guardian absence evidence can contain medical/health information. Do not inherit the
-- generic operational-learner read helper (which intentionally includes teachers,
-- HODs and librarians). Review is limited to school leadership, counsellors, and the
-- learner's assigned register/class teacher.

create or replace function app_private.can_review_guardian_absence_notice(p_notice_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select exists(
    select 1
    from public.guardian_absence_notices n
    join public.enrolments e on e.id=n.enrolment_id
    where n.id=p_notice_id
      and (
        app_private.has_platform_role(array['platform_admin'])
        or exists(
          select 1
          from public.school_memberships sm
          where sm.school_id=n.school_id
            and sm.user_id=(select auth.uid())
            and sm.role_key in ('school_admin','principal','deputy_principal','counsellor')
            and sm.active_from<=current_date
            and (sm.active_to is null or sm.active_to>=current_date)
        )
        or exists(
          select 1
          from public.register_classes rc
          join public.staff_members staff on staff.id=rc.register_teacher_staff_id
          join public.school_memberships sm on sm.school_id=rc.school_id
            and sm.user_id=(select auth.uid())
            and sm.role_key='class_teacher'
            and sm.active_from<=current_date
            and (sm.active_to is null or sm.active_to>=current_date)
          where rc.id=e.register_class_id
            and rc.school_id=n.school_id
            and staff.user_id=(select auth.uid())
            and staff.status='active'
        )
      )
  );
$$;
revoke all on function app_private.can_review_guardian_absence_notice(uuid) from public,anon,authenticated;

drop policy if exists "school staff read learner absence notices" on public.guardian_absence_notices;
create policy "authorized reviewers read learner absence notices"
on public.guardian_absence_notices for select to authenticated
using (app_private.can_review_guardian_absence_notice(id));

drop policy if exists "school staff read learner absence attachments" on public.guardian_absence_notice_attachments;
create policy "authorized reviewers read learner absence attachments"
on public.guardian_absence_notice_attachments for select to authenticated
using (app_private.can_review_guardian_absence_notice(notice_id));

create or replace function app_private.can_access_guardian_absence_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path=public,storage,app_private
as $$
  select case
    when array_length(storage.foldername(p_name),1) < 3 then false
    when (storage.foldername(p_name))[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
    when (storage.foldername(p_name))[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
    when (storage.foldername(p_name))[3] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
    else exists(
      select 1
      from public.guardian_absence_notices n
      where n.id=((storage.foldername(p_name))[3])::uuid
        and n.school_id=((storage.foldername(p_name))[1])::uuid
        and (
          n.submitted_by_user_id=(select auth.uid())
          or app_private.can_review_guardian_absence_notice(n.id)
        )
    )
  end;
$$;
revoke all on function app_private.can_access_guardian_absence_object(text) from public,anon,authenticated;

create or replace function public.review_guardian_absence_notice(
  p_notice_id uuid,
  p_status text,
  p_review_note text default null
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_notice public.guardian_absence_notices%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_status not in ('under_review','accepted','returned','closed') then raise exception 'Unsupported review status'; end if;

  select * into v_notice
  from public.guardian_absence_notices
  where id=p_notice_id
  for update;

  if not found then raise exception 'Absence notice not found'; end if;
  if not app_private.can_review_guardian_absence_notice(v_notice.id) then raise exception 'Permission denied'; end if;

  update public.guardian_absence_notices
  set status=p_status,
      reviewed_by_user_id=auth.uid(),
      reviewed_at=now(),
      review_note=nullif(btrim(coalesce(p_review_note,'')),''),
      updated_at=now()
  where id=v_notice.id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_notice.tenant_id,v_notice.school_id,auth.uid(),'guardian.absence_notice.reviewed','guardian_absence_notice',v_notice.id,
    jsonb_build_object('learner_id',v_notice.learner_id,'status',p_status)
  );

  return true;
end;
$$;

revoke all on function public.review_guardian_absence_notice(uuid,text,text) from public,anon;
grant execute on function public.review_guardian_absence_notice(uuid,text,text) to authenticated;

comment on function app_private.can_review_guardian_absence_notice(uuid) is
'Need-to-know permission for guardian absence/medical evidence: platform admin, school leadership/counsellor, or the learner assigned register teacher; generic teacher/HOD/librarian learner visibility is insufficient.';