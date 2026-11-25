-- #1306 Lane C: complete the guardian absence-notice loop without weakening the
-- authoritative attendance register. Notices remain contextual evidence only.
--
-- 1. Duplicate active submissions for the same learner/period are refused so a
--    retried or double-clicked form cannot create parallel notices with divergent
--    review outcomes.
-- 2. Review transitions are bounded (accepted/closed are final) instead of
--    allowing any authorized reviewer to reopen or overwrite a colleague.
-- 3. A checked review wrapper rejects a stale reviewer form after an intervening
--    decision, mirroring the canonical checked-write pattern used elsewhere.
-- 4. Reviewers are notified of a new notice and the submitting guardian of the
--    outcome. Notifications carry no learner name or absence detail.

create or replace function public.submit_guardian_absence_notice(
  p_learner_id uuid,
  p_absence_from date,
  p_absence_to date,
  p_reason_category text default 'other',
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_guardian_id uuid;
  v_enrol public.enrolments%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_absence_to<p_absence_from then raise exception 'Absence end date cannot precede start date'; end if;
  if p_reason_category not in ('illness','medical_appointment','compassionate','family','transport','weather','school_activity','other') then
    raise exception 'Unsupported absence reason category';
  end if;

  select gul.guardian_id into v_guardian_id
  from public.guardian_user_links gul
  join public.learner_guardians lg on lg.guardian_id=gul.guardian_id
  where gul.user_id=auth.uid()
    and lg.learner_id=p_learner_id
    and lg.effective_from<=current_date
    and (lg.effective_to is null or lg.effective_to>=current_date)
  order by lg.priority
  limit 1;

  if v_guardian_id is null then raise exception 'You are not linked to this learner'; end if;

  select * into v_enrol
  from public.enrolments
  where learner_id=p_learner_id
    and status='current'
    and enrolled_from<=current_date
    and (enrolled_to is null or enrolled_to>=current_date)
  order by academic_year desc,enrolled_from desc
  limit 1;

  if not found then raise exception 'Current learner enrolment not found'; end if;

  if p_absence_from<v_enrol.enrolled_from
    or (v_enrol.enrolled_to is not null and p_absence_to>v_enrol.enrolled_to) then
    raise exception 'Absence period is outside the learner enrolment period';
  end if;

  if exists(
    select 1 from public.guardian_absence_notices n
    where n.learner_id=p_learner_id
      and n.absence_from=p_absence_from
      and n.absence_to=p_absence_to
      and n.status in ('submitted','under_review','accepted')
  ) then
    raise exception 'An active absence notice already covers these dates';
  end if;

  insert into public.guardian_absence_notices(
    tenant_id,school_id,learner_id,enrolment_id,guardian_id,submitted_by_user_id,
    absence_from,absence_to,reason_category,message
  ) values(
    v_enrol.tenant_id,v_enrol.school_id,p_learner_id,v_enrol.id,v_guardian_id,auth.uid(),
    p_absence_from,p_absence_to,p_reason_category,nullif(btrim(coalesce(p_message,'')),'')
  ) returning id into v_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_enrol.tenant_id,v_enrol.school_id,auth.uid(),
    'guardian.absence_notice.submitted','guardian_absence_notice',v_id,
    jsonb_build_object('learner_id',p_learner_id,'absence_from',p_absence_from,'absence_to',p_absence_to)
  );

  -- Bounded reviewer notification. No learner name, reason or message is copied
  -- into the inbox; the authorized reviewer opens the governed review workspace.
  insert into public.notifications(
    recipient_user_id,tenant_id,school_id,severity,title,body,href
  )
  select distinct sm.user_id,
    v_enrol.tenant_id,
    v_enrol.school_id,
    'info',
    'Absence notice awaiting review',
    'A guardian submitted an absence notice for review.',
    '/school/absence-reviews'
  from public.school_memberships sm
  where sm.school_id=v_enrol.school_id
    and sm.role_key in ('school_admin','principal','deputy_principal','counsellor')
    and sm.active_from<=current_date
    and (sm.active_to is null or sm.active_to>=current_date)
    and sm.user_id is distinct from auth.uid();

  return v_id;
