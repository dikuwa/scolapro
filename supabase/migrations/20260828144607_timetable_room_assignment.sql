create or replace function public.assign_timetable_slot_room(p_slot_id uuid, p_room_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_slot public.timetable_slots%rowtype;
  v_room public.school_rooms%rowtype;
begin
  select * into v_slot from public.timetable_slots where id=p_slot_id;
  if not found then raise exception 'Timetable slot not found.' using errcode='22023'; end if;
  if not app_private.has_school_role(v_slot.school_id, array['school_admin']) then raise exception 'Permission denied' using errcode='42501'; end if;
  if p_room_id is null then
    update public.timetable_slots set room_id=null, room_label=null, updated_at=now() where id=p_slot_id;
  else
    select * into v_room from public.school_rooms where id=p_room_id and status='active';
    if not found or v_room.school_id<>v_slot.school_id or v_room.tenant_id<>v_slot.tenant_id then raise exception 'Room is not available for this school.' using errcode='22023'; end if;
    if exists (select 1 from public.timetable_slots other where other.id<>p_slot_id and other.status='active' and other.school_id=v_slot.school_id and other.academic_year=v_slot.academic_year and other.cycle_code=v_slot.cycle_code and other.weekday=v_slot.weekday and other.period_id=v_slot.period_id and other.room_id=p_room_id) then raise exception 'This room is already booked for that cycle, day and period.' using errcode='23505'; end if;
    update public.timetable_slots set room_id=p_room_id, room_label=v_room.display_name, updated_at=now() where id=p_slot_id;
  end if;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata) values(v_slot.tenant_id,v_slot.school_id,auth.uid(),'timetable_slot.room_assigned','timetable_slot',p_slot_id,jsonb_build_object('room_id',p_room_id));
end;
$$;
revoke all on function public.assign_timetable_slot_room(uuid,uuid) from public, anon;
grant execute on function public.assign_timetable_slot_room(uuid,uuid) to authenticated;
