-- Admission acceptance/waitlist/decline decisions are school workflow decisions.
-- The client may request a status transition, but it must not be able to forge who
-- reviewed the application or when that decision was made.

create or replace function app_private.guard_admission_decision_provenance()
returns trigger
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_decision_status boolean;
  v_entering_decision boolean;
begin
  v_decision_status := new.status in ('accepted','waitlisted','declined');
  v_entering_decision := v_decision_status and (
    tg_op = 'INSERT'
    or new.status is distinct from old.status
  );

  -- For authenticated application traffic, review provenance is always server-derived.
  -- This also covers direct table DML by a school administrator, not just RPC calls.
  if auth.uid() is not null then
    if v_entering_decision then
      new.reviewed_by_user_id := auth.uid();
      new.reviewed_at := now();
    elsif tg_op = 'UPDATE'
      and old.status = 'accepted'
      and new.status = 'enrolled' then
      -- The canonical accepted -> enrolled handoff historically backfills missing
      -- review provenance. Preserve existing provenance if present; otherwise derive
      -- the missing values from the authenticated actor/server time.
      new.reviewed_by_user_id := coalesce(old.reviewed_by_user_id, auth.uid());
      new.reviewed_at := coalesce(old.reviewed_at, now());
    elsif tg_op = 'UPDATE'
      and (
        new.reviewed_by_user_id is distinct from old.reviewed_by_user_id
        or new.reviewed_at is distinct from old.reviewed_at
      ) then
      raise exception 'Admission review provenance is server-managed';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.guard_admission_decision_provenance() from public,anon,authenticated;

drop trigger if exists admission_decision_provenance_guard on public.admission_applications;
create trigger admission_decision_provenance_guard
before insert or update on public.admission_applications
for each row execute function app_private.guard_admission_decision_provenance();

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
      reviewed_by_user_id=auth.uid(),
      reviewed_at=now(),
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
