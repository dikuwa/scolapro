-- Issue #1191: an operational HOD designation is a staff placement role, NOT a login role.
-- school_memberships.user_id remains NOT NULL and only governs authenticated access.
create table public.staff_operational_hod_designations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  school_id uuid not null references public.schools(id),
  staff_member_id uuid not null references public.staff_members(id),
  staff_assignment_id uuid not null references public.staff_school_assignments(id),
  effective_from date not null,
  effective_to date,
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);
create index staff_operational_hod_current_idx on public.staff_operational_hod_designations(school_id,staff_member_id,effective_from desc);
create unique index staff_operational_hod_open_idx on public.staff_operational_hod_designations(staff_assignment_id) where effective_to is null;
alter table public.staff_operational_hod_designations enable row level security;
create policy "school staff view operational HOD designation" on public.staff_operational_hod_designations
  for select to authenticated using (app_private.has_school_access(school_id));
revoke insert,update,delete on public.staff_operational_hod_designations from anon,authenticated;
grant select on public.staff_operational_hod_designations to authenticated;

-- Authorization is evaluated at the database boundary, not the UI or source role labels.
create function public.designate_staff_operational_hod(p_school_id uuid,p_staff_member_id uuid,p_effective_from date)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare v_assignment public.staff_school_assignments%rowtype; v_id uuid; v_tenant uuid;
begin
  if auth.uid() is null or not app_private.user_current_school_matches(auth.uid(),p_school_id)
    or not app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal']) then
    raise exception 'School leadership authorization required' using errcode='42501'; end if;
  if p_effective_from is null then raise exception 'Effective date required' using errcode='22023'; end if;
  select tenant_id into v_tenant from public.schools where id=p_school_id and status='active';
  if v_tenant is null then raise exception 'Active school required' using errcode='22023'; end if;
  select a.* into v_assignment from public.staff_school_assignments a
    join public.staff_members s on s.id=a.staff_member_id and s.tenant_id=v_tenant and s.status='active'
   where a.staff_member_id=p_staff_member_id and a.school_id=p_school_id and a.tenant_id=v_tenant
    and a.effective_from<=p_effective_from and (a.effective_to is null or a.effective_to>=p_effective_from)
   order by a.effective_from desc limit 1;
  if v_assignment.id is null then raise exception 'Active staff placement required' using errcode='22023'; end if;
  -- Only one open designation for a placement; retain ended rows as history.
  perform 1 from public.staff_school_assignments where id=v_assignment.id for update;
  if exists(select 1 from public.staff_operational_hod_designations d
    where d.staff_assignment_id=v_assignment.id and d.effective_to is null) then
    raise exception 'Staff placement already has an open HOD designation' using errcode='23505'; end if;
  insert into public.staff_operational_hod_designations(tenant_id,school_id,staff_member_id,staff_assignment_id,effective_from,created_by_user_id)
    values(v_tenant,p_school_id,p_staff_member_id,v_assignment.id,p_effective_from,auth.uid()) returning id into v_id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
    values(v_tenant,p_school_id,auth.uid(),'staff.operational_hod_designated','staff_operational_hod_designation',v_id,
    jsonb_build_object('staff_member_id',p_staff_member_id,'staff_assignment_id',v_assignment.id,'effective_from',p_effective_from));
  return v_id;
end;$$;

create function public.end_staff_operational_hod(p_school_id uuid,p_designation_id uuid,p_effective_to date)
returns void language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare v_d public.staff_operational_hod_designations%rowtype; v_appointment record;
begin
  if auth.uid() is null or not app_private.user_current_school_matches(auth.uid(),p_school_id)
    or not app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal']) then
    raise exception 'School leadership authorization required' using errcode='42501'; end if;
  select * into v_d from public.staff_operational_hod_designations
    where id=p_designation_id and school_id=p_school_id for update;
  if v_d.id is null or v_d.effective_to is not null or p_effective_to is null
    or p_effective_to<v_d.effective_from then
    raise exception 'Open HOD designation and valid end date required' using errcode='22023'; end if;
  -- End only authority owned by portfolio appointments for this same staff placement.
  for v_appointment in
    select a.id,a.effective_from from public.hod_portfolio_appointments a
    where a.staff_assignment_id=v_d.staff_assignment_id and a.effective_to is null for update
  loop
    if v_appointment.effective_from>p_effective_to then
      raise exception 'Cannot end designation before a future portfolio appointment' using errcode='22023'; end if;
    update public.hod_portfolio_appointments set effective_to=p_effective_to where id=v_appointment.id;
    update public.subject_department_responsibilities set effective_to=p_effective_to
      where portfolio_appointment_id=v_appointment.id and effective_to is null;
  end loop;
  update public.staff_operational_hod_designations set effective_to=p_effective_to where id=v_d.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
    values(v_d.tenant_id,p_school_id,auth.uid(),'staff.operational_hod_ended','staff_operational_hod_designation',v_d.id,
      jsonb_build_object('effective_to',p_effective_to));
