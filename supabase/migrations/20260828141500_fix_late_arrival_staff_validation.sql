create or replace function public.assign_school_duty(
  p_school_id uuid,
  p_staff_member_id uuid,
  p_duty_key text,
  p_active_from date default current_date,
  p_active_to date default null
)
returns uuid
language plpgsql security definer set search_path=public,app_private as $$
declare v_school public.schools%rowtype; v_staff public.staff_members%rowtype; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_school from public.schools where id=p_school_id;
  if not found then raise exception 'School not found'; end if;
  if not app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal']) and not app_private.has_platform_role(array['platform_admin']) then raise exception 'Permission denied'; end if;
  select sm.* into v_staff
  from public.staff_members sm
  where sm.id=p_staff_member_id and sm.tenant_id=v_school.tenant_id and sm.status='active'
    and exists(
      select 1 from public.school_memberships membership
      where membership.school_id=p_school_id and membership.staff_member_id=sm.id
        and membership.active_from<=p_active_from
        and (membership.active_to is null or membership.active_to>=p_active_from)
    );
  if not found then raise exception 'Active staff member not found in school'; end if;
  if btrim(coalesce(p_duty_key,''))='' then raise exception 'Duty key is required'; end if;
  if p_active_to is not null and p_active_to<p_active_from then raise exception 'Duty end date cannot precede start date'; end if;
  insert into public.school_duty_assignments(tenant_id,school_id,staff_member_id,duty_key,active_from,active_to,assigned_by_user_id)
  values(v_school.tenant_id,v_school.id,v_staff.id,btrim(p_duty_key),p_active_from,p_active_to,auth.uid()) returning id into v_id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_school.tenant_id,v_school.id,auth.uid(),'school_duty.assigned','staff_member',v_staff.id,jsonb_build_object('duty_key',btrim(p_duty_key),'active_from',p_active_from,'active_to',p_active_to));
  return v_id;
end; $$;
