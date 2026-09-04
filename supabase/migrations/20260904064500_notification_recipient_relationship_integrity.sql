create or replace function app_private.enforce_notification_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
  v_on_date date := coalesce(new.created_at::date, current_date);
begin
  if tg_op = 'UPDATE' and (
    new.recipient_user_id is distinct from old.recipient_user_id
    or new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.severity is distinct from old.severity
    or new.title is distinct from old.title
    or new.body is distinct from old.body
    or new.href is distinct from old.href
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Notification recipient, scope, content, and creation provenance are immutable';
  end if;

  if new.school_id is not null then
    if new.tenant_id is null then
      raise exception 'Notification scope mismatch: school-scoped notification requires tenant';
    end if;

    select s.tenant_id into v_school_tenant
    from public.schools s
    where s.id = new.school_id;

    if v_school_tenant is null or v_school_tenant <> new.tenant_id then
      raise exception 'Notification scope mismatch: school does not belong to tenant';
    end if;

    if not (
      exists (
        select 1
        from public.platform_memberships pm
        where pm.user_id = new.recipient_user_id
          and pm.active_from <= v_on_date
          and (pm.active_to is null or pm.active_to >= v_on_date)
      )
      or exists (
        select 1
        from public.school_memberships sm
        where sm.tenant_id = new.tenant_id
          and sm.school_id = new.school_id
          and sm.user_id = new.recipient_user_id
          and (sm.active_to is null or sm.active_to >= v_on_date)
      )
      or exists (
        select 1
        from public.staff_members staff
        join public.staff_school_assignments ssa
          on ssa.staff_member_id = staff.id
         and ssa.tenant_id = staff.tenant_id
        where staff.tenant_id = new.tenant_id
          and staff.user_id = new.recipient_user_id
          and staff.status = 'active'
          and ssa.school_id = new.school_id
          and (ssa.effective_to is null or ssa.effective_to >= v_on_date)
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
          and gul.user_id = new.recipient_user_id
          and lg.effective_from <= v_on_date
          and (lg.effective_to is null or lg.effective_to >= v_on_date)
          and e.school_id = new.school_id
          and e.enrolled_from <= v_on_date
          and (e.enrolled_to is null or e.enrolled_to >= v_on_date)
      )
    ) then
      raise exception 'Notification scope mismatch: recipient is not related to school';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_notification_scope_integrity() from public, anon, authenticated;

comment on function app_private.enforce_notification_scope_integrity() is
'Keeps notification scope immutable and requires school-scoped recipients to be valid platform, school staff/member, or guardian-linked users. Future school staff placements are accepted so advance duty notifications remain valid.';

create or replace function public.reassign_late_detention_supervisor(
  p_obligation_id uuid,
  p_staff_member_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_item public.late_detention_obligations%rowtype;
  v_supervisor_user_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_item
  from public.late_detention_obligations
  where id=p_obligation_id
  for update;

  if not found then raise exception 'Detention obligation not found'; end if;
  if not app_private.has_school_role(v_item.school_id,array['school_admin','principal','deputy_principal']) then
    raise exception 'Permission denied';
  end if;
  if v_item.status not in ('pending','carried_forward') then
    raise exception 'Only pending detention obligations can be reassigned';
  end if;
  if not app_private.staff_member_has_school_assignment(p_staff_member_id,v_item.school_id,v_item.due_on) then
    raise exception 'Supervisor is not assigned to this school on the detention due date';
  end if;

  if p_staff_member_id is not distinct from v_item.assigned_staff_member_id then
    return true;
  end if;

  update public.late_detention_obligations
  set assigned_staff_member_id=p_staff_member_id,updated_at=now()
  where id=p_obligation_id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_item.tenant_id,v_item.school_id,auth.uid(),
    'late_detention.supervisor_reassigned','late_detention_obligation',v_item.id,
    jsonb_build_object(
      'reason','manual_reassignment',
      'previous_staff_member_id',v_item.assigned_staff_member_id,
      'staff_member_id',p_staff_member_id,
      'due_on',v_item.due_on
    )
  );

  select sm.user_id into v_supervisor_user_id
  from public.staff_members sm
  where sm.id=p_staff_member_id
    and sm.status='active'
    and (
      exists (
        select 1
        from public.staff_school_assignments ssa
        where ssa.staff_member_id=sm.id
          and ssa.tenant_id=v_item.tenant_id
          and ssa.school_id=v_item.school_id
          and (ssa.effective_to is null or ssa.effective_to>=current_date)
      )
      or exists (
        select 1
        from public.school_memberships membership
        where membership.staff_member_id=sm.id
          and membership.tenant_id=v_item.tenant_id
          and membership.school_id=v_item.school_id
          and membership.user_id=sm.user_id
          and (membership.active_to is null or membership.active_to>=current_date)
      )
    );

  if v_supervisor_user_id is not null then
    insert into public.notifications(
      recipient_user_id,tenant_id,school_id,severity,title,body,href
    ) values (
      v_supervisor_user_id,v_item.tenant_id,v_item.school_id,'info',
      'Detention supervision assigned',
      'A learner detention obligation has been assigned to you for ' || to_char(v_item.due_on,'DD Mon YYYY') || '.',
      '/late-arrivals'
    );
  end if;

  return true;
end;
$$;

comment on function public.reassign_late_detention_supervisor(uuid,uuid) is
'Reassigns an open detention obligation using due-date staff eligibility. Historical reassignments remain valid, but a fresh notification is emitted only when the supervisor still has a current or future school relationship.';
