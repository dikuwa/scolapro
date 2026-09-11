create or replace function app_private.is_current_room_inventory_custodian(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.room_inventory_custodians ric
    join public.staff_members staff
      on staff.id = ric.staff_member_id
    join public.school_rooms room
      on room.id = ric.room_id
    where ric.room_id = target_room_id
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

revoke all on function app_private.is_current_room_inventory_custodian(uuid) from public, anon;
grant execute on function app_private.is_current_room_inventory_custodian(uuid) to authenticated;

comment on function app_private.is_current_room_inventory_custodian(uuid) is
  'Returns true only while the authenticated active staff member is both the effective room custodian and still has a current relationship to that room''s school.';
