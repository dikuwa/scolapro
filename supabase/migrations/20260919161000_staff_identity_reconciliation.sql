-- Issue #565: governed staff identity reconciliation and staff-detail corrections.
-- A duplicate identity is retained as an immutable historical pointer; operational
-- memberships and placement references are moved to the canonical identity.

alter table public.staff_members
  add column if not exists reconciled_into_staff_member_id uuid references public.staff_members(id) on delete restrict,
  add column if not exists reconciled_at timestamptz,
  add column if not exists reconciled_by_user_id uuid references auth.users(id) on delete restrict,
  add column if not exists reconciliation_reason text;

-- Duplicate source identities must be reviewable before a governed merge. The
-- reconciliation RPC, rather than a table-level uniqueness constraint, decides
-- when an employee number is authoritative.
alter table public.staff_members
  drop constraint if exists staff_members_tenant_id_employee_number_key;
create index if not exists staff_members_tenant_employee_number_idx
  on public.staff_members(tenant_id,upper(btrim(employee_number)))
  where employee_number is not null;

alter table public.staff_members
  drop constraint if exists staff_members_not_self_reconciled;
alter table public.staff_members
  add constraint staff_members_not_self_reconciled
  check (reconciled_into_staff_member_id is null or reconciled_into_staff_member_id<>id);

create index if not exists staff_members_reconciled_into_idx
  on public.staff_members(reconciled_into_staff_member_id)
  where reconciled_into_staff_member_id is not null;

