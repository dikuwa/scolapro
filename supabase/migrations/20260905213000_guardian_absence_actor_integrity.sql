create or replace function app_private.user_can_submit_guardian_absence_notice(
  p_user_id uuid,
  p_tenant_id uuid,
  p_guardian_id uuid,
  p_learner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists(
    select 1
    from public.guardian_user_links gul
    join public.learner_guardians lg
      on lg.tenant_id = gul.tenant_id
     and lg.guardian_id = gul.guardian_id
    where gul.tenant_id = p_tenant_id
      and gul.guardian_id = p_guardian_id
      and gul.user_id = p_user_id
      and lg.learner_id = p_learner_id
      and lg.effective_from <= current_date
      and (lg.effective_to is null or lg.effective_to >= current_date)
  );
$$;

revoke all on function app_private.user_can_submit_guardian_absence_notice(uuid,uuid,uuid,uuid)
  from public, anon, authenticated;

comment on function app_private.user_can_submit_guardian_absence_notice(uuid,uuid,uuid,uuid) is
'Arbitrary-user mirror of guardian absence submission authority for physical actor provenance checks.';

create or replace function app_private.user_can_review_guardian_absence_notice_scope(
  p_user_id uuid,
  p_school_id uuid,
  p_enrolment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists(
      select 1
      from public.platform_memberships pm
      where pm.user_id = p_user_id
        and pm.role_key = 'platform_admin'
        and pm.active_from <= current_date
        and (pm.active_to is null or pm.active_to >= current_date)
    )
    or exists(
      select 1
      from public.school_memberships sm
      where sm.school_id = p_school_id
        and sm.user_id = p_user_id
        and sm.role_key in ('school_admin','principal','deputy_principal','counsellor')
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
    )
    or exists(
      select 1
      from public.enrolments e
      join public.register_classes rc
        on rc.id = e.register_class_id
       and rc.school_id = e.school_id
      join public.staff_members staff
        on staff.id = rc.register_teacher_staff_id
      join public.school_memberships sm
        on sm.school_id = e.school_id
       and sm.user_id = p_user_id
       and sm.role_key = 'class_teacher'
       and sm.active_from <= current_date
       and (sm.active_to is null or sm.active_to >= current_date)
      where e.id = p_enrolment_id
        and e.school_id = p_school_id
        and staff.user_id = p_user_id
        and staff.status = 'active'
    );
$$;

revoke all on function app_private.user_can_review_guardian_absence_notice_scope(uuid,uuid,uuid)
  from public, anon, authenticated;

comment on function app_private.user_can_review_guardian_absence_notice_scope(uuid,uuid,uuid) is
'Arbitrary-user mirror of the sensitive guardian absence review authority used by physical provenance guards.';

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

comment on function app_private.enforce_guardian_absence_notice_actor_integrity() is
'Physically binds absence submission to the linked guardian account, requires canonical submitted creation, and binds every review transition to an authorized sensitive-data reviewer.';

drop trigger if exists guardian_absence_notice_actor_integrity_trg
  on public.guardian_absence_notices;
create trigger guardian_absence_notice_actor_integrity_trg
before insert or update of submitted_by_user_id, reviewed_by_user_id, reviewed_at,
  review_note, status, tenant_id, school_id, learner_id, enrolment_id, guardian_id
on public.guardian_absence_notices
for each row execute function app_private.enforce_guardian_absence_notice_actor_integrity();
