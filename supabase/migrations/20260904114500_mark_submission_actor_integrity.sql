create or replace function app_private.enforce_mark_submission_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null
       and new.submitted_by_user_id is distinct from auth.uid() then
      raise exception 'Mark submission submitter must match authenticated actor';
    end if;

    if not app_private.user_can_access_assessment_instance(
      new.submitted_by_user_id,
      new.assessment_instance_id
    ) then
      raise exception 'Mark submission submitter is not authorized for assessment instance';
    end if;

    if new.status <> 'submitted'
       or new.reviewed_by_user_id is not null
       or new.reviewed_at is not null then
      raise exception 'Mark submission must begin in submitted state without review provenance';
    end if;

    return new;
  end if;

  if new.tenant_id is distinct from old.tenant_id
     or new.school_id is distinct from old.school_id
     or new.assessment_instance_id is distinct from old.assessment_instance_id
     or new.submitted_by_user_id is distinct from old.submitted_by_user_id
     or new.submitted_at is distinct from old.submitted_at
     or new.created_at is distinct from old.created_at then
    raise exception 'Mark submission root scope and submitter provenance are immutable';
  end if;

  if old.status in ('returned','verified') and new.status is distinct from old.status then
    raise exception 'Reviewed mark submission status is immutable';
  end if;

  if old.reviewed_by_user_id is not null
     and new.reviewed_by_user_id is distinct from old.reviewed_by_user_id then
    raise exception 'Mark submission reviewer provenance is immutable';
  end if;

  if old.reviewed_at is not null
     and new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'Mark submission review timestamp is immutable';
  end if;

  if new.status is distinct from old.status then
    if old.status <> 'submitted' or new.status not in ('returned','verified') then
      raise exception 'Invalid mark submission review transition';
    end if;

    if new.reviewed_by_user_id is null or new.reviewed_at is null then
      raise exception 'Reviewed mark submission requires reviewer provenance';
    end if;

    if auth.uid() is not null
       and new.reviewed_by_user_id is distinct from auth.uid() then
      raise exception 'Mark submission reviewer must match authenticated actor';
    end if;

    if not app_private.user_is_academic_leader(
      new.reviewed_by_user_id,
      new.school_id
    ) then
      raise exception 'Mark submission reviewer is not authorized for school';
    end if;
  elsif new.reviewed_by_user_id is distinct from old.reviewed_by_user_id
        or new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'Review provenance can only be recorded with a review transition';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_mark_submission_actor_integrity()
  from public, anon, authenticated;

comment on function app_private.enforce_mark_submission_actor_integrity() is
'Physically binds mark-submission submitter and reviewer provenance to the existing assessment-access and academic-leader authority models, enforces the submitted-to-reviewed lifecycle, and prevents provenance rewrites.';

drop trigger if exists mark_submission_actor_integrity_trg on public.mark_submissions;
create trigger mark_submission_actor_integrity_trg
before insert or update on public.mark_submissions
for each row execute function app_private.enforce_mark_submission_actor_integrity();
