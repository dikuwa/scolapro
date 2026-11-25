-- #1306 Lane C: guardian control of their own notice and per-notice history.
--
-- Policy applied (flag for product-owner confirmation, not an academic rule):
-- * A guardian may withdraw their own notice while it is submitted, under review
--   or returned. Withdrawal is final for that notice and does not alter attendance.
-- * A guardian may correct and resubmit a notice the school returned. This clears
--   the previous review decision so it re-enters the review queue; the previous
--   decision remains in the append-only event history and audit log.
-- * Reviewers cannot review a withdrawn notice and the school cannot re-open one.
--
-- Adds an append-only per-notice event history readable by the submitting guardian
-- and authorized reviewers, with a backfill for existing notices.

alter table public.guardian_absence_notices
  drop constraint if exists guardian_absence_notices_status_check;
alter table public.guardian_absence_notices
  add constraint guardian_absence_notices_status_check
  check (status in ('submitted','under_review','accepted','returned','closed','withdrawn'));

create table if not exists public.guardian_absence_notice_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  notice_id uuid not null references public.guardian_absence_notices(id) on delete cascade,
  event_type text not null check (event_type in ('submitted','reviewed','resubmitted','withdrawn')),
  actor_user_id uuid references auth.users(id) on delete set null,
  from_status text,
  to_status text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists guardian_absence_notice_events_notice_idx
  on public.guardian_absence_notice_events(notice_id, created_at, id);

alter table public.guardian_absence_notice_events enable row level security;
revoke all on public.guardian_absence_notice_events from public, anon, authenticated;
grant select on public.guardian_absence_notice_events to authenticated;

drop policy if exists "notice participants read events" on public.guardian_absence_notice_events;
create policy "notice participants read events"
on public.guardian_absence_notice_events for select to authenticated
using (
  exists(
    select 1 from public.guardian_absence_notices n
    where n.id = notice_id
      and n.submitted_by_user_id = (select auth.uid())
  )
  or app_private.can_review_guardian_absence_notice(notice_id)
);

create or replace function app_private.enforce_guardian_absence_event_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_notice public.guardian_absence_notices%rowtype;
begin
  if tg_op in ('UPDATE','DELETE') then
    raise exception 'Guardian absence notice events are append-only';
  end if;

  select * into v_notice
  from public.guardian_absence_notices
  where id = new.notice_id;
  if not found then
    raise exception 'Guardian absence notice event requires an existing notice';
  end if;
  if (new.tenant_id, new.school_id) is distinct from (v_notice.tenant_id, v_notice.school_id) then
    raise exception 'Guardian absence notice event scope mismatch';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_guardian_absence_event_scope_integrity()
  from public, anon, authenticated;

drop trigger if exists guardian_absence_event_scope_integrity_trg
  on public.guardian_absence_notice_events;
create trigger guardian_absence_event_scope_integrity_trg
before insert or update or delete on public.guardian_absence_notice_events
for each row execute function app_private.enforce_guardian_absence_event_scope_integrity();

-- Backfill current notices so history starts from the original submission/review.
insert into public.guardian_absence_notice_events(
  tenant_id, school_id, notice_id, event_type, actor_user_id, to_status, created_at
)
select n.tenant_id, n.school_id, n.id, 'submitted', n.submitted_by_user_id, 'submitted', n.created_at
from public.guardian_absence_notices n
where not exists (
  select 1 from public.guardian_absence_notice_events e
  where e.notice_id = n.id and e.event_type = 'submitted'
);

insert into public.guardian_absence_notice_events(
  tenant_id, school_id, notice_id, event_type, actor_user_id, to_status, note, created_at
)
select n.tenant_id, n.school_id, n.id, 'reviewed', n.reviewed_by_user_id, n.status, n.review_note, n.reviewed_at
from public.guardian_absence_notices n
where n.reviewed_at is not null
  and not exists (
    select 1 from public.guardian_absence_notice_events e
    where e.notice_id = n.id and e.event_type = 'reviewed'
  );

