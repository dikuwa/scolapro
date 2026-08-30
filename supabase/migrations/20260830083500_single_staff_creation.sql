-- Single-staff onboarding reuses the same deterministic identity and effective-dated
-- school-placement model as bulk staff imports. Creating a staff person never creates
-- a login account; invitations remain a separate access-control workflow.

create or replace function public.create_or_assign_school_staff(
  p_school_id uuid,
  p_employee_number text,
  p_first_name text,
  p_last_name text,
  p_assignment_type text default 'staff',
  p_position_title text default null,
  p_effective_from date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_school public.schools%rowtype;
  v_staff public.staff_members%rowtype;
  v_employee text := upper(btrim(coalesce(p_employee_number, '')));
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last text := btrim(coalesce(p_last_name, ''));
  v_assignment_id uuid;
  v_created boolean := false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (
    app_private.has_school_role(p_school_id, array['school_admin'])
    or app_private.has_platform_role(array['platform_admin'])
  ) then raise exception 'Permission denied'; end if;

  if v_employee = '' then raise exception 'Employee number is required'; end if;
  if v_first = '' then raise exception 'First name is required'; end if;
  if v_last = '' then raise exception 'Last name is required'; end if;
  if p_assignment_type not in ('staff','teacher','management','support','temporary','other') then
    raise exception 'Invalid assignment type';
  end if;
  if p_effective_from is null then raise exception 'Effective-from date is required'; end if;

  select * into v_school from public.schools where id = p_school_id and status = 'active';
  if not found then raise exception 'School not found or inactive'; end if;

  select * into v_staff
  from public.staff_members
  where tenant_id = v_school.tenant_id
    and upper(btrim(coalesce(employee_number, ''))) = v_employee
  order by created_at
  limit 1;

  if found then
    if lower(btrim(v_staff.first_name)) <> lower(v_first)
       or lower(btrim(v_staff.last_name)) <> lower(v_last) then
      raise exception 'Employee number already belongs to a different staff identity';
    end if;
  else
    insert into public.staff_members(tenant_id, employee_number, first_name, last_name, status)
    values(v_school.tenant_id, v_employee, v_first, v_last, 'active')
    returning * into v_staff;
    v_created := true;
  end if;

  if exists(
    select 1
    from public.staff_school_assignments ssa
    where ssa.school_id = p_school_id
      and ssa.staff_member_id = v_staff.id
      and ssa.effective_from <= p_effective_from
      and (ssa.effective_to is null or ssa.effective_to >= p_effective_from)
  ) then
    raise exception 'This staff member already has a school assignment covering the selected start date';
  end if;

  -- Because a newly created placement is open-ended, a later placement would overlap it.
  if exists(
    select 1
    from public.staff_school_assignments ssa
    where ssa.school_id = p_school_id
      and ssa.staff_member_id = v_staff.id
      and ssa.effective_from > p_effective_from
  ) then
    raise exception 'A later school assignment already exists; choose a non-overlapping placement period';
  end if;

  v_assignment_id := public.assign_staff_to_school(
    p_school_id,
    v_staff.id,
    p_assignment_type,
    nullif(btrim(coalesce(p_position_title, '')), ''),
    p_effective_from,
    null
  );

  insert into public.audit_events(tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values(
    v_school.tenant_id,
    p_school_id,
    auth.uid(),
    'staff.single_onboarding.completed',
    'staff_member',
    v_staff.id,
    jsonb_build_object(
      'employee_number', v_employee,
      'assignment_id', v_assignment_id,
      'created_identity', v_created,
      'assignment_type', p_assignment_type,
      'effective_from', p_effective_from,
      'login_account_created', false
    )
  );

  return jsonb_build_object(
    'staff_member_id', v_staff.id,
    'assignment_id', v_assignment_id,
    'employee_number', v_employee,
    'created_identity', v_created,
    'login_account_created', false
  );
end;
$$;

revoke all on function public.create_or_assign_school_staff(uuid,text,text,text,text,text,date) from public, anon;
grant execute on function public.create_or_assign_school_staff(uuid,text,text,text,text,text,date) to authenticated;

comment on function public.create_or_assign_school_staff(uuid,text,text,text,text,text,date) is
'Creates or deterministically reuses a tenant staff identity by employee number, then creates an effective-dated school assignment. It never creates a login account.';