end;$$;

-- Provenance immutable: closure is the only allowed mutation.
create function app_private.guard_staff_operational_hod_history()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if new.id is distinct from old.id or new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id or new.staff_member_id is distinct from old.staff_member_id
    or new.staff_assignment_id is distinct from old.staff_assignment_id or new.effective_from is distinct from old.effective_from
    or new.created_by_user_id is distinct from old.created_by_user_id or new.created_at is distinct from old.created_at
    or old.effective_to is not null or new.effective_to is null or new.effective_to<old.effective_from then
    raise exception 'HOD designation provenance immutable; only end open designation' using errcode='23514'; end if;
 return new;
end;$$;
create trigger guard_staff_operational_hod_history before update on public.staff_operational_hod_designations
for each row execute function app_private.guard_staff_operational_hod_history();
revoke all on function app_private.guard_staff_operational_hod_history() from public,anon,authenticated;
revoke all on function public.designate_staff_operational_hod(uuid,uuid,date) from public,anon;
revoke all on function public.end_staff_operational_hod(uuid,uuid,date) from public,anon;
grant execute on function public.designate_staff_operational_hod(uuid,uuid,date) to authenticated;
grant execute on function public.end_staff_operational_hod(uuid,uuid,date) to authenticated;

-- An uninvited operational HOD may be selected as a staff appointee, but does NOT
-- receive a school_membership or the ability to authenticate as HOD.
create or replace function public.appoint_hod_portfolio(p_portfolio_id uuid,p_assignment_id uuid,p_effective_from date)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare v_port public.hod_subject_portfolios%rowtype; v_assignment public.staff_school_assignments%rowtype; v_id uuid; v_prev record;
begin
 select * into v_port from public.hod_subject_portfolios where id=p_portfolio_id for update;
 if v_port.id is null or auth.uid() is null or not app_private.user_current_school_matches(auth.uid(),v_port.school_id)
  or not app_private.has_school_role(v_port.school_id,array['school_admin','principal','deputy_principal']) then
  raise exception 'School leadership authorization required' using errcode='42501'; end if;
 if p_effective_from is null then raise exception 'Effective date required' using errcode='22023'; end if;
 select * into v_assignment from public.staff_school_assignments where id=p_assignment_id and school_id=v_port.school_id and tenant_id=v_port.tenant_id;
 if v_assignment.id is null or v_assignment.effective_from>p_effective_from or (v_assignment.effective_to is not null and v_assignment.effective_to<p_effective_from)
  or not exists(select 1 from public.staff_members s where s.id=v_assignment.staff_member_id and s.status='active')
  or not (
     exists(select 1 from public.school_memberships m where m.staff_member_id=v_assignment.staff_member_id
       and m.school_id=v_port.school_id and m.role_key='hod'
       and m.active_from<=p_effective_from and (m.active_to is null or m.active_to>=p_effective_from))
     or exists(select 1 from public.staff_operational_hod_designations d where d.staff_assignment_id=v_assignment.id
       and d.school_id=v_port.school_id and d.effective_from<=p_effective_from
       and (d.effective_to is null or d.effective_to>=p_effective_from))
  ) then
  raise exception 'Effective HOD placement required' using errcode='22023'; end if;
 -- End old portfolio-owned authority, but never rewrite prior history or unrelated allocations.
 for v_prev in select * from public.hod_portfolio_appointments where portfolio_id=v_port.id and effective_to is null for update loop
  if v_prev.effective_from>=p_effective_from then raise exception 'Appointment date must follow existing appointment' using errcode='22023'; end if;
  update public.hod_portfolio_appointments set effective_to=p_effective_from-1 where id=v_prev.id;
  update public.subject_department_responsibilities set effective_to=p_effective_from-1
   where portfolio_appointment_id=v_prev.id and effective_to is null;
 end loop;
 insert into public.hod_portfolio_appointments(portfolio_id,school_id,staff_assignment_id,effective_from,created_by_user_id)
 values(v_port.id,v_port.school_id,p_assignment_id,p_effective_from,auth.uid()) returning id into v_id;
 insert into public.subject_department_responsibilities(tenant_id,school_id,subject_id,department_head_staff_assignment_id,department_label,effective_from,created_by_user_id,portfolio_appointment_id)
 select v_port.tenant_id,v_port.school_id,sid,p_assignment_id,v_port.label,p_effective_from,auth.uid(),v_id from unnest(v_port.subject_ids) sid;
 return v_id;
end;$$;