create or replace function app_private.user_can_reconcile_staff(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select app_private.user_can_manage_current_school_membership(p_user_id,p_school_id);
$$;

revoke all on function app_private.user_can_reconcile_staff(uuid,uuid)
from public,anon,authenticated;

create or replace function public.correct_staff_details(
  p_school_id uuid,
  p_staff_member_id uuid,
  p_first_name text default null,
  p_last_name text default null,
  p_employee_number text default null,
  p_position_title text default null,
  p_source text default 'staff_directory',
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_school public.schools%rowtype;
  v_staff public.staff_members%rowtype;
  v_assignment public.staff_school_assignments%rowtype;
  v_old jsonb;
  v_new jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.user_can_reconcile_staff(auth.uid(),p_school_id) then
    raise exception 'Permission denied';
  end if;
  select * into v_school from public.schools where id=p_school_id and status='active';
  if not found then raise exception 'School not found or inactive'; end if;
  select * into v_staff from public.staff_members
  where id=p_staff_member_id and tenant_id=v_school.tenant_id
    and reconciled_into_staff_member_id is null
  for update;
  if not found then raise exception 'Staff identity is not active in this tenant'; end if;
  if nullif(btrim(coalesce(p_first_name,'')),'') is null
     or nullif(btrim(coalesce(p_last_name,'')),'') is null then
    raise exception 'First name and surname are required';
  end if;
  if nullif(btrim(coalesce(p_employee_number,'')),'') is null then
    raise exception 'Employee number is required';
  end if;
  if exists(
    select 1 from public.staff_members other
    where other.tenant_id=v_staff.tenant_id
      and upper(btrim(other.employee_number))=upper(btrim(p_employee_number))
      and other.id<>v_staff.id
      and other.reconciled_into_staff_member_id is null
  ) then raise exception 'Employee number already belongs to another active staff identity'; end if;

  select * into v_assignment
  from public.staff_school_assignments
  where school_id=p_school_id and staff_member_id=v_staff.id
    and effective_from<=current_date
    and (effective_to is null or effective_to>=current_date)
  order by effective_from desc,created_at desc,id
  limit 1
  for update;

  v_old:=jsonb_build_object(
    'first_name',v_staff.first_name,'last_name',v_staff.last_name,
    'employee_number',v_staff.employee_number,
    'position_title',v_assignment.position_title,
    'auth_user_id',v_staff.user_id
  );
  update public.staff_members set
    first_name=btrim(p_first_name),
    last_name=btrim(p_last_name),
    employee_number=upper(btrim(p_employee_number)),
    updated_at=now()
  where id=v_staff.id;
  if v_assignment.id is not null then
    update public.staff_school_assignments
    set position_title=case
          when nullif(btrim(coalesce(p_position_title,'')),'') is null then v_assignment.position_title
          else nullif(btrim(p_position_title),'')
        end,
        updated_at=now()
    where id=v_assignment.id;
  end if;
  v_new:=jsonb_build_object(
    'first_name',btrim(p_first_name),'last_name',btrim(p_last_name),
    'employee_number',upper(btrim(p_employee_number)),
    'position_title',case
      when nullif(btrim(coalesce(p_position_title,'')),'') is null then v_assignment.position_title
      else nullif(btrim(p_position_title),'')
    end,
    'auth_user_id',v_staff.user_id
  );
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_staff.tenant_id,p_school_id,auth.uid(),'staff.identity.corrected','staff_member',v_staff.id,
    jsonb_build_object(
      'old',v_old,'new',v_new,'source',nullif(btrim(coalesce(p_source,'')),''),
      'reason',nullif(btrim(coalesce(p_reason,'')),''),
      'reviewer_user_id',auth.uid(),'auth_email_unchanged',true
    ));
  return true;
end;
$$;

create or replace function public.reconcile_staff_identities(
  p_school_id uuid,
  p_canonical_staff_member_id uuid,
  p_duplicate_staff_member_id uuid,
  p_confirmation text,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_school public.schools%rowtype;
  v_canonical public.staff_members%rowtype;
  v_duplicate public.staff_members%rowtype;
  v_membership record;
  v_assignment record;
  v_canonical_user uuid;
  v_confidence text;
  v_moved_memberships integer:=0;
  v_moved_assignments integer:=0;
  v_preserved_memberships integer:=0;
  v_preserved_assignments integer:=0;
  v_other_school_memberships integer:=0;
  v_other_school_assignments integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.user_can_reconcile_staff(auth.uid(),p_school_id) then
    raise exception 'Permission denied';
  end if;
  if upper(btrim(coalesce(p_confirmation,'')))<>'RECONCILE' then
    raise exception 'Type RECONCILE to confirm the identity merge';
  end if;
  if p_canonical_staff_member_id=p_duplicate_staff_member_id then
    raise exception 'Canonical and duplicate identities must differ';
  end if;
  select * into v_school from public.schools where id=p_school_id and status='active';
  if not found then raise exception 'School not found or inactive'; end if;

  -- Lock in UUID order so two administrators cannot reconcile the same pair
  -- concurrently in opposite directions.
  if p_canonical_staff_member_id<p_duplicate_staff_member_id then
    select * into v_canonical from public.staff_members where id=p_canonical_staff_member_id for update;
    select * into v_duplicate from public.staff_members where id=p_duplicate_staff_member_id for update;
  else
    select * into v_duplicate from public.staff_members where id=p_duplicate_staff_member_id for update;
    select * into v_canonical from public.staff_members where id=p_canonical_staff_member_id for update;
  end if;
  if v_canonical.id is null or v_duplicate.id is null
     or v_canonical.tenant_id<>v_school.tenant_id
     or v_duplicate.tenant_id<>v_school.tenant_id then
    raise exception 'Both staff identities must belong to the school tenant';
  end if;
  if v_canonical.reconciled_into_staff_member_id is not null
     or v_duplicate.reconciled_into_staff_member_id is not null then
    raise exception 'Only active, unreconciled staff identities can be reconciled';
  end if;
  if not exists(
    select 1 from public.staff_school_assignments ssa
    where ssa.school_id=p_school_id
      and ssa.staff_member_id in (v_canonical.id,v_duplicate.id)
  ) and not exists(
    select 1 from public.school_memberships sm
    where sm.school_id=p_school_id
      and sm.staff_member_id in (v_canonical.id,v_duplicate.id)
  ) then
    raise exception 'At least one identity must be associated with the current school';
  end if;

  if nullif(btrim(v_canonical.employee_number),'') is not null
     and nullif(btrim(v_duplicate.employee_number),'') is not null
     and upper(btrim(v_canonical.employee_number))=upper(btrim(v_duplicate.employee_number)) then
    v_confidence:='exact_employee_number';
  elsif v_canonical.user_id is not null
        and v_canonical.user_id=v_duplicate.user_id then
    v_confidence:='shared_auth_account';
  else
    -- An account link on only one record, or a name match, is not identity
    -- evidence. The reviewer confirmation cannot substitute for evidence.
    raise exception 'Strong identity evidence is required';
  end if;
  if v_duplicate.employee_number is not null
     and v_canonical.employee_number is null then
    raise exception 'Canonical identity must carry the authoritative employee number';
  end if;
  if v_canonical.user_id is not null and v_duplicate.user_id is not null
     and v_canonical.user_id<>v_duplicate.user_id then
    raise exception 'Cannot reconcile two different linked Auth accounts';
  end if;

  v_canonical_user:=coalesce(v_canonical.user_id,v_duplicate.user_id);

  -- Release the duplicate's tenant/user uniqueness slot before attaching the
  -- same Auth account to the canonical identity. Both rows are locked above,
  -- so this handoff remains atomic inside the reconciliation transaction.
  if v_duplicate.user_id is not null
     and v_duplicate.user_id=v_canonical_user
     and v_canonical.user_id is null then
    update public.staff_members
    set user_id=null,updated_at=now()
    where id=v_duplicate.id;
  end if;

  update public.staff_members
  set user_id=v_canonical_user,updated_at=now()
  where id=v_canonical.id;

  for v_membership in
    select sm.*
    from public.school_memberships sm
    where sm.staff_member_id=v_duplicate.id
      and sm.school_id=p_school_id
    order by sm.school_id,sm.active_from,sm.id
    for update
  loop
    if exists(
      select 1 from public.school_memberships existing
      where existing.id<>v_membership.id
        and existing.school_id=v_membership.school_id
        and existing.user_id=coalesce(v_canonical_user,v_membership.user_id)
        and existing.role_key=v_membership.role_key
        and existing.active_from=v_membership.active_from
    ) then
      v_preserved_memberships:=v_preserved_memberships+1;
    else
      update public.school_memberships
      set staff_member_id=v_canonical.id,user_id=coalesce(v_canonical_user,user_id)
      where id=v_membership.id;
    end if;
    v_moved_memberships:=v_moved_memberships+1;
  end loop;

  for v_assignment in
    select ssa.*
    from public.staff_school_assignments ssa
    where ssa.staff_member_id=v_duplicate.id
      and ssa.school_id=p_school_id
    order by ssa.school_id,ssa.effective_from,ssa.id
    for update
  loop
    if exists(
      select 1 from public.staff_school_assignments existing
      where existing.id<>v_assignment.id
        and existing.school_id=v_assignment.school_id
        and existing.staff_member_id=v_canonical.id
        and existing.effective_from=v_assignment.effective_from
    ) then
      v_preserved_assignments:=v_preserved_assignments+1;
    else
      update public.staff_school_assignments
      set staff_member_id=v_canonical.id,updated_at=now()
      where id=v_assignment.id;
    end if;
    v_moved_assignments:=v_moved_assignments+1;
  end loop;

  select count(*) into v_other_school_memberships
  from public.school_memberships sm
  where sm.staff_member_id=v_duplicate.id and sm.school_id<>p_school_id;
  select count(*) into v_other_school_assignments
  from public.staff_school_assignments ssa
  where ssa.staff_member_id=v_duplicate.id and ssa.school_id<>p_school_id;

  -- Preserve timetable/register references on the canonical identity. These
  -- updates are intentionally narrow and retain the duplicate staff row.
  update public.teacher_allocations ta
  set staff_member_id=v_canonical.id
  where ta.staff_member_id=v_duplicate.id
    and ta.school_id=p_school_id
    and not exists(
      select 1 from public.teacher_allocations existing
      where existing.staff_member_id=v_canonical.id
        and existing.subject_offering_id=ta.subject_offering_id
        and existing.register_class_id=ta.register_class_id
        and existing.active_from=ta.active_from
    );
  update public.register_classes
  set register_teacher_staff_id=v_canonical.id
  where register_teacher_staff_id=v_duplicate.id
    and school_id=p_school_id;

  update public.staff_members
  set status='inactive',
      reconciled_into_staff_member_id=v_canonical.id,
      reconciled_at=now(),
      reconciled_by_user_id=auth.uid(),
      reconciliation_reason=nullif(btrim(coalesce(p_reason,'')),''),
      user_id=null,
      updated_at=now()
  where id=v_duplicate.id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_school.tenant_id,p_school_id,auth.uid(),'staff.identity.reconciled','staff_member',v_canonical.id,
    jsonb_build_object(
      'canonical_staff_member_id',v_canonical.id,
      'duplicate_staff_member_id',v_duplicate.id,
      'canonical_employee_number',v_canonical.employee_number,
      'duplicate_employee_number',v_duplicate.employee_number,
      'canonical_user_id',v_canonical_user,
      'confidence',v_confidence,
      'moved_memberships',v_moved_memberships,
      'moved_assignments',v_moved_assignments,
      'preserved_conflicting_memberships',v_preserved_memberships,
      'preserved_conflicting_assignments',v_preserved_assignments,
      'untouched_other_school_memberships',v_other_school_memberships,
      'untouched_other_school_assignments',v_other_school_assignments,
      'reason',nullif(btrim(coalesce(p_reason,'')),''),
      'source','staff_directory',
      'reviewer_user_id',auth.uid()
    ));
  return v_canonical.id;
end;
$$;

revoke all on function public.correct_staff_details(uuid,uuid,text,text,text,text,text,text) from public,anon;
revoke all on function public.reconcile_staff_identities(uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.correct_staff_details(uuid,uuid,text,text,text,text,text,text) to authenticated;
grant execute on function public.reconcile_staff_identities(uuid,uuid,uuid,text,text) to authenticated;

-- Hide reconciled rows while retaining the existing directory contract.
create or replace function public.list_staff_access_directory_page(
  p_school_id uuid,
  p_query text default null,
  p_page integer default 1,
  p_page_size integer default 50
)
returns table(
  row_id uuid, staff_id uuid, staff_name text, employee_number text,
  staff_code text, default_room_name text, labels text[], active_from date,
  active_to date, has_account boolean, total_count bigint, linked_user_id uuid,
  pending_invitation_id uuid, pending_invitation_status text, active_roles jsonb
)
language sql stable security definer
set search_path=pg_catalog,public,app_private
as $$
  with base as (
    select d.*
    from public.list_staff_directory_page(p_school_id,p_query,p_page,p_page_size) d
    left join public.staff_members staff on staff.id=d.staff_id
    where d.staff_id is null or staff.reconciled_into_staff_member_id is null
  )
  select base.row_id,base.staff_id,base.staff_name,base.employee_number,base.staff_code,
    base.default_room_name,base.labels,base.active_from,base.active_to,base.has_account,
    base.total_count,staff.user_id,pending.id,pending.status,
    coalesce(roles.items,'[]'::jsonb)
  from base
  left join public.staff_members staff on staff.id=base.staff_id
  left join lateral (
    select si.id,si.status
    from public.school_invitations si
    where si.school_id=p_school_id and si.staff_member_id=base.staff_id
      and si.status='pending' and si.expires_at>now()
    order by si.invited_at desc
    limit 1
  ) pending on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id',sm.id,'roleKey',sm.role_key,'activeFrom',sm.active_from,'activeTo',sm.active_to
    ) order by sm.role_key,sm.active_from) items
    from public.school_memberships sm
    where sm.school_id=p_school_id and sm.staff_member_id=base.staff_id
      and sm.active_from<=current_date and (sm.active_to is null or sm.active_to>=current_date)
  ) roles on true;
$$;

revoke all on function public.list_staff_access_directory_page(uuid,text,integer,integer) from public,anon;
grant execute on function public.list_staff_access_directory_page(uuid,text,integer,integer) to authenticated;

comment on table public.staff_members is
'Tenant-wide staff identities. Reconciled duplicates remain as historical pointers and are not hard-deleted.';