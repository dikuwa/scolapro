create or replace function app_private.enforce_transfer_actor_lifecycle_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if tg_op = 'UPDATE' and new.initiated_by_user_id is distinct from old.initiated_by_user_id then
    raise exception 'Transfer initiator provenance is immutable';
  end if;

  if not app_private.user_can_manage_enrolment_workflow(
    new.initiated_by_user_id,
    new.source_school_id
  ) then
    raise exception 'Transfer initiator is not authorized for source school';
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'requested' then
      raise exception 'New transfer must begin in requested status';
    end if;

    if new.approved_by_user_id is not null
       or new.approved_at is not null
       or new.completed_at is not null then
      raise exception 'New transfer cannot contain approval or completion provenance';
    end if;
  end if;

  if new.status in ('approved','completed') then
    if new.approved_by_user_id is null or new.approved_at is null then
      raise exception 'Approved transfer requires approval provenance';
    end if;

    if not app_private.user_can_manage_enrolment_workflow(
      new.approved_by_user_id,
      new.source_school_id
    ) then
      raise exception 'Transfer approver is not authorized for source school';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and old.approved_by_user_id is not null
     and new.approved_by_user_id is distinct from old.approved_by_user_id then
    raise exception 'Transfer approval actor provenance is immutable once recorded';
  end if;

  if tg_op = 'UPDATE'
     and old.approved_at is not null
     and new.approved_at is distinct from old.approved_at then
    raise exception 'Transfer approval timestamp provenance is immutable once recorded';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_transfer_actor_lifecycle_integrity()
  from public, anon, authenticated;

comment on function app_private.enforce_transfer_actor_lifecycle_integrity() is
'Keeps transfer initiation and approval actor provenance authoritative, requires all recorded actors to have source-school enrolment-workflow authority, and prevents direct creation of already-approved/completed transfers.';

drop trigger if exists transfer_actor_lifecycle_integrity_trg on public.transfer_events;
create trigger transfer_actor_lifecycle_integrity_trg
before insert or update of initiated_by_user_id, approved_by_user_id, approved_at, completed_at, status, source_school_id
on public.transfer_events
for each row execute function app_private.enforce_transfer_actor_lifecycle_integrity();

drop policy if exists "source enrolment managers can manage transfer events [insert]" on public.transfer_events;
create policy "source enrolment managers can manage transfer events [insert]"
on public.transfer_events
for insert
to authenticated
with check (
  initiated_by_user_id = (select auth.uid())
  and status = 'requested'
  and approved_by_user_id is null
  and approved_at is null
  and completed_at is null
  and app_private.can_manage_enrolment_workflow(source_school_id)
);
