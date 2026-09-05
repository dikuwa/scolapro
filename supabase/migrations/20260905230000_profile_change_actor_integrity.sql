create or replace function app_private.user_can_submit_profile_change_request(
  p_user_id uuid,
  p_school_id uuid,
  p_learner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
      select 1
      from public.platform_memberships pm
      where pm.user_id=p_user_id
        and pm.role_key='platform_admin'
        and pm.active_from<=current_date
        and (pm.active_to is null or pm.active_to>=current_date)
    )
    or exists (
      select 1
      from public.enrolments e
      join public.school_memberships sm
        on sm.school_id=e.school_id
       and sm.user_id=p_user_id
       and sm.role_key in ('school_admin','principal','deputy_principal','counsellor','class_teacher')
       and sm.active_from<=current_date
       and (sm.active_to is null or sm.active_to>=current_date)
      where e.school_id=p_school_id
        and e.learner_id=p_learner_id
        and e.status='current'
        and (e.enrolled_to is null or e.enrolled_to>=current_date)
    )
    or exists (
      select 1
      from public.enrolments e
      join public.teacher_allocations ta
        on ta.school_id=e.school_id
       and ta.register_class_id=e.register_class_id
       and ta.academic_year=e.academic_year
       and ta.active_from<=current_date
       and (ta.active_to is null or ta.active_to>=current_date)
      join public.staff_members teacher_staff
        on teacher_staff.id=ta.staff_member_id
       and teacher_staff.user_id=p_user_id
       and teacher_staff.status='active'
      where e.school_id=p_school_id
        and e.learner_id=p_learner_id
        and e.status='current'
        and (e.enrolled_to is null or e.enrolled_to>=current_date)
    );
$$;

revoke all on function app_private.user_can_submit_profile_change_request(uuid,uuid,uuid)
from public, anon, authenticated;

comment on function app_private.user_can_submit_profile_change_request(uuid,uuid,uuid) is
'Arbitrary-user mirror of the existing profile-correction proposal authority: Platform Admin, current guardian-management school roles, or an actively allocated teacher for the learner.';

create or replace function app_private.user_can_review_profile_change_request(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
      select 1
      from public.platform_memberships pm
      where pm.user_id=p_user_id
        and pm.role_key='platform_admin'
        and pm.active_from<=current_date
        and (pm.active_to is null or pm.active_to>=current_date)
    )
    or exists (
      select 1
      from public.school_memberships sm
      where sm.school_id=p_school_id
        and sm.user_id=p_user_id
        and sm.role_key in ('school_admin','principal','deputy_principal')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    );
$$;

revoke all on function app_private.user_can_review_profile_change_request(uuid,uuid)
from public, anon, authenticated;

comment on function app_private.user_can_review_profile_change_request(uuid,uuid) is
'Arbitrary-user mirror of the existing authoritative profile-correction review boundary: school leadership or Platform Admin.';

create or replace function app_private.enforce_profile_change_request_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if tg_op='INSERT' then
    if not exists (
      select 1
      from public.enrolments e
      where e.school_id=new.school_id
        and e.learner_id=new.learner_id
        and e.status='current'
        and (e.enrolled_to is null or e.enrolled_to>=current_date)
    ) then
      raise exception 'Profile change request learner is not currently enrolled at request school';
    end if;

    if new.status<>'pending'
       or new.reviewed_by_user_id is not null
       or new.reviewed_at is not null
       or new.review_note is not null
       or new.applied_at is not null then
      raise exception 'Profile change requests must be created pending without review provenance';
    end if;

    if auth.uid() is not null
       and new.requested_by_user_id is distinct from auth.uid() then
      raise exception 'Profile change requester must match authenticated actor';
    end if;

    if not app_private.user_can_submit_profile_change_request(
      new.requested_by_user_id,new.school_id,new.learner_id
    ) then
      raise exception 'Profile change requester is not authorized for learner';
    end if;

    return new;
  end if;

  if old.status in ('approved','rejected','cancelled') then
    if new.status is distinct from old.status
       or new.reviewed_by_user_id is distinct from old.reviewed_by_user_id
       or new.reviewed_at is distinct from old.reviewed_at
       or new.review_note is distinct from old.review_note
       or new.applied_at is distinct from old.applied_at then
      raise exception 'Final profile change request lifecycle provenance is immutable';
    end if;
    return new;
  end if;

  if new.status='pending' then
    if new.reviewed_by_user_id is not null
       or new.reviewed_at is not null
       or new.review_note is not null
       or new.applied_at is not null then
      raise exception 'Pending profile change request cannot carry review provenance';
    end if;
    return new;
  end if;

  if new.status='cancelled' then
    if new.reviewed_by_user_id is not null
       or new.reviewed_at is not null
       or new.review_note is not null
       or new.applied_at is not null then
      raise exception 'Cancelled profile change request cannot carry review provenance';
    end if;
    if auth.uid() is null or auth.uid() is distinct from old.requested_by_user_id then
      raise exception 'Only the authenticated requester can cancel a profile change request';
    end if;
    return new;
  end if;

  if new.status not in ('approved','rejected') then
    raise exception 'Invalid profile change request lifecycle transition';
  end if;

  if new.reviewed_by_user_id is null or new.reviewed_at is null then
    raise exception 'Reviewed profile change request requires reviewer provenance';
  end if;

  if new.status='approved' and new.applied_at is null then
    raise exception 'Approved profile change request requires applied timestamp';
  end if;

  if new.status='rejected' and new.applied_at is not null then
    raise exception 'Rejected profile change request cannot carry applied timestamp';
  end if;

  if auth.uid() is not null
     and new.reviewed_by_user_id is distinct from auth.uid() then
    raise exception 'Profile change reviewer must match authenticated actor';
  end if;

  if not app_private.user_can_review_profile_change_request(
    new.reviewed_by_user_id,new.school_id
  ) then
    raise exception 'Profile change reviewer is not authorized for school';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_profile_change_request_actor_integrity()
from public, anon, authenticated;

comment on function app_private.enforce_profile_change_request_actor_integrity() is
'Physically binds profile-change submission/review actors to current authority, requires canonical pending creation, requester-only cancellation, valid review provenance, and terminal lifecycle finality.';

-- The existing scope trigger remains first alphabetically so malformed relationship
-- writes fail on scope before actor/lifecycle provenance is evaluated.
drop trigger if exists profile_change_request_actor_integrity_trg
on public.profile_change_requests;
create trigger profile_change_request_submit_review_actor_integrity_trg
before insert or update of status, requested_by_user_id, reviewed_by_user_id,
  reviewed_at, review_note, applied_at, school_id, learner_id
on public.profile_change_requests
for each row execute function app_private.enforce_profile_change_request_actor_integrity();
