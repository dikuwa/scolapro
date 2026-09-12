create or replace function app_private.room_inventory_current_school_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select sm.school_id
  from public.school_memberships sm
  where sm.user_id = auth.uid()
    and sm.active_from <= current_date
    and (sm.active_to is null or sm.active_to >= current_date)
  order by sm.active_from desc, sm.id
  limit 1;
$$;

revoke all on function app_private.room_inventory_current_school_id() from public, anon, authenticated;

create or replace function app_private.can_manage_room_inventory(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app_private
as $$
  select target_school_id = app_private.room_inventory_current_school_id()
    and app_private.has_school_role(
      target_school_id,
      array['school_admin','principal','deputy_principal']
    );
$$;

create or replace function app_private.is_current_room_inventory_custodian(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app_private
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
      and staff.user_id = auth.uid()
      and staff.status = 'active'
      and ric.effective_from <= current_date
      and (ric.effective_to is null or ric.effective_to >= current_date)
      and (
        exists (
          select 1
          from public.staff_school_assignments ssa
          where ssa.staff_member_id = staff.id
            and ssa.school_id = room.school_id
            and ssa.effective_from <= current_date
            and (ssa.effective_to is null or ssa.effective_to >= current_date)
        )
        or exists (
          select 1
          from public.school_memberships sm
          where sm.school_id = room.school_id
            and sm.user_id = auth.uid()
            and (sm.staff_member_id is null or sm.staff_member_id = staff.id)
            and sm.active_from <= current_date
            and (sm.active_to is null or sm.active_to >= current_date)
        )
      )
  );
$$;

revoke all on function app_private.can_manage_room_inventory(uuid) from public, anon;
revoke all on function app_private.is_current_room_inventory_custodian(uuid) from public, anon;
grant execute on function app_private.can_manage_room_inventory(uuid) to authenticated;
grant execute on function app_private.is_current_room_inventory_custodian(uuid) to authenticated;

comment on function app_private.room_inventory_current_school_id() is
  'Returns the deterministic current school used for room-inventory authorization, matching application membership ordering.';
comment on function app_private.can_manage_room_inventory(uuid) is
  'Allows room-inventory management only inside the authenticated actor''s deterministic current school and existing school leadership roles.';
comment on function app_private.is_current_room_inventory_custodian(uuid) is
  'Returns true only while the authenticated active staff member is the effective custodian, retains a current relationship to the room school, and that school is the actor''s deterministic current school.';
