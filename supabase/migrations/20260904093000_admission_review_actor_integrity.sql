create or replace function app_private.guard_admission_decision_provenance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_decision_status boolean;
  v_entering_decision boolean;
  v_provenance_changed boolean;
begin
  v_decision_status := new.status in ('accepted','waitlisted','declined');
  v_entering_decision := v_decision_status and (
    tg_op = 'INSERT'
    or new.status is distinct from old.status
  );

  if tg_op = 'UPDATE' then
    v_provenance_changed :=
      new.reviewed_by_user_id is distinct from old.reviewed_by_user_id
      or new.reviewed_at is distinct from old.reviewed_at;
  else
    v_provenance_changed := new.reviewed_by_user_id is not null or new.reviewed_at is not null;
  end if;

  if auth.uid() is not null then
    if v_entering_decision then
      new.reviewed_by_user_id := auth.uid();
      new.reviewed_at := now();
    elsif tg_op = 'UPDATE'
      and old.status = 'accepted'
      and new.status = 'enrolled' then
      new.reviewed_by_user_id := coalesce(old.reviewed_by_user_id, auth.uid());
      new.reviewed_at := coalesce(old.reviewed_at, now());
    elsif tg_op = 'UPDATE' and v_provenance_changed then
      raise exception 'Admission review provenance is server-managed';
    end if;
  else
    if v_entering_decision then
      if new.reviewed_by_user_id is null or new.reviewed_at is null then
        raise exception 'Admission decision requires review provenance';
      end if;

      if not app_private.user_can_manage_enrolment_workflow(
        new.reviewed_by_user_id,
        new.school_id
      ) then
        raise exception 'Admission reviewer is not authorized for school';
      end if;
    elsif tg_op = 'UPDATE' and v_provenance_changed then
      raise exception 'Admission review provenance is immutable outside a decision transition';
    end if;
  end if;

  if v_decision_status then
    if new.reviewed_by_user_id is null or new.reviewed_at is null then
      raise exception 'Admission decision requires review provenance';
    end if;

    if not app_private.user_can_manage_enrolment_workflow(
      new.reviewed_by_user_id,
      new.school_id
    ) then
      raise exception 'Admission reviewer is not authorized for school';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.guard_admission_decision_provenance()
  from public, anon, authenticated;

comment on function app_private.guard_admission_decision_provenance() is
'Keeps admission decision reviewer provenance authoritative for both authenticated and trusted/RLS-bypassing writes. Authenticated decisions derive the reviewer from auth.uid(); trusted decisions must provide an authorized school enrolment-workflow reviewer, and provenance cannot be rewritten outside a decision transition.';
