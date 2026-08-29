-- Teacher allocations use operational school placement, not account membership.
-- Imported teachers may be allocated before they receive a ScolaPro login.

create or replace function public.create_teacher_allocation(
  p_school_id uuid,
  p_academic_year integer,
  p_subject_offering_id uuid,
  p_register_class_id uuid,
  p_staff_member_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_tenant_id uuid;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_school_members(p_school_id) then raise exception 'Permission denied'; end if;
  select tenant_id into v_tenant_id from public.schools where id=p_school_id and status='active';
  if v_tenant_id is null then raise exception 'School not found or inactive'; end if;

  if not exists (
    select 1 from public.subject_offerings
    where id=p_subject_offering_id and school_id=p_school_id and academic_year=p_academic_year and status='active'
  ) then raise exception 'Subject offering is outside school/year scope'; end if;
  if not exists (
    select 1 from public.register_classes
    where id=p_register_class_id and school_id=p_school_id and academic_year=p_academic_year
  ) then raise exception 'Register class is outside school/year scope'; end if;
  if not exists (
    select 1
    from public.staff_members sm
    where sm.id=p_staff_member_id
      and sm.tenant_id=v_tenant_id
      and sm.status='active'
      and (
        exists (
          select 1 from public.staff_school_assignments ssa
          where ssa.staff_member_id=sm.id and ssa.school_id=p_school_id
            and ssa.effective_from<=current_date
            and (ssa.effective_to is null or ssa.effective_to>=current_date)
        )
        or exists (
          select 1 from public.school_memberships m
          where m.staff_member_id=sm.id and m.school_id=p_school_id
            and m.active_from<=current_date
            and (m.active_to is null or m.active_to>=current_date)
        )
      )
  ) then raise exception 'Staff member is outside active school scope'; end if;

  insert into public.teacher_allocations(
    tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id
  ) values(
    v_tenant_id,p_school_id,p_academic_year,p_subject_offering_id,p_register_class_id,p_staff_member_id
  )
  on conflict(subject_offering_id,register_class_id,staff_member_id,active_from) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.teacher_allocations
    where subject_offering_id=p_subject_offering_id
      and register_class_id=p_register_class_id
      and staff_member_id=p_staff_member_id
      and active_to is null
    order by active_from desc limit 1;
  end if;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_tenant_id,p_school_id,auth.uid(),'timetable.teacher_allocation.saved','teacher_allocation',v_id,
    jsonb_build_object('staff_member_id',p_staff_member_id,'subject_offering_id',p_subject_offering_id,'register_class_id',p_register_class_id,'academic_year',p_academic_year));

  return v_id;
end;
$$;

revoke all on function public.create_teacher_allocation(uuid,integer,uuid,uuid,uuid) from public,anon;
grant execute on function public.create_teacher_allocation(uuid,integer,uuid,uuid,uuid) to authenticated;

comment on function public.create_teacher_allocation(uuid,integer,uuid,uuid,uuid) is
'Creates a teacher allocation for an active school-assigned staff identity, independent of whether the staff member already has a login account.';
