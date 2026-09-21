-- Issue #590: narrowly scoped human-authority resolution for the confirmed
-- Martin Mukoya / EMP-001 case.
--
-- This is deliberately not a replacement for reconcile_staff_identities().
-- The normal exact-employee-number/shared-auth predicates remain unchanged.
-- This RPC is bound to the one explicitly confirmed human-authority case,
-- requires the current-school staff-reconciliation authority, and retains the
-- existing reconciliation pointer/status/audit semantics.

create or replace function public.resolve_staff_identity_authority(
  p_school_id uuid,
  p_canonical_staff_member_id uuid,
  p_employee_number_source_staff_member_id uuid,
  p_historical_linked_staff_member_id uuid,
  p_confirmation text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  c_canonical_staff_id constant uuid := '6cd951d1-c0cc-49b0-91ed-23e3efcd1843';
  c_employee_source_staff_id constant uuid := 'a77cb29b-5949-44f3-88f6-0fd2eeff1b06';
  c_historical_staff_id constant uuid := '941dd4db-e760-4695-b084-a2b6a5941086';
  c_canonical_auth_id constant uuid := '5a7510a3-17e6-4ac7-964e-f4e7d1431640';
  c_historical_auth_id constant uuid := '039a19fa-510e-4569-b32c-0b4857870850';
  c_confirmation constant text := 'AUTHORIZE MARTIN MUKOYA EMP-001 RESOLUTION';
  v_school public.schools%rowtype;
  v_canonical public.staff_members%rowtype;
  v_employee_source public.staff_members%rowtype;
  v_historical public.staff_members%rowtype;
  v_assignment record;
  v_allocation record;
  v_moved_assignments integer:=0;
  v_preserved_assignments integer:=0;
  v_moved_allocations integer:=0;
  v_preserved_allocations integer:=0;
  v_moved_registers integer:=0;
  v_preserved_memberships integer:=0;
  v_preserved_historical_assignments integer:=0;
  v_moved_room_custodians integer:=0;
  v_preserved_revoked_invitations integer:=0;
  v_closed_historical_assignments integer:=0;
  v_resolved_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.user_can_reconcile_staff(auth.uid(),p_school_id) then
    raise exception 'Permission denied';
  end if;
  if upper(btrim(coalesce(p_confirmation,'')))<>c_confirmation then
    raise exception 'Type the exact authority-resolution confirmation phrase';
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'Authority-resolution reason is required';
  end if;
  if p_canonical_staff_member_id<>c_canonical_staff_id
     or p_employee_number_source_staff_member_id<>c_employee_source_staff_id
     or p_historical_linked_staff_member_id<>c_historical_staff_id then
    raise exception 'This authority-resolution path is not available for arbitrary identities';
  end if;

  select * into v_school
  from public.schools
  where id=p_school_id and status='active';
  if not found then raise exception 'School not found or inactive'; end if;

  -- Lock all three identities in deterministic UUID order. This prevents two
  -- reviewers from applying the same authority decision concurrently.
  perform 1
  from public.staff_members
  where id in (
    c_canonical_staff_id,
    c_employee_source_staff_id,
    c_historical_staff_id
  )
  order by id
  for update;

  select * into v_canonical from public.staff_members where id=c_canonical_staff_id;
  select * into v_employee_source from public.staff_members where id=c_employee_source_staff_id;
  select * into v_historical from public.staff_members where id=c_historical_staff_id;

  if v_canonical.id is null
     or v_employee_source.id is null
     or v_historical.id is null then
    raise exception 'All authority-resolution identities must exist';
  end if;
  if v_canonical.tenant_id<>v_school.tenant_id
     or v_employee_source.tenant_id<>v_school.tenant_id
     or v_historical.tenant_id<>v_school.tenant_id then
    raise exception 'All authority-resolution identities must belong to the school tenant';
  end if;

  -- Exact identity and account assertions are the narrow safety boundary. The
  -- names are corroborating context, never the merge predicate.
  if lower(btrim(v_canonical.first_name))<>'martin'
     or lower(btrim(v_canonical.last_name))<>'mukoya'
     or lower(btrim(v_employee_source.first_name))<>'martin'
     or lower(btrim(v_employee_source.last_name))<>'mukoya'
     or lower(btrim(v_historical.first_name))<>'martin'
     or lower(btrim(v_historical.last_name))<>'mukoya' then
    raise exception 'Authority-resolution identities do not match the confirmed human case';
  end if;
  if v_canonical.user_id<>c_canonical_auth_id
     or v_employee_source.user_id is not null
     or v_historical.user_id<>c_historical_auth_id then
    raise exception 'Authority-resolution Auth state does not match the confirmed human case';
  end if;
  if v_employee_source.employee_number<>'EMP-001'
     or v_canonical.employee_number is not null
     or v_historical.employee_number is not null then
    raise exception 'Authority-resolution employee-number state does not match the confirmed human case';
  end if;

  if v_canonical.reconciled_into_staff_member_id is not null
     or v_employee_source.reconciled_into_staff_member_id is not null
     or v_historical.reconciled_into_staff_member_id is not null then
    if v_employee_source.reconciled_into_staff_member_id=c_canonical_staff_id
       and v_historical.reconciled_into_staff_member_id=c_canonical_staff_id
       and v_employee_source.status='inactive'
       and v_historical.status='inactive'
       and v_canonical.employee_number='EMP-001' then
      raise exception 'Authority resolution has already been applied';
    end if;
    raise exception 'Only active, unreconciled identities can be authority-resolved';
  end if;
  if v_canonical.status<>'active'
     or v_employee_source.status<>'active'
     or v_historical.status<>'active' then
    raise exception 'All authority-resolution identities must be active';
  end if;

  -- Require every identity to be represented in the requested current-school
  -- scope. Other-school references are deliberately not rewritten.
  if not exists(
    select 1 from public.school_memberships sm
    where sm.school_id=p_school_id
      and sm.staff_member_id=c_canonical_staff_id
  ) and not exists(
    select 1 from public.staff_school_assignments ssa
    where ssa.school_id=p_school_id
      and ssa.staff_member_id=c_canonical_staff_id
  ) then
    raise exception 'Canonical identity is not associated with the current school';
  end if;
  if not exists(
    select 1 from public.school_memberships sm
    where sm.school_id=p_school_id
      and sm.staff_member_id=c_employee_source_staff_id
  ) and not exists(
    select 1 from public.staff_school_assignments ssa
    where ssa.school_id=p_school_id
      and ssa.staff_member_id=c_employee_source_staff_id
  ) then
    raise exception 'Employee-number source is not associated with the current school';
  end if;
  if not exists(
    select 1 from public.school_memberships sm
    where sm.school_id=p_school_id
      and sm.staff_member_id=c_historical_staff_id
  ) and not exists(
    select 1 from public.staff_school_assignments ssa
    where ssa.school_id=p_school_id
      and ssa.staff_member_id=c_historical_staff_id
  ) then
    raise exception 'Historical linked identity is not associated with the current school';
  end if;

  -- An employee-number source without an Auth account cannot safely carry a
  -- school membership for an unknown user. Fail closed rather than silently
  -- changing that membership's user identity.
  if exists(
    select 1 from public.school_memberships sm
    where sm.school_id=p_school_id
      and sm.staff_member_id=c_employee_source_staff_id
  ) then
    raise exception 'Employee-number source has school memberships; review required';
  end if;

  -- Preserve all source assignment provenance while moving current-school
  -- placement references to the canonical staff row. Conflicts remain on the
  -- retained duplicate instead of being discarded.
  for v_assignment in
    select ssa.*
    from public.staff_school_assignments ssa
    where ssa.school_id=p_school_id
      and ssa.staff_member_id=c_employee_source_staff_id
    order by ssa.effective_from,ssa.id
    for update
  loop
    if exists(
      select 1
      from public.staff_school_assignments existing
      where existing.id<>v_assignment.id
        and existing.school_id=v_assignment.school_id
        and existing.staff_member_id=c_canonical_staff_id
        and existing.effective_from=v_assignment.effective_from
    ) then
      v_preserved_assignments:=v_preserved_assignments+1;
    else
      update public.staff_school_assignments
      set staff_member_id=c_canonical_staff_id,updated_at=now()
      where id=v_assignment.id;
      v_moved_assignments:=v_moved_assignments+1;
    end if;
  end loop;

  for v_allocation in
    select ta.*
    from public.teacher_allocations ta
    where ta.school_id=p_school_id
      and ta.staff_member_id=c_employee_source_staff_id
    order by ta.active_from,ta.id
    for update
  loop
    if exists(
      select 1
      from public.teacher_allocations existing
      where existing.id<>v_allocation.id
        and existing.school_id=v_allocation.school_id
        and existing.staff_member_id=c_canonical_staff_id
        and existing.subject_offering_id=v_allocation.subject_offering_id
        and existing.register_class_id=v_allocation.register_class_id
        and existing.active_from=v_allocation.active_from
    ) then
      v_preserved_allocations:=v_preserved_allocations+1;
    else
      update public.teacher_allocations
      set staff_member_id=c_canonical_staff_id
      where id=v_allocation.id;
      v_moved_allocations:=v_moved_allocations+1;
    end if;
  end loop;

  update public.register_classes
  set register_teacher_staff_id=c_canonical_staff_id
  where school_id=p_school_id
    and register_teacher_staff_id=c_employee_source_staff_id;
  get diagnostics v_moved_registers=row_count;

  update public.room_inventory_custodians
  set staff_member_id=c_canonical_staff_id
  where school_id=p_school_id
    and staff_member_id=c_employee_source_staff_id;
  get diagnostics v_moved_room_custodians=row_count;

  -- Revoked invitations are historical evidence of the prior duplicate record.
  -- Keep them attached to the retained duplicate instead of rewriting audit history.
  select count(*) into v_preserved_revoked_invitations
  from public.school_invitations
  where school_id=p_school_id
    and staff_member_id=c_employee_source_staff_id
    and status='revoked';

  select count(*) into v_preserved_memberships
  from public.school_memberships
  where school_id=p_school_id
    and staff_member_id=c_historical_staff_id;
  select count(*) into v_preserved_historical_assignments
  from public.staff_school_assignments
  where school_id=p_school_id
    and staff_member_id=c_historical_staff_id;

  -- The secondary linked identity is historical. Close any still-open placement
  -- in the current school while retaining the row, Auth link, creator and dates.
  update public.staff_school_assignments
  set effective_to=current_date,
      updated_at=now()
  where school_id=p_school_id
    and staff_member_id=c_historical_staff_id
    and effective_to is null;
  get diagnostics v_closed_historical_assignments=row_count;

  -- Transfer only the authoritative employee number. Auth links are never
  -- moved or deleted by this path; the historical secondary Auth link remains
  -- on its retained historical duplicate.
  update public.staff_members
  set employee_number='EMP-001',updated_at=now()
  where id=c_canonical_staff_id;

  update public.staff_members
  set status='inactive',
      reconciled_into_staff_member_id=c_canonical_staff_id,
      reconciled_at=now(),
      reconciled_by_user_id=auth.uid(),
      reconciliation_reason=nullif(btrim(p_reason),''),
      user_id=null,
      updated_at=now()
  where id=c_employee_source_staff_id;

  update public.staff_members
  set status='inactive',
      reconciled_into_staff_member_id=c_canonical_staff_id,
      reconciled_at=now(),
      reconciled_by_user_id=auth.uid(),
      reconciliation_reason=nullif(btrim(p_reason),''),
      updated_at=now()
  where id=c_historical_staff_id;

  v_resolved_at:=now();
  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  )
  values(
    v_school.tenant_id,
    p_school_id,
    auth.uid(),
    'staff.identity.authority_resolved',
    'staff_member',
    c_canonical_staff_id,
    jsonb_build_object(
      'canonical_staff_member_id',c_canonical_staff_id,
      'employee_number_source_staff_member_id',c_employee_source_staff_id,
      'historical_linked_staff_member_id',c_historical_staff_id,
      'canonical_auth_user_id',c_canonical_auth_id,
      'preserved_secondary_auth_user_id',c_historical_auth_id,
      'employee_number','EMP-001',
      'authority_resolution_reason',btrim(p_reason),
      'actor_user_id',auth.uid(),
      'reviewer_user_id',auth.uid(),
      'resolved_at',v_resolved_at,
      'moved_staff_school_assignments',v_moved_assignments,
      'preserved_conflicting_staff_school_assignments',v_preserved_assignments,
      'moved_teacher_allocations',v_moved_allocations,
      'preserved_conflicting_teacher_allocations',v_preserved_allocations,
      'moved_register_class_references',v_moved_registers,
      'preserved_historical_school_memberships',v_preserved_memberships,
      'preserved_historical_staff_school_assignments',v_preserved_historical_assignments,
      'closed_historical_staff_school_assignments',v_closed_historical_assignments,
      'moved_room_inventory_custodian_references',v_moved_room_custodians,
      'preserved_revoked_school_invitations',v_preserved_revoked_invitations,
      'auth_accounts_reassigned',false,
      'auth_accounts_deleted',false,
      'source','staff_identity_authority_resolution'
    )
  );

  return c_canonical_staff_id;
end;
$$;

revoke all on function public.resolve_staff_identity_authority(uuid,uuid,uuid,uuid,text,text)
from public,anon;
grant execute on function public.resolve_staff_identity_authority(uuid,uuid,uuid,uuid,text,text)
to authenticated;

comment on function public.resolve_staff_identity_authority(uuid,uuid,uuid,uuid,text,text) is
'Resolves only the explicitly confirmed Martin Mukoya / EMP-001 human-authority case. Requires current-school authority and an exact confirmation phrase; preserves secondary Auth identity and existing reconciliation provenance.';