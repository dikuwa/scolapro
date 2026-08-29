-- Register/class teacher assignment is an operational responsibility attached to the
-- class, not an Auth-account property. Schools may assign an active staff identity
-- before that teacher receives a ScolaPro login; later role checks still require the
-- corresponding authenticated account when the teacher performs protected actions.

create or replace function public.assign_register_teacher(
  p_register_class_id uuid,
  p_staff_member_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_class public.register_classes%rowtype;
  v_staff public.staff_members%rowtype;
  v_previous_staff_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_class
  from public.register_classes
  where id=p_register_class_id
  for update;
  if not found then raise exception 'Register class not found'; end if;

  if not (
    app_private.has_platform_role(array['platform_admin'])
    or exists(
      select 1 from public.school_memberships sm
      where sm.school_id=v_class.school_id
        and sm.user_id=(select auth.uid())
        and sm.role_key in ('school_admin','principal','deputy_principal')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    )
  ) then raise exception 'Permission denied'; end if;

  v_previous_staff_id:=v_class.register_teacher_staff_id;

  if p_staff_member_id is not null then
    select * into v_staff from public.staff_members where id=p_staff_member_id;
    if not found
      or v_staff.tenant_id<>v_class.tenant_id
      or v_staff.status<>'active'
    then raise exception 'Register teacher is not an active staff member in this tenant'; end if;

    if not exists(
      select 1 from public.staff_school_assignments ssa
      where ssa.school_id=v_class.school_id
        and ssa.staff_member_id=v_staff.id
        and ssa.effective_from<=current_date
        and (ssa.effective_to is null or ssa.effective_to>=current_date)
    ) and not exists(
      select 1 from public.school_memberships sm
      where sm.school_id=v_class.school_id
        and sm.staff_member_id=v_staff.id
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    ) then raise exception 'Register teacher is not actively assigned to this school'; end if;
  end if;

  update public.register_classes
  set register_teacher_staff_id=p_staff_member_id
  where id=v_class.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_class.tenant_id,v_class.school_id,auth.uid(),
    case when p_staff_member_id is null then 'register_class.teacher_unassigned' else 'register_class.teacher_assigned' end,
    'register_class',v_class.id,
    jsonb_build_object(
      'previous_staff_member_id',v_previous_staff_id,
      'staff_member_id',p_staff_member_id,
      'academic_year',v_class.academic_year,
      'class_code',v_class.class_code
    )
  );

  return true;
end;
$$;

revoke all on function public.assign_register_teacher(uuid,uuid) from public,anon;
grant execute on function public.assign_register_teacher(uuid,uuid) to authenticated;

comment on function public.assign_register_teacher(uuid,uuid) is
'Assigns or clears the operational register teacher for a class using active staff-school placement, independent of whether that staff identity already has a login.';