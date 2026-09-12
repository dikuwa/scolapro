-- Room inventory custodian authority must follow governed staff placement history.
-- If authoritative staff_school_assignments exist for a staff member, a stale
-- school_memberships row must not extend room-inventory authority after placement ends.

create or replace function app_private.is_current_room_inventory_custodian(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select exists (
    select 1
    from public.room_inventory_custodians ric
    join public.staff_members staff
      on staff.id = ric.staff_member_id
    join public.school_rooms room
      on room.id = ric.room_id
    where ric.room_id = target_room_id
      and room.school_id = app_private.room_inventory_current_school_id()
      and staff.user_id = (select auth.uid())
      and staff.status = 'active'
      and ric.effective_from <= current_date
      and (ric.effective_to is null or ric.effective_to >= current_date)
      and app_private.staff_member_covers_school_period(
        staff.id,
        room.school_id,
        current_date,
        current_date
      )
  );
$$;

revoke all on function app_private.is_current_room_inventory_custodian(uuid)
from public, anon;
grant execute on function app_private.is_current_room_inventory_custodian(uuid)
to authenticated;

create or replace function public.assign_room_inventory_custodian(
  p_room_id uuid,
  p_staff_member_id uuid,
  p_effective_from date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_room public.school_rooms%rowtype;
  v_staff public.staff_members%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_room
  from public.school_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found';
  end if;

  if not app_private.can_manage_room_inventory(v_room.school_id) then
    raise exception 'Permission denied';
  end if;

  select * into v_staff
  from public.staff_members
  where id = p_staff_member_id
    and status = 'active';

  if not found or v_staff.tenant_id <> v_room.tenant_id then
    raise exception 'Eligible staff member not found';
  end if;

  if p_effective_from is null
     or not app_private.staff_member_covers_school_period(
       p_staff_member_id,
       v_room.school_id,
       p_effective_from,
       p_effective_from
     ) then
    raise exception 'Staff member is not assigned to this school';
  end if;

  update public.room_inventory_custodians
  set effective_to = p_effective_from - 1
  where room_id = p_room_id
    and effective_to is null
    and effective_from < p_effective_from;

  delete from public.room_inventory_custodians
  where room_id = p_room_id
    and effective_to is null
    and effective_from >= p_effective_from;

  insert into public.room_inventory_custodians(
    tenant_id,
    school_id,
    room_id,
    staff_member_id,
    effective_from,
    assigned_by_user_id
  ) values (
    v_room.tenant_id,
    v_room.school_id,
    v_room.id,
    p_staff_member_id,
    p_effective_from,
    auth.uid()
  )
  returning id into v_id;

  insert into public.audit_events(
    tenant_id,
    school_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  ) values (
    v_room.tenant_id,
    v_room.school_id,
    auth.uid(),
    'room_inventory.custodian.assigned',
    'room_inventory_custodian',
    v_id,
    jsonb_build_object(
      'room_id', p_room_id,
      'staff_member_id', p_staff_member_id,
      'effective_from', p_effective_from
    )
  );

  return v_id;
end;
$$;

revoke all on function public.assign_room_inventory_custodian(uuid,uuid,date)
from public, anon;
grant execute on function public.assign_room_inventory_custodian(uuid,uuid,date)
to authenticated;

comment on function app_private.is_current_room_inventory_custodian(uuid) is
'Current-school room custodian check using effective custodian dates plus governed staff placement. Authoritative staff_school_assignments history takes precedence over legacy membership fallback.';

comment on function public.assign_room_inventory_custodian(uuid,uuid,date) is
'Assigns a room custodian only when the manager targets the deterministic current school and the staff member has governed placement covering the custodian effective date; preserves historical custodian and audit provenance.';