create or replace function app_private.enforce_guardian_absence_notice_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'submitted'
       or new.reviewed_by_user_id is not null
       or new.reviewed_at is not null
       or new.review_note is not null then
      raise exception 'Guardian absence notices must be created submitted without review provenance';
    end if;

    if auth.uid() is not null
       and new.submitted_by_user_id is distinct from auth.uid() then
      raise exception 'Guardian absence notice submitter must match authenticated actor';
    end if;

    if not app_private.user_can_submit_guardian_absence_notice(
      new.submitted_by_user_id,
      new.tenant_id,
      new.guardian_id,
      new.learner_id
    ) then
      raise exception 'Guardian absence notice submitter is not authorized for learner';
    end if;

    return new;
  end if;

  if new.submitted_by_user_id is distinct from old.submitted_by_user_id then
    raise exception 'Guardian absence notice submitter provenance is immutable';
  end if;

  if old.status = 'withdrawn' and new.status is distinct from old.status then
    raise exception 'A withdrawn guardian absence notice is final';
  end if;

  if new.status = 'withdrawn' then
    if old.status not in ('submitted','under_review','returned') then
      raise exception 'Only a notice awaiting or returned from review can be withdrawn';
    end if;
    if auth.uid() is not null and new.submitted_by_user_id is distinct from auth.uid() then
      raise exception 'Only the submitting guardian can withdraw this notice';
    end if;
    return new;
  end if;

  if new.status = 'submitted' then
    if new.reviewed_by_user_id is not null
       or new.reviewed_at is not null
       or new.review_note is not null then
      raise exception 'Submitted guardian absence notice cannot carry review provenance';
    end if;

    return new;
  end if;

  if new.status in ('under_review','accepted','returned','closed') then
    if new.reviewed_by_user_id is null or new.reviewed_at is null then
      raise exception 'Reviewed guardian absence notice requires reviewer provenance';
    end if;

    if auth.uid() is not null
       and (
         new.status is distinct from old.status
         or new.reviewed_by_user_id is distinct from old.reviewed_by_user_id
         or new.reviewed_at is distinct from old.reviewed_at
         or new.review_note is distinct from old.review_note
       )
       and new.reviewed_by_user_id is distinct from auth.uid() then
      raise exception 'Guardian absence notice reviewer must match authenticated actor';
    end if;

    if (
      new.status is distinct from old.status
      or new.reviewed_by_user_id is distinct from old.reviewed_by_user_id
      or new.reviewed_at is distinct from old.reviewed_at
      or new.review_note is distinct from old.review_note
    )
    and not app_private.user_can_review_guardian_absence_notice_scope(
      new.reviewed_by_user_id,
      new.school_id,
      new.enrolment_id
    ) then
      raise exception 'Guardian absence notice reviewer is not authorized for learner';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_guardian_absence_notice_actor_integrity()
  from public, anon, authenticated;

-- Guardian withdraws their own notice before a final school decision.
create or replace function public.withdraw_guardian_absence_notice(p_notice_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
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
  if v_notice.submitted_by_user_id is distinct from auth.uid() then
    raise exception 'Only the submitting guardian can withdraw this notice';
  end if;
  if v_notice.status not in ('submitted','under_review','returned') then
    raise exception 'Only a notice awaiting or returned from review can be withdrawn';
  end if;

  update public.guardian_absence_notices
  set status='withdrawn', updated_at=now()
  where id=v_notice.id;

  insert into public.guardian_absence_notice_events(
    tenant_id,school_id,notice_id,event_type,actor_user_id,from_status,to_status
  ) values(
    v_notice.tenant_id,v_notice.school_id,v_notice.id,'withdrawn',auth.uid(),v_notice.status,'withdrawn'
  );

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_notice.tenant_id,v_notice.school_id,auth.uid(),
    'guardian.absence_notice.withdrawn','guardian_absence_notice',v_notice.id,
    jsonb_build_object('previous_status',v_notice.status)
  );

  return true;
end;
$$;

revoke all on function public.withdraw_guardian_absence_notice(uuid) from public,anon;
grant execute on function public.withdraw_guardian_absence_notice(uuid) to authenticated;

comment on function public.withdraw_guardian_absence_notice(uuid) is
'Submitting guardian withdraws their own absence notice before a final school decision. Does not change attendance.';

