-- Keep advance detention planning atomic and expose only the staff directory slice
-- needed by a leadership or delegated late-arrival duty coordinator.

create or replace function public.create_detention_session_plan(
  p_school_id uuid,
  p_session_date date,
  p_starts_at time default null,
  p_ends_at time default null,
  p_location text default null,
  p_notes text default null,
  p_staff_member_ids uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_tenant_id uuid;
  v_session_id uuid;
  v_staff_id uuid;
  v_user_id uuid;
  v_unique_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_session_date is null then raise exception 'Detention date is required'; end if;
  if p_session_date<current_date then raise exception 'Past detention sessions cannot be planned'; end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at<=p_starts_at then
    raise exception 'Detention end time must be after the start time';
  end if;

  if not (
    app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])
    or app_private.has_school_duty(p_school_id,'late_arrival_recorder',p_session_date)
  ) then raise exception 'Permission denied'; end if;

  select tenant_id into v_tenant_id from public.schools where id=p_school_id;
  if v_tenant_id is null then raise exception 'School not found'; end if;

  select count(distinct value) into v_unique_count
  from unnest(coalesce(p_staff_member_ids,array[]::uuid[])) as chosen(value);
  if v_unique_count=0 then raise exception 'Choose at least one detention supervisor'; end if;

  foreach v_staff_id in array p_staff_member_ids loop
    if not app_private.staff_member_has_school_assignment(v_staff_id,p_school_id,p_session_date) then
      raise exception 'A selected supervisor is not assigned to this school on the detention date';
    end if;
  end loop;

  insert into public.detention_sessions(
    tenant_id,school_id,session_date,starts_at,ends_at,supervisor_staff_member_id,
    location,notes,created_by_user_id
  ) values(
    v_tenant_id,p_school_id,p_session_date,p_starts_at,p_ends_at,p_staff_member_ids[1],
    nullif(btrim(p_location),''),nullif(btrim(p_notes),''),auth.uid()
  ) returning id into v_session_id;

  for v_staff_id in
    select distinct value from unnest(p_staff_member_ids) as selected(value)
  loop
    insert into public.detention_session_supervisors(
      tenant_id,school_id,detention_session_id,staff_member_id,assigned_by_user_id
    ) values(v_tenant_id,p_school_id,v_session_id,v_staff_id,auth.uid());

    select user_id into v_user_id from public.staff_members where id=v_staff_id;
    if v_user_id is not null then
      insert into public.notifications(recipient_user_id,tenant_id,school_id,severity,title,body,href)
      values(
        v_user_id,v_tenant_id,p_school_id,'info','Detention duty scheduled',
        'You are scheduled to supervise detention on ' || to_char(p_session_date,'DD Mon YYYY') || '.',
        '/late-arrivals'
      );
    end if;
  end loop;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_tenant_id,p_school_id,auth.uid(),'detention.session.created','detention_session',v_session_id,
    jsonb_build_object(
      'session_date',p_session_date,
      'planned_in_advance',p_session_date>current_date,
      'staff_member_ids',p_staff_member_ids
    )
  );

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_tenant_id,p_school_id,auth.uid(),'detention.session.supervisors_updated','detention_session',v_session_id,
    jsonb_build_object('session_date',p_session_date,'staff_member_ids',p_staff_member_ids,'source','session_create')
  );

  return v_session_id;
end;
$$;

revoke all on function public.create_detention_session_plan(uuid,date,time,time,text,text,uuid[]) from public,anon;
grant execute on function public.create_detention_session_plan(uuid,date,time,time,text,text,uuid[]) to authenticated;

create or replace function public.list_detention_planning_staff(
  p_school_id uuid,
  p_from_date date,
  p_to_date date
)
returns table(
  staff_member_id uuid,
  employee_number text,
  first_name text,
  last_name text,
  eligible boolean,
  effective_from date,
  effective_to date
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_from_date is null or p_to_date is null or p_to_date<p_from_date then
    raise exception 'Invalid detention planning date range';
  end if;
  if p_to_date>p_from_date+interval '120 days' then
    raise exception 'Detention planning range is too large';
  end if;

  if not (
    app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])
    or exists (
      select 1
      from public.school_duty_assignments d
      join public.staff_members sm on sm.id=d.staff_member_id
      where d.school_id=p_school_id
        and d.duty_key='late_arrival_recorder'
        and sm.user_id=auth.uid()
        and sm.status='active'
        and d.active_from<=p_to_date
        and (d.active_to is null or d.active_to>=p_from_date)
        and app_private.staff_member_has_school_assignment(sm.id,p_school_id,greatest(d.active_from,p_from_date))
    )
  ) then raise exception 'Permission denied'; end if;

  return query
  with placements as (
    select
      sm.id,
      sm.employee_number,
      sm.first_name,
      sm.last_name,
      coalesce(dsp.eligible,true) as eligible,
      ssa.effective_from,
      ssa.effective_to
    from public.staff_school_assignments ssa
    join public.staff_members sm
      on sm.id=ssa.staff_member_id
     and sm.tenant_id=ssa.tenant_id
     and sm.status='active'
    left join public.detention_supervision_preferences dsp
      on dsp.school_id=p_school_id and dsp.staff_member_id=sm.id
    where ssa.school_id=p_school_id
      and ssa.effective_from<=p_to_date
      and (ssa.effective_to is null or ssa.effective_to>=p_from_date)

    union all

    select
      sm.id,
      sm.employee_number,
      sm.first_name,
      sm.last_name,
      coalesce(dsp.eligible,true) as eligible,
      m.active_from,
      m.active_to
    from public.school_memberships m
    join public.staff_members sm
      on sm.id=m.staff_member_id
     and sm.tenant_id=m.tenant_id
     and sm.status='active'
    left join public.detention_supervision_preferences dsp
      on dsp.school_id=p_school_id and dsp.staff_member_id=sm.id
    where m.school_id=p_school_id
      and m.active_from<=p_to_date
      and (m.active_to is null or m.active_to>=p_from_date)
  )
  select distinct on (p.id)
    p.id,p.employee_number,p.first_name,p.last_name,p.eligible,p.effective_from,p.effective_to
  from placements p
  order by p.id,p.effective_from asc;
end;
$$;

revoke all on function public.list_detention_planning_staff(uuid,date,date) from public,anon;
grant execute on function public.list_detention_planning_staff(uuid,date,date) to authenticated;

comment on function public.create_detention_session_plan(uuid,date,time,time,text,text,uuid[]) is
'Atomically creates a future/current detention session, its multi-staff duty team, account-linked notifications and audit provenance. Any invalid selected supervisor rolls the entire plan back.';
comment on function public.list_detention_planning_staff(uuid,date,date) is
'Bounded planning read model exposing only active staff identities with a school placement overlapping the requested detention-planning horizon to authorized leadership or delegated late-arrival duty coordinators.';