end;
$$;

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
  v_note text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_status not in ('under_review','accepted','returned','closed') then raise exception 'Unsupported review status'; end if;

  select * into v_notice
  from public.guardian_absence_notices
  where id=p_notice_id
  for update;

  if not found then raise exception 'Absence notice not found'; end if;
  if not app_private.can_review_guardian_absence_notice(v_notice.id) then raise exception 'Permission denied'; end if;
  if v_notice.status=p_status then raise exception 'Absence notice is already in the requested review state'; end if;
  if not (
    (v_notice.status='submitted' and p_status in ('under_review','accepted','returned','closed'))
    or (v_notice.status='under_review' and p_status in ('accepted','returned','closed'))
    or (v_notice.status='returned' and p_status in ('under_review','accepted','closed'))
    or (v_notice.status='accepted' and p_status='closed')
  ) then
    raise exception 'Absence notice review state cannot change that way';
  end if;

  v_note := nullif(btrim(coalesce(p_review_note,'')),'');

  update public.guardian_absence_notices
  set status=p_status,
      reviewed_by_user_id=auth.uid(),
      reviewed_at=now(),
      review_note=v_note,
      updated_at=now()
  where id=v_notice.id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_notice.tenant_id,v_notice.school_id,auth.uid(),'guardian.absence_notice.reviewed','guardian_absence_notice',v_notice.id,
    jsonb_build_object('learner_id',v_notice.learner_id,'status',p_status,'previous_status',v_notice.status)
  );

  -- The outcome notification is non-authoritative context and is only created
  -- while the submitter still satisfies the notification recipient scope; it can
  -- never block the governed review when a relationship or enrolment has ended.
  if exists(
    select 1
    from public.guardian_user_links gul
    join public.learner_guardians lg
      on lg.tenant_id=gul.tenant_id and lg.guardian_id=gul.guardian_id
    join public.enrolments e
      on e.tenant_id=lg.tenant_id and e.learner_id=lg.learner_id
    where gul.tenant_id=v_notice.tenant_id
      and gul.user_id=v_notice.submitted_by_user_id
      and lg.learner_id=v_notice.learner_id
      and lg.effective_from<=current_date
      and (lg.effective_to is null or lg.effective_to>=current_date)
      and e.school_id=v_notice.school_id
      and e.enrolled_from<=current_date
      and (e.enrolled_to is null or e.enrolled_to>=current_date)
  ) then
    insert into public.notifications(
      recipient_user_id,tenant_id,school_id,severity,title,body,href
    ) values(
      v_notice.submitted_by_user_id,
      v_notice.tenant_id,
      v_notice.school_id,
      case when p_status='returned' then 'warning' when p_status='accepted' then 'success' else 'info' end,
      'Absence notice reviewed',
      case p_status
        when 'accepted' then 'The school accepted your absence notice.'
        when 'returned' then 'The school returned your absence notice for follow-up.'
        when 'under_review' then 'The school started reviewing your absence notice.'
        else 'The school closed your absence notice.'
      end
      || case when v_note is null then '' else ' Open the parent portal for the review note.' end,
      '/parent'
    );
  end if;

  return true;
end;
$$;

revoke all on function public.review_guardian_absence_notice(uuid,text,text) from public,anon;
grant execute on function public.review_guardian_absence_notice(uuid,text,text) to authenticated;

-- Stale-review protection: the editor submits the status and review timestamp it
-- rendered. An intervening decision is refused instead of silently overwritten.
create or replace function public.review_guardian_absence_notice_checked(
  p_notice_id uuid,
  p_status text,
  p_review_note text,
  p_expected_status text,
  p_expected_reviewed_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_notice public.guardian_absence_notices%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_notice
  from public.guardian_absence_notices
  where id=p_notice_id
  for update;
  if not found then raise exception 'Absence notice not found'; end if;
  if not app_private.can_review_guardian_absence_notice(v_notice.id) then raise exception 'Permission denied'; end if;
  if v_notice.status is distinct from p_expected_status
    or v_notice.reviewed_at is distinct from p_expected_reviewed_at then
    raise exception 'Absence notice review changed; reload before saving';
  end if;
  return public.review_guardian_absence_notice(p_notice_id,p_status,p_review_note);
end;
$$;

revoke all on function public.review_guardian_absence_notice_checked(uuid,text,text,text,timestamptz)
from public,anon;
grant execute on function public.review_guardian_absence_notice_checked(uuid,text,text,text,timestamptz)
to authenticated;

comment on function public.review_guardian_absence_notice(uuid,text,text) is
'Governed guardian absence-notice review. Transitions are bounded, acceptance/closure are final, and each transition is audited with the authenticated actor.';
