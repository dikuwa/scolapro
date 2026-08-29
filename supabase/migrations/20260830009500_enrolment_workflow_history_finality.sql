-- Historical enrolment-workflow receipts must remain reconstructable even when a
-- privileged backend path is used accidentally. Keep terminal admission/transfer
-- rows append-only, and require rollover publication to start from the still-current
-- source enrolment while preserving idempotent repeat publication.

create or replace function app_private.guard_terminal_enrolment_workflow_history()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'admission_applications' and old.status = 'enrolled' then
    raise exception 'Enrolled admission applications are immutable historical records';
  end if;

  if tg_table_name = 'transfer_events' and old.status in ('completed','cancelled') then
    raise exception 'Completed or cancelled transfer records are immutable';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function app_private.guard_terminal_enrolment_workflow_history() from public, anon, authenticated;

drop trigger if exists admission_application_terminal_history_guard on public.admission_applications;
create trigger admission_application_terminal_history_guard
before update or delete on public.admission_applications
for each row execute function app_private.guard_terminal_enrolment_workflow_history();

drop trigger if exists transfer_event_terminal_history_guard on public.transfer_events;
create trigger transfer_event_terminal_history_guard
before update or delete on public.transfer_events
for each row execute function app_private.guard_terminal_enrolment_workflow_history();

-- Preserve the existing publication implementation as an internal-only helper.
-- The public wrapper adds the missing source-enrolment finality check without
-- weakening the existing authorization, destination, rule-provenance or
-- idempotency behavior.
alter function public.publish_year_end_progression(uuid, uuid, date)
  rename to publish_year_end_progression_internal;

revoke all on function public.publish_year_end_progression_internal(uuid, uuid, date)
  from public, anon, authenticated;

create or replace function public.publish_year_end_progression(
  p_progression_id uuid,
  p_destination_register_class_id uuid default null,
  p_effective_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_progression public.year_end_progressions%rowtype;
  v_source_enrolment public.enrolments%rowtype;
  v_publication_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_progression
  from public.year_end_progressions
  where id = p_progression_id;

  if not found then
    raise exception 'Progression decision not found';
  end if;

  if not app_private.has_school_role(
      v_progression.school_id,
      array['school_admin','principal','deputy_principal']
    )
    and not app_private.has_platform_role(array['platform_admin']) then
    raise exception 'Permission denied';
  end if;

  -- Repeat publication remains idempotent even though the source enrolment was
  -- intentionally closed by the first successful publication.
  select id into v_publication_id
  from public.year_end_progression_publications
  where progression_id = v_progression.id;

  if v_publication_id is not null then
    return v_publication_id;
  end if;

  select * into v_source_enrolment
  from public.enrolments
  where id = v_progression.enrolment_id;

  if not found
     or v_source_enrolment.learner_id <> v_progression.learner_id
     or v_source_enrolment.school_id <> v_progression.school_id
     or v_source_enrolment.academic_year <> v_progression.academic_year then
    raise exception 'Progression source enrolment does not match the locked decision';
  end if;

  if v_source_enrolment.status <> 'current' then
    raise exception 'Only a current source enrolment can be published into year-end rollover';
  end if;

  return public.publish_year_end_progression_internal(
    p_progression_id,
    p_destination_register_class_id,
    p_effective_on
  );
end;
$$;

revoke all on function public.publish_year_end_progression(uuid, uuid, date)
  from public, anon;
grant execute on function public.publish_year_end_progression(uuid, uuid, date)
  to authenticated;

comment on function app_private.guard_terminal_enrolment_workflow_history() is
  'Prevents privileged direct DML from rewriting terminal admission and transfer history.';
comment on function public.publish_year_end_progression(uuid, uuid, date) is
  'Publishes a locked year-end decision only from its still-current source enrolment; repeat publication remains idempotent.';
comment on function public.publish_year_end_progression_internal(uuid, uuid, date) is
  'Internal implementation for governed year-end publication. Client roles must call publish_year_end_progression instead.';