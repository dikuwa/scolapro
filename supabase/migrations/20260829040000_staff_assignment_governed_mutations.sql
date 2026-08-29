-- Staff placements are operational source-of-truth records. Keep table reads
-- available to authorized school members, but route writes through audited RPCs.

drop policy if exists "school leaders insert staff assignments" on public.staff_school_assignments;
drop policy if exists "school leaders update staff assignments" on public.staff_school_assignments;
drop policy if exists "school leaders delete staff assignments" on public.staff_school_assignments;
revoke insert,update,delete on public.staff_school_assignments from authenticated;

create or replace function public.end_staff_school_assignment(
  p_assignment_id uuid,
  p_effective_to date default current_date
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_assignment public.staff_school_assignments%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_assignment from public.staff_school_assignments where id=p_assignment_id for update;
  if not found then raise exception 'Staff assignment not found'; end if;
  if not (
    app_private.has_school_role(v_assignment.school_id,array['school_admin','principal','deputy_principal'])
    or app_private.has_platform_role(array['platform_admin'])
  ) then raise exception 'Permission denied'; end if;
  if p_effective_to is null or p_effective_to<v_assignment.effective_from then
    raise exception 'Effective-to date cannot precede effective-from date';
  end if;
  if v_assignment.effective_to is not null and p_effective_to>v_assignment.effective_to then
    raise exception 'Cannot extend a closed assignment through the end-assignment workflow';
  end if;

  update public.staff_school_assignments
  set effective_to=p_effective_to,updated_at=now()
  where id=v_assignment.id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_assignment.tenant_id,v_assignment.school_id,auth.uid(),'staff.school_assignment.ended','staff_school_assignment',v_assignment.id,
    jsonb_build_object('staff_member_id',v_assignment.staff_member_id,'effective_to',p_effective_to));
  return true;
end;
$$;

revoke all on function public.end_staff_school_assignment(uuid,date) from public,anon;
grant execute on function public.end_staff_school_assignment(uuid,date) to authenticated;

comment on function public.end_staff_school_assignment(uuid,date) is
'Audited school-leader workflow for ending an effective-dated staff placement without deleting history.';
