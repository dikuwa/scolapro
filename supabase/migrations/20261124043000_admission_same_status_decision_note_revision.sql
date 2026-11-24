-- #1324: same-status admission note revisions must pass the existing
-- server-managed review-provenance trigger; do not redefine the trigger.
-- Preserve original decision actor/time when status does not change, while
-- appending an audited review-note revision to admission.decided history.
-- This is the canonical additive upgrade, never a rewrite of prior migration.
create or replace function public.decide_admission_application(
  p_application_id uuid,
  p_status text,
  p_decision_note text default null
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_application public.admission_applications%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if char_length(coalesce(p_decision_note,'')) > 1000 then
    raise exception 'Admission decision note exceeds 1000 characters';
  end if;

  if p_status not in ('accepted','waitlisted','declined') then
    raise exception 'Admission decision must be accepted, waitlisted or declined';
  end if;

  select * into v_application
  from public.admission_applications
  where id=p_application_id
  for update;

  if not found then
    raise exception 'Admission application not found';
  end if;

  if not app_private.can_manage_enrolment_workflow(v_application.school_id) then
    raise exception 'Permission denied';
  end if;

  if v_application.status in ('enrolled','withdrawn') then
    raise exception 'Admission application is already final';
  end if;

  update public.admission_applications
  set status=p_status,
      decision_note=nullif(btrim(coalesce(p_decision_note,'')),''),
      -- Status transitions are reviewed now. Note-only changes preserve the
      -- last decision actor/time; each revision is separately audited below.
      -- Otherwise the table finality trigger rightly refuses forged metadata
      -- on a same-status update.
      reviewed_by_user_id=case when v_application.status is distinct from p_status
        then auth.uid() else v_application.reviewed_by_user_id end,
      reviewed_at=case when v_application.status is distinct from p_status
        then now() else v_application.reviewed_at end,
      updated_at=now()
  where id=v_application.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values (
    v_application.tenant_id,
    v_application.school_id,
    auth.uid(),
    'admission.decided',
    'admission_application',
    v_application.id,
    jsonb_build_object(
      'previous_status',v_application.status,
      'decision_status',p_status,
      'note_revision',v_application.status is not distinct from p_status,
      'decision_note',nullif(btrim(coalesce(p_decision_note,'')),'')
    )
  );

  return true;
end;
$$;

revoke all on function public.decide_admission_application(uuid,text,text) from public,anon;
grant execute on function public.decide_admission_application(uuid,text,text) to authenticated;

comment on function public.decide_admission_application(uuid,text,text) is
  'Governed admission decision boundary. Reviewer identity and timestamp are derived from the authenticated session.';
