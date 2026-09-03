-- Governed correction boundary for timetable plans.
-- Planned teacher allocations may have their effective dates corrected before they start.
-- Timetable slots are cancelled by status so prior schedule history and linked attendance remain intact.

create or replace function public.update_teacher_allocation_period(
  p_allocation_id uuid,
  p_active_from date,
  p_active_to date default null
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_allocation public.teacher_allocations%rowtype;
  v_old_from date;
  v_old_to date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_active_from is null then raise exception 'Teacher allocation start date is required'; end if;
  if p_active_from < current_date then raise exception 'Planned teacher allocation cannot be backdated'; end if;
  if p_active_to is not null and p_active_to < p_active_from then
    raise exception 'Teacher allocation end date cannot precede start date';
  end if;

  select * into v_allocation
  from public.teacher_allocations
  where id=p_allocation_id
  for update;

  if not found then raise exception 'Teacher allocation not found'; end if;
  if not app_private.can_manage_school_members(v_allocation.school_id) then raise exception 'Permission denied'; end if;
  if v_allocation.active_from <= current_date then
    raise exception 'Only planned future teacher allocations can be corrected';
  end if;

  v_old_from:=v_allocation.active_from;
  v_old_to:=v_allocation.active_to;

  update public.teacher_allocations
  set active_from=p_active_from,
      active_to=p_active_to
  where id=v_allocation.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_allocation.tenant_id,v_allocation.school_id,auth.uid(),
    'timetable.teacher_allocation.period_corrected','teacher_allocation',v_allocation.id,
    jsonb_build_object(
      'old_active_from',v_old_from,
      'old_active_to',v_old_to,
      'active_from',p_active_from,
      'active_to',p_active_to
    )
  );

  return v_allocation.id;
end;
$$;

revoke all on function public.update_teacher_allocation_period(uuid,date,date) from public,anon;
grant execute on function public.update_teacher_allocation_period(uuid,date,date) to authenticated;

create or replace function public.cancel_timetable_slot(
  p_slot_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_slot public.timetable_slots%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_slot
  from public.timetable_slots
  where id=p_slot_id
  for update;

  if not found then raise exception 'Timetable slot not found'; end if;
  if not app_private.can_manage_school_members(v_slot.school_id) then raise exception 'Permission denied'; end if;

  if v_slot.status='cancelled' then return v_slot.id; end if;
  if v_slot.status<>'active' then raise exception 'Only an active timetable slot can be cancelled'; end if;

  update public.timetable_slots
  set status='cancelled',updated_at=now()
  where id=v_slot.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_slot.tenant_id,v_slot.school_id,auth.uid(),
    'timetable.slot.cancelled','timetable_slot',v_slot.id,
    jsonb_build_object(
      'academic_year',v_slot.academic_year,
      'cycle_code',v_slot.cycle_code,
      'weekday',v_slot.weekday,
      'period_id',v_slot.period_id,
      'register_class_id',v_slot.register_class_id,
      'teacher_allocation_id',v_slot.teacher_allocation_id,
      'room_id',v_slot.room_id
    )
  );

  return v_slot.id;
end;
$$;

revoke all on function public.cancel_timetable_slot(uuid) from public,anon;
grant execute on function public.cancel_timetable_slot(uuid) to authenticated;

comment on function public.update_teacher_allocation_period(uuid,date,date) is
  'School-admin correction boundary for a future teacher-allocation plan before its effective start date.';
comment on function public.cancel_timetable_slot(uuid) is
  'School-admin cancellation boundary that preserves timetable-slot history by moving an active slot to cancelled.';
