-- Transfer actor provenance is validated when recorded, not against later placement.
-- Historical initiator/approver identities must remain frozen even if those actors
-- subsequently leave the source school. Current transition authority continues to
-- be enforced by the governed transfer RPCs through can_manage_enrolment_workflow().

create or replace function app_private.enforce_transfer_actor_lifecycle_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_approval_recorded boolean;
begin
  if tg_op = 'UPDATE'
     and new.initiated_by_user_id is distinct from old.initiated_by_user_id then
    raise exception 'Transfer initiator provenance is immutable';
  end if;

  if tg_op = 'INSERT' then
    if not app_private.user_can_manage_enrolment_workflow(
      new.initiated_by_user_id,
      new.source_school_id
    ) then
      raise exception 'Transfer initiator is not authorized for source school';
    end if;

    if new.status is distinct from 'requested' then
      raise exception 'New transfer must begin in requested status';
    end if;

    if new.approved_by_user_id is not null
       or new.approved_at is not null
       or new.completed_at is not null then
      raise exception 'New transfer cannot contain approval or completion provenance';
    end if;

    return new;
  end if;

  if old.approved_by_user_id is not null
     and new.approved_by_user_id is distinct from old.approved_by_user_id then
    raise exception 'Transfer approval actor provenance is immutable once recorded';
  end if;

  if old.approved_at is not null
     and new.approved_at is distinct from old.approved_at then
    raise exception 'Transfer approval timestamp provenance is immutable once recorded';
  end if;

  v_approval_recorded :=
    old.approved_by_user_id is null
    and old.approved_at is null
    and new.approved_by_user_id is not null
    and new.approved_at is not null;

  if v_approval_recorded
     and not app_private.user_can_manage_enrolment_workflow(
       new.approved_by_user_id,
       new.source_school_id
     ) then
    raise exception 'Transfer approver is not authorized for source school';
  end if;

  if new.status in ('approved','completed') then
    if new.approved_by_user_id is null or new.approved_at is null then
      raise exception 'Approved transfer requires approval provenance';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_transfer_actor_lifecycle_integrity()
  from public, anon, authenticated;

comment on function app_private.enforce_transfer_actor_lifecycle_integrity() is
'Validates transfer initiator/approver authority when provenance is first recorded, keeps those identities immutable, and does not re-evaluate historical actors against later school placements during subsequent governed lifecycle transitions.';
