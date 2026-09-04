create or replace function app_private.enforce_audit_event_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
  v_on_date date := coalesce(new.occurred_at::date, current_date);
begin
  if tg_op = 'UPDATE' then
    raise exception 'Audit events are immutable';
  end if;

  if new.school_id is not null then
    if new.tenant_id is null then
      raise exception 'Audit event scope mismatch: school-scoped event requires tenant';
    end if;

    select s.tenant_id into v_school_tenant
    from public.schools s
    where s.id = new.school_id;

    if v_school_tenant is null or v_school_tenant <> new.tenant_id then
      raise exception 'Audit event scope mismatch: school does not belong to tenant';
    end if;

    if new.actor_user_id is not null and not (
      exists (
        select 1
        from public.platform_memberships pm
        where pm.user_id = new.actor_user_id
          and pm.active_from <= v_on_date
      )
      or exists (
        select 1
        from public.school_memberships sm
        where sm.tenant_id = new.tenant_id
          and sm.school_id = new.school_id
          and sm.user_id = new.actor_user_id
          and sm.active_from <= v_on_date
      )
      or exists (
        select 1
        from public.staff_members staff
        join public.staff_school_assignments ssa
          on ssa.staff_member_id = staff.id
         and ssa.tenant_id = staff.tenant_id
        where staff.tenant_id = new.tenant_id
          and staff.user_id = new.actor_user_id
          and ssa.school_id = new.school_id
          and ssa.effective_from <= v_on_date
      )
      or exists (
        select 1
        from public.guardian_user_links gul
        join public.learner_guardians lg
          on lg.tenant_id = gul.tenant_id
         and lg.guardian_id = gul.guardian_id
        join public.enrolments e
          on e.tenant_id = lg.tenant_id
         and e.learner_id = lg.learner_id
        where gul.tenant_id = new.tenant_id
          and gul.user_id = new.actor_user_id
          and lg.effective_from <= v_on_date
          and (lg.effective_to is null or lg.effective_to >= v_on_date)
          and e.school_id = new.school_id
          and e.enrolled_from <= v_on_date
          and (e.enrolled_to is null or e.enrolled_to >= v_on_date)
      )
    ) then
      raise exception 'Audit event scope mismatch: actor is not related to school';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_audit_event_integrity() from public, anon, authenticated;

comment on function app_private.enforce_audit_event_integrity() is
'Keeps audit events immutable, validates school/tenant scope, and prevents school-scoped actor provenance from naming an unrelated account. Historical staff or membership provenance remains valid after a relationship ends, while future relationships cannot backdate authority.';