-- Guardian corrects and resubmits a returned notice; it re-enters the review queue.
create or replace function public.resubmit_guardian_absence_notice(
  p_notice_id uuid,
  p_reason_category text,
  p_message text default null
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
  if p_reason_category not in ('illness','medical_appointment','compassionate','family','transport','weather','school_activity','other') then
    raise exception 'Unsupported absence reason category';
  end if;
  if char_length(coalesce(p_message,'')) > 2000 then
    raise exception 'Absence notice note must be 2000 characters or fewer';
  end if;

  select * into v_notice
  from public.guardian_absence_notices
  where id=p_notice_id
  for update;
  if not found then raise exception 'Absence notice not found'; end if;
  if v_notice.submitted_by_user_id is distinct from auth.uid() then
    raise exception 'Only the submitting guardian can resubmit this notice';
  end if;
  if v_notice.status <> 'returned' then
    raise exception 'Only a returned absence notice can be resubmitted';
  end if;
  if not app_private.user_can_submit_guardian_absence_notice(
    auth.uid(), v_notice.tenant_id, v_notice.guardian_id, v_notice.learner_id
  ) then
    raise exception 'Guardian relationship is no longer active for this learner';
  end if;

  v_note := nullif(btrim(coalesce(p_message,'')),'');

  update public.guardian_absence_notices
  set status='submitted',
      reason_category=p_reason_category,
      message=v_note,
      reviewed_by_user_id=null,
      reviewed_at=null,
      review_note=null,
      updated_at=now()
  where id=v_notice.id;

  insert into public.guardian_absence_notice_events(
    tenant_id,school_id,notice_id,event_type,actor_user_id,from_status,to_status,note,metadata
  ) values(
    v_notice.tenant_id,v_notice.school_id,v_notice.id,'resubmitted',auth.uid(),
    'returned','submitted',v_note,
    jsonb_build_object(
      'reason_category',p_reason_category,
      'previous_reason_category',v_notice.reason_category,
      'previous_review_note',v_notice.review_note
    )
  );

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_notice.tenant_id,v_notice.school_id,auth.uid(),
    'guardian.absence_notice.resubmitted','guardian_absence_notice',v_notice.id,
    jsonb_build_object(
      'reason_category',p_reason_category,
      'previous_reason_category',v_notice.reason_category,
      'previous_review_note',v_notice.review_note
    )
  );

  insert into public.notifications(
    recipient_user_id,tenant_id,school_id,severity,title,body,href
  )
  select distinct sm.user_id,
    v_notice.tenant_id,
    v_notice.school_id,
    'info',
    'Absence notice resubmitted for review',
    'A guardian resubmitted an absence notice for review.',
    '/school/absence-reviews'
  from public.school_memberships sm
  where sm.school_id=v_notice.school_id
    and sm.role_key in ('school_admin','principal','deputy_principal','counsellor')
    and sm.active_from<=current_date
    and (sm.active_to is null or sm.active_to>=current_date)
    and sm.user_id is distinct from auth.uid();

  return true;
end;
$$;

revoke all on function public.resubmit_guardian_absence_notice(uuid,text,text) from public,anon;
grant execute on function public.resubmit_guardian_absence_notice(uuid,text,text) to authenticated;

comment on function public.resubmit_guardian_absence_notice(uuid,text,text) is
'Submitting guardian corrects and resubmits a returned absence notice. Prior review evidence remains in the append-only event history.';

-- Recreate submit/review to append the per-notice history events. Behaviour is
-- otherwise unchanged from 20261125121000_guardian_absence_notice_review_integrity.
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

  insert into public.guardian_absence_notice_events(
    tenant_id,school_id,notice_id,event_type,actor_user_id,from_status,to_status,note
  ) values(
    v_notice.tenant_id,v_notice.school_id,v_notice.id,'reviewed',auth.uid(),v_notice.status,p_status,v_note
  );

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_notice.tenant_id,v_notice.school_id,auth.uid(),'guardian.absence_notice.reviewed','guardian_absence_notice',v_notice.id,
    jsonb_build_object('learner_id',v_notice.learner_id,'status',p_status,'previous_status',v_notice.status)
  );

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

comment on function public.review_guardian_absence_notice(uuid,text,text) is
'Governed guardian absence-notice review. Transitions are bounded, acceptance/closure are final, a withdrawn notice cannot be reviewed, and each transition is audited with the authenticated actor.';
