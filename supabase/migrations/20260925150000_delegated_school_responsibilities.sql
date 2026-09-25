-- Issue #679: bounded delegated school responsibilities.
-- Existing school_duty_assignments remains authoritative. This migration adds a
-- narrow capability catalogue and leadership-only assignment/read RPCs without
-- creating another role or permission system.

create table if not exists public.school_duty_capabilities (
  duty_key text primary key check (duty_key ~ '^[a-z][a-z0-9_]{2,79}$'),
  label text not null check (nullif(btrim(label), '') is not null),
  description text not null check (nullif(btrim(description), '') is not null),
  navigation_key text not null check (nullif(btrim(navigation_key), '') is not null),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.school_duty_capabilities(duty_key,label,description,navigation_key,active)
values (
  'late_arrival_recorder',
  'Late-arrival recorder',
  'Record school morning late arrivals and work the delegated late-arrival queue while the assignment is effective.',
  'late_arrivals',
  true
)
on conflict (duty_key) do update set
  label=excluded.label,
  description=excluded.description,
  navigation_key=excluded.navigation_key,
  active=excluded.active;

alter table public.school_duty_capabilities enable row level security;
revoke all on public.school_duty_capabilities from public, anon, authenticated;

create or replace function public.list_school_duty_capabilities()
returns table(
  duty_key text,
  label text,
  description text,
  navigation_key text
)
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select c.duty_key,c.label,c.description,c.navigation_key
  from public.school_duty_capabilities c
  where c.active
  order by c.label,c.duty_key;
$$;

revoke all on function public.list_school_duty_capabilities() from public,anon;
grant execute on function public.list_school_duty_capabilities() to authenticated;

create or replace function public.assign_school_duty(
  p_school_id uuid,
  p_staff_member_id uuid,
  p_duty_key text,
  p_active_from date default current_date,
  p_active_to date default null
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_school public.schools%rowtype;
  v_staff public.staff_members%rowtype;
  v_id uuid;
  v_duty_key text := btrim(coalesce(p_duty_key,''));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_active_from is null then raise exception 'Duty start date is required'; end if;

  select * into v_school from public.schools where id=p_school_id;
  if not found then raise exception 'School not found'; end if;
  if not app_private.user_can_manage_school_duties(auth.uid(),p_school_id) then
    raise exception 'Permission denied';
  end if;

  if not exists(
    select 1 from public.school_duty_capabilities c
    where c.duty_key=v_duty_key and c.active
  ) then
    raise exception 'Duty capability is not assignable';
  end if;

  select sm.* into v_staff
  from public.staff_members sm
  where sm.id=p_staff_member_id
    and sm.tenant_id=v_school.tenant_id
    and sm.status='active'
    and app_private.staff_member_has_school_assignment(sm.id,p_school_id,p_active_from);

  if not found then raise exception 'Active staff member not found in school on duty start date'; end if;
  if p_active_to is not null and p_active_to<p_active_from then
    raise exception 'Duty end date cannot precede start date';
  end if;

  if exists(
    select 1
    from public.school_duty_assignments d
    where d.school_id=p_school_id
      and d.staff_member_id=p_staff_member_id
      and d.duty_key=v_duty_key
      and daterange(d.active_from,coalesce(d.active_to,'infinity'::date),'[]')
          && daterange(p_active_from,coalesce(p_active_to,'infinity'::date),'[]')
  ) then
    raise exception 'This staff member already has an overlapping duty assignment';
  end if;

  insert into public.school_duty_assignments(
    tenant_id,school_id,staff_member_id,duty_key,active_from,active_to,assigned_by_user_id
  )
  values(
    v_school.tenant_id,v_school.id,v_staff.id,v_duty_key,p_active_from,p_active_to,auth.uid()
  )
  returning id into v_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  )
  values(
    v_school.tenant_id,v_school.id,auth.uid(),'school_duty.assigned','staff_member',v_staff.id,
    jsonb_build_object(
      'assignment_id',v_id,
      'duty_key',v_duty_key,
      'active_from',p_active_from,
      'active_to',p_active_to
    )
  );

  return v_id;
end;
$$;

create or replace function public.end_school_duty(
  p_assignment_id uuid,
  p_active_to date default current_date
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_duty public.school_duty_assignments%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_active_to is null then raise exception 'Duty end date is required'; end if;

  select * into v_duty
  from public.school_duty_assignments
  where id=p_assignment_id
  for update;

  if not found then raise exception 'Duty assignment not found'; end if;
  if not app_private.user_can_manage_school_duties(auth.uid(),v_duty.school_id) then
    raise exception 'Permission denied';
  end if;
  if p_active_to<v_duty.active_from then
    raise exception 'Duty end date cannot precede start date';
  end if;

  update public.school_duty_assignments
  set active_to=p_active_to
  where id=v_duty.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  )
  values(
    v_duty.tenant_id,v_duty.school_id,auth.uid(),'school_duty.ended','staff_member',v_duty.staff_member_id,
    jsonb_build_object(
      'assignment_id',v_duty.id,
      'duty_key',v_duty.duty_key,
      'active_to',p_active_to
    )
  );

  return true;
end;
$$;

revoke all on function public.assign_school_duty(uuid,uuid,text,date,date) from public,anon;
grant execute on function public.assign_school_duty(uuid,uuid,text,date,date) to authenticated;
revoke all on function public.end_school_duty(uuid,date) from public,anon;
grant execute on function public.end_school_duty(uuid,date) to authenticated;

create or replace function public.list_school_duty_assignments(
  p_school_id uuid,
  p_on_date date default current_date
)
returns table(
  assignment_id uuid,
  staff_member_id uuid,
  staff_name text,
  employee_number text,
  duty_key text,
  duty_label text,
  navigation_key text,
  active_from date,
  active_to date,
  currently_effective boolean
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.user_can_manage_school_duties(auth.uid(),p_school_id) then
    raise exception 'Permission denied';
  end if;

  return query
  select
    d.id,
    d.staff_member_id,
    concat_ws(' ',sm.first_name,sm.last_name),
    sm.employee_number,
    d.duty_key,
    coalesce(c.label,d.duty_key),
    coalesce(c.navigation_key,''),
    d.active_from,
    d.active_to,
    (
      d.active_from<=p_on_date
      and (d.active_to is null or d.active_to>=p_on_date)
      and sm.status='active'
      and app_private.staff_member_has_school_assignment(sm.id,p_school_id,p_on_date)
    )
  from public.school_duty_assignments d
  join public.staff_members sm on sm.id=d.staff_member_id
  left join public.school_duty_capabilities c on c.duty_key=d.duty_key
  where d.school_id=p_school_id
  order by
    case when d.active_from<=p_on_date and (d.active_to is null or d.active_to>=p_on_date) then 0 else 1 end,
    coalesce(c.label,d.duty_key),
    sm.last_name,
    sm.first_name,
    d.active_from desc;
end;
$$;

revoke all on function public.list_school_duty_assignments(uuid,date) from public,anon;
grant execute on function public.list_school_duty_assignments(uuid,date) to authenticated;

create or replace function public.list_school_duty_staff_candidates(
  p_school_id uuid,
  p_on_date date default current_date
)
returns table(
  staff_member_id uuid,
  staff_name text,
  employee_number text
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.user_can_manage_school_duties(auth.uid(),p_school_id) then
    raise exception 'Permission denied';
  end if;

  return query
  select
    sm.id,
    concat_ws(' ',sm.first_name,sm.last_name),
    sm.employee_number
  from public.staff_members sm
  where sm.status='active'
    and app_private.staff_member_has_school_assignment(sm.id,p_school_id,p_on_date)
  order by sm.last_name,sm.first_name,sm.id;
end;
$$;

revoke all on function public.list_school_duty_staff_candidates(uuid,date) from public,anon;
grant execute on function public.list_school_duty_staff_candidates(uuid,date) to authenticated;

comment on table public.school_duty_capabilities is
'Controlled catalogue of bounded school-duty capabilities. Domain-specific custodianship remains in its authoritative domain model rather than being duplicated here.';
