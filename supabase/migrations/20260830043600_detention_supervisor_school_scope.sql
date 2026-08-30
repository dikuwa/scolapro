-- A detention supervisor is a school-scoped operational assignee. Same-tenant staff
-- at another school must not be selectable merely because the shared staff identity is
-- active. Validate assignment/membership on the detention session date.

create or replace function public.create_detention_session(
  p_school_id uuid,
  p_session_date date,
  p_starts_at time default null,
  p_ends_at time default null,
  p_supervisor_staff_member_id uuid default null,
  p_location text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_tenant_id uuid;
  v_session_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal']) then raise exception 'Permission denied'; end if;
  select tenant_id into v_tenant_id from public.schools where id=p_school_id;
  if v_tenant_id is null then raise exception 'School not found'; end if;
  if p_supervisor_staff_member_id is not null and not exists(
    select 1
    from public.staff_members staff
    where staff.id=p_supervisor_staff_member_id
      and staff.tenant_id=v_tenant_id
      and staff.status='active'
      and (
        exists(
          select 1 from public.staff_school_assignments ssa
          where ssa.school_id=p_school_id
            and ssa.staff_member_id=staff.id
            and ssa.effective_from<=p_session_date
            and (ssa.effective_to is null or ssa.effective_to>=p_session_date)
        )
        or exists(
          select 1 from public.school_memberships sm
          where sm.school_id=p_school_id
            and sm.staff_member_id=staff.id
            and sm.active_from<=p_session_date
            and (sm.active_to is null or sm.active_to>=p_session_date)
        )
      )
  ) then
    raise exception 'Detention supervisor is not actively assigned to this school on the session date';
  end if;
  insert into public.detention_sessions(
    tenant_id,school_id,session_date,starts_at,ends_at,supervisor_staff_member_id,location,notes,created_by_user_id
  ) values(
    v_tenant_id,p_school_id,p_session_date,p_starts_at,p_ends_at,p_supervisor_staff_member_id,
    nullif(btrim(p_location),''),nullif(btrim(p_notes),''),auth.uid()
  ) returning id into v_session_id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_tenant_id,p_school_id,auth.uid(),'detention.session.created','detention_session',v_session_id,
    jsonb_build_object('session_date',p_session_date,'supervisor_staff_member_id',p_supervisor_staff_member_id));
  return v_session_id;
end;
$$;

comment on function public.create_detention_session(uuid,date,time,time,uuid,text,text) is
'Creates a school detention session. Any nominated supervisor must be active and assigned/membership-linked to that school on the session date.';
