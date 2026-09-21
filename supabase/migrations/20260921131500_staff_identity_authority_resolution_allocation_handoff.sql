-- Issue #590 follow-up: teacher allocations use immutable staff identity.
-- Preserve the immutable allocation rows as history, close their current periods,
-- and create canonical current-period replacements after the canonical staff
-- placement exists. This replaces only the exceptional authority-resolution RPC.

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
  v_source_assignment public.staff_school_assignments%rowtype;
  v_allocation jsonb;
  v_current_allocations jsonb := '[]'::jsonb;
  v_closed_source_allocations integer:=0;
  v_created_canonical_allocations integer:=0;
  v_closed_source_assignments integer:=0;
  v_created_canonical_assignments integer:=0;
  v_moved_registers integer:=0;
  v_moved_room_custodians integer:=0;
  v_preserved_revoked_invitations integer:=0;
  v_preserved_historical_memberships integer:=0;
  v_closed_historical_memberships integer:=0;
  v_preserved_historical_assignments integer:=0;
  v_closed_historical_assignments integer:=0;
  v_created_teacher_membership integer:=0;
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

  perform 1
  from public.staff_members
  where id in (c_canonical_staff_id,c_employee_source_staff_id,c_historical_staff_id)
  order by id
  for update;

  select * into v_canonical from public.staff_members where id=c_canonical_staff_id;
  select * into v_employee_source from public.staff_members where id=c_employee_source_staff_id;
  select * into v_historical from public.staff_members where id=c_historical_staff_id;

  if v_canonical.id is null or v_employee_source.id is null or v_historical.id is null then
    raise exception 'All authority-resolution identities must exist';
  end if;
  if v_canonical.tenant_id<>v_school.tenant_id
     or v_employee_source.tenant_id<>v_school.tenant_id
     or v_historical.tenant_id<>v_school.tenant_id then
    raise exception 'All authority-resolution identities must belong to the school tenant';
  end if;

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
    raise exception 'Only active, unreconciled identities can be authority-resolved';
  end if;
  if v_canonical.status<>'active'
     or v_employee_source.status<>'active'
     or v_historical.status<>'active' then
    raise exception 'All authority-resolution identities must be active';
  end if;

  if not exists(
    select 1 from public.school_memberships sm
    where sm.school_id=p_school_id and sm.staff_member_id=c_canonical_staff_id
  ) then
    raise exception 'Canonical identity is not associated with the current school';
  end if;
  if not exists(
    select 1 from public.staff_school_assignments ssa
    where ssa.school_id=p_school_id and ssa.staff_member_id=c_employee_source_staff_id
  ) then
    raise exception 'Employee-number source has no school assignment to preserve';
  end if;
  if not exists(
    select 1 from public.school_memberships sm
    where sm.school_id=p_school_id and sm.staff_member_id=c_historical_staff_id
  ) then
    raise exception 'Historical linked identity is not associated with the current school';
  end if;

  if exists(
    select 1 from public.school_memberships sm
    where sm.school_id=p_school_id and sm.staff_member_id=c_employee_source_staff_id
  ) then
    raise exception 'Employee-number source has school memberships; review required';
  end if;
  if exists(
    select 1 from public.school_invitations si
    where si.school_id=p_school_id
      and si.staff_member_id=c_employee_source_staff_id
      and si.status<>'revoked'
  ) then
    raise exception 'Employee-number source has a non-revoked invitation; review required';
  end if;

  -- The current duplicate allocations have no downstream timetable/planning/
  -- assessment references in the confirmed production case. Fail closed if
  -- that state drifts before execution.
  if exists(
    select 1
    from public.teacher_allocations ta
    where ta.school_id=p_school_id
      and ta.staff_member_id=c_employee_source_staff_id
      and ta.active_from<=current_date
      and (ta.active_to is null or ta.active_to>=current_date)
      and (
        exists(select 1 from public.timetable_slots ts where ts.teacher_allocation_id=ta.id)
        or exists(select 1 from public.teaching_schedule_items tsi where tsi.teacher_allocation_id=ta.id)
        or exists(select 1 from public.pacing_plans pp where pp.teacher_allocation_id=ta.id)
        or exists(select 1 from public.assessment_instances ai where ai.teacher_allocation_id=ta.id)
      )
  ) then
    raise exception 'Current teacher allocation has dependent records; review required';
  end if;

  -- Close the immutable duplicate allocation rows as historical records and
  -- remember one canonical replacement per subject/class/year.
  with closed as (
    update public.teacher_allocations ta
    set active_to=current_date-1
    where ta.school_id=p_school_id
      and ta.staff_member_id=c_employee_source_staff_id
      and ta.active_from<=current_date
      and (ta.active_to is null or ta.active_to>=current_date)
    returning ta.academic_year,ta.subject_offering_id,ta.register_class_id
  ),
  distinct_closed as (
    select distinct academic_year,subject_offering_id,register_class_id
    from closed
  )
  select
    (select count(*) from closed),
    coalesce(
      (select jsonb_agg(jsonb_build_object(
        'academic_year',academic_year,
        'subject_offering_id',subject_offering_id,
        'register_class_id',register_class_id
      )) from distinct_closed),
      '[]'::jsonb
    )
  into v_closed_source_allocations,v_current_allocations;

  -- End the duplicate's current school placement, retaining the row and
  -- creator provenance. Create a canonical placement from today forward.
  select * into v_source_assignment
  from public.staff_school_assignments
  where school_id=p_school_id
    and staff_member_id=c_employee_source_staff_id
    and effective_from<=current_date
    and (effective_to is null or effective_to>=current_date)
  order by effective_from desc,created_at desc,id
  limit 1
  for update;

  if v_source_assignment.id is null then
    raise exception 'Current employee-number source placement is missing';
  end if;

  update public.staff_school_assignments
  set effective_to=current_date-1,updated_at=now()
  where id=v_source_assignment.id;
  get diagnostics v_closed_source_assignments=row_count;

  if not exists(
    select 1 from public.staff_school_assignments ssa
    where ssa.school_id=p_school_id
      and ssa.staff_member_id=c_canonical_staff_id
      and ssa.effective_from=current_date
  ) then
    insert into public.staff_school_assignments(
      tenant_id,school_id,staff_member_id,assignment_type,position_title,
      effective_from,effective_to,created_by_user_id,staff_code,default_room_id
    ) values(
      v_source_assignment.tenant_id,
      v_source_assignment.school_id,
      c_canonical_staff_id,
      v_source_assignment.assignment_type,
      v_source_assignment.position_title,
      current_date,
      null,
      v_source_assignment.created_by_user_id,
      v_source_assignment.staff_code,
      v_source_assignment.default_room_id
    );
    v_created_canonical_assignments:=1;
  end if;

  -- Preserve teacher feature access on the canonical Gmail identity.
  if not exists(
    select 1 from public.school_memberships sm
    where sm.school_id=p_school_id
      and sm.user_id=c_canonical_auth_id
      and sm.role_key='teacher'
      and sm.active_from<=current_date
      and (sm.active_to is null or sm.active_to>=current_date)
  ) then
    insert into public.school_memberships(
      tenant_id,school_id,user_id,staff_member_id,role_key,active_from,active_to
    ) values(
      v_school.tenant_id,p_school_id,c_canonical_auth_id,c_canonical_staff_id,
      'teacher',current_date,null
    );
    v_created_teacher_membership:=1;
  end if;

  -- Recreate the current allocation authority on the canonical identity without
  -- rewriting immutable historical teacher_allocation rows.
  for v_allocation in
    select value from jsonb_array_elements(v_current_allocations)
  loop
    perform public.create_teacher_allocation_period(
      p_school_id,
      (v_allocation->>'academic_year')::integer,
      (v_allocation->>'subject_offering_id')::uuid,
      (v_allocation->>'register_class_id')::uuid,
      c_canonical_staff_id,
      current_date,
      null
    );
    v_created_canonical_allocations:=v_created_canonical_allocations+1;
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

  select count(*) into v_preserved_revoked_invitations
  from public.school_invitations
  where school_id=p_school_id
    and staff_member_id=c_employee_source_staff_id
    and status='revoked';

  select count(*) into v_preserved_historical_memberships
  from public.school_memberships
  where school_id=p_school_id
    and staff_member_id=c_historical_staff_id;

  update public.school_memberships
  set active_to=current_date-1
  where school_id=p_school_id
    and staff_member_id=c_historical_staff_id
    and active_from<=current_date
    and (active_to is null or active_to>=current_date);
  get diagnostics v_closed_historical_memberships=row_count;

  select count(*) into v_preserved_historical_assignments
  from public.staff_school_assignments
  where school_id=p_school_id
    and staff_member_id=c_historical_staff_id;

  update public.staff_school_assignments
  set effective_to=current_date-1,updated_at=now()
  where school_id=p_school_id
    and staff_member_id=c_historical_staff_id
    and effective_from<=current_date
    and (effective_to is null or effective_to>=current_date);
  get diagnostics v_closed_historical_assignments=row_count;

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
    v_school.tenant_id,p_school_id,auth.uid(),
    'staff.identity.authority_resolved','staff_member',c_canonical_staff_id,
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
      'closed_source_staff_school_assignments',v_closed_source_assignments,
      'created_canonical_staff_school_assignments',v_created_canonical_assignments,
      'closed_source_teacher_allocations',v_closed_source_allocations,
      'created_canonical_teacher_allocations',v_created_canonical_allocations,
      'created_canonical_teacher_membership',v_created_teacher_membership,
      'moved_register_class_references',v_moved_registers,
      'moved_room_inventory_custodian_references',v_moved_room_custodians,
      'preserved_revoked_school_invitations',v_preserved_revoked_invitations,
      'preserved_historical_school_memberships',v_preserved_historical_memberships,
      'closed_historical_school_memberships',v_closed_historical_memberships,
      'preserved_historical_staff_school_assignments',v_preserved_historical_assignments,
      'closed_historical_staff_school_assignments',v_closed_historical_assignments,
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
