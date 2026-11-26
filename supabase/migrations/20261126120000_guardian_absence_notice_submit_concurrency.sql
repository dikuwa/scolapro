-- The RPC's pre-insert duplicate check is not sufficient: two transactions can
-- both observe no active notice before either insert commits. The partial unique
-- index is the canonical serialization boundary and deliberately excludes only
-- withdrawn/returned/closed notices so the existing lifecycle remains intact.
create unique index if not exists guardian_absence_notices_active_submission_uniq
  on public.guardian_absence_notices(tenant_id, learner_id, absence_from, absence_to)
  where status in ('submitted','under_review','accepted');

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
    where n.tenant_id=v_enrol.tenant_id
      and n.learner_id=p_learner_id
      and n.absence_from=p_absence_from
      and n.absence_to=p_absence_to
      and n.status in ('submitted','under_review','accepted')
  ) then
    raise exception 'An active absence notice already covers these dates';
  end if;

  begin
    insert into public.guardian_absence_notices(
      tenant_id,school_id,learner_id,enrolment_id,guardian_id,submitted_by_user_id,
      absence_from,absence_to,reason_category,message
    ) values(
      v_enrol.tenant_id,v_enrol.school_id,p_learner_id,v_enrol.id,v_guardian_id,auth.uid(),
      p_absence_from,p_absence_to,p_reason_category,nullif(btrim(coalesce(p_message,'')),'')
    ) returning id into v_id;
  exception
    when unique_violation then
      raise exception 'An active absence notice already covers these dates';
  end;

  insert into public.guardian_absence_notice_events(
    tenant_id,school_id,notice_id,event_type,actor_user_id,to_status,note
  ) values(
    v_enrol.tenant_id,v_enrol.school_id,v_id,'submitted',auth.uid(),'submitted',
    nullif(btrim(coalesce(p_message,'')),'')
  );

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_enrol.tenant_id,v_enrol.school_id,auth.uid(),
    'guardian.absence_notice.submitted','guardian_absence_notice',v_id,
    jsonb_build_object('learner_id',p_learner_id,'absence_from',p_absence_from,'absence_to',p_absence_to)
  );

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

revoke all on function public.submit_guardian_absence_notice(uuid,date,date,text,text) from public,anon;
grant execute on function public.submit_guardian_absence_notice(uuid,date,date,text,text) to authenticated;

comment on function public.submit_guardian_absence_notice(uuid,date,date,text,text) is
'Guardian absence submission is serialized by a partial unique index so concurrent duplicate requests create at most one active notice; withdrawn, returned and closed lifecycle states remain reusable.';
