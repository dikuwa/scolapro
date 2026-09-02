create or replace function app_private.enforce_late_detention_obligation_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
  v_learner_tenant uuid;
  v_event public.school_late_arrival_events%rowtype;
  v_event_year integer;
  v_staff_tenant uuid;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.learner_id is distinct from old.learner_id
    or new.academic_year is distinct from old.academic_year
    or new.trigger_event_id is distinct from old.trigger_event_id
  ) then
    raise exception 'Late detention obligation tenant, school, learner, academic year, and trigger event are immutable';
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Late detention obligation scope mismatch: school does not belong to tenant';
  end if;

  select l.tenant_id into v_learner_tenant
  from public.learners l
  where l.id = new.learner_id;

  if v_learner_tenant is null or v_learner_tenant <> new.tenant_id then
    raise exception 'Late detention obligation scope mismatch: learner does not belong to tenant';
  end if;

  if new.trigger_event_id is not null then
    select * into v_event
    from public.school_late_arrival_events
    where id = new.trigger_event_id;

    if not found
      or (v_event.tenant_id, v_event.school_id, v_event.learner_id)
         is distinct from (new.tenant_id, new.school_id, new.learner_id) then
      raise exception 'Late detention obligation scope mismatch: trigger event does not match obligation scope';
    end if;

    select e.academic_year into v_event_year
    from public.enrolments e
    where e.id = v_event.enrolment_id;

    if new.academic_year is not null and v_event_year <> new.academic_year then
      raise exception 'Late detention obligation scope mismatch: trigger event does not match academic year';
    end if;

    if new.triggered_on is not null and new.triggered_on <> v_event.arrival_date then
      raise exception 'Late detention obligation scope mismatch: triggered date does not match late-arrival event';
    end if;
  end if;

  if new.assigned_staff_member_id is not null then
    select s.tenant_id into v_staff_tenant
    from public.staff_members s
    where s.id = new.assigned_staff_member_id;

    if v_staff_tenant is null or v_staff_tenant <> new.tenant_id then
      raise exception 'Late detention obligation scope mismatch: assigned staff does not belong to tenant';
    end if;

    if not (
      exists (
        select 1
        from public.staff_school_assignments ssa
        where ssa.staff_member_id = new.assigned_staff_member_id
          and ssa.tenant_id = new.tenant_id
          and ssa.school_id = new.school_id
          and ssa.effective_from <= new.due_on
          and (ssa.effective_to is null or ssa.effective_to >= new.due_on)
      )
      or exists (
        select 1
        from public.school_memberships m
        where m.staff_member_id = new.assigned_staff_member_id
          and m.tenant_id = new.tenant_id
          and m.school_id = new.school_id
          and m.active_from <= new.due_on
          and (m.active_to is null or m.active_to >= new.due_on)
      )
    ) then
      raise exception 'Late detention obligation scope mismatch: assigned staff is not assigned to school on due date';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_late_detention_obligation_scope_integrity()
from public, anon, authenticated;

drop trigger if exists late_detention_obligation_scope_integrity_trg on public.late_detention_obligations;
create trigger late_detention_obligation_scope_integrity_trg
before insert or update of tenant_id, school_id, learner_id, academic_year, trigger_event_id, triggered_on, due_on, assigned_staff_member_id
on public.late_detention_obligations
for each row execute function app_private.enforce_late_detention_obligation_scope_integrity();

comment on function app_private.enforce_late_detention_obligation_scope_integrity() is
'Protects late-detention obligation scope/provenance and requires any assigned staff member to have a governed placement at the obligation school on its current due date. Both staff-school assignments and legacy staff-linked school memberships are accepted.';
