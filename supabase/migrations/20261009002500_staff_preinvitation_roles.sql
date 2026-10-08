-- #1202: pre-invitation staff role intentions, distinct from login authority.
-- A plan NEVER creates an Auth user or school_membership before verified join.
create table if not exists public.staff_planned_school_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  school_id uuid not null references public.schools(id),
  staff_member_id uuid not null references public.staff_members(id),
  role_key text not null check (role_key in ('school_admin','principal','deputy_principal','hod','teacher','class_teacher','counsellor','social_worker','librarian','board_member')),
  effective_from date not null,
  effective_to date,
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  linked_user_id uuid references auth.users(id),
  linked_at timestamptz,
  constraint staff_planned_dates_valid check (effective_to is null or effective_to >= effective_from)
);
create index if not exists staff_planned_roles_staff_idx
  on public.staff_planned_school_roles(school_id,staff_member_id,role_key,effective_from);
create unique index if not exists staff_planned_roles_open_unique
  on public.staff_planned_school_roles(school_id,staff_member_id,role_key) where effective_to is null;
alter table public.staff_planned_school_roles enable row level security;
-- Defense in depth: no direct table read/write, even if a future grant is added.
create policy staff_planned_school_roles_deny_direct on public.staff_planned_school_roles
  for all to authenticated using (false) with check (false);
revoke all on public.staff_planned_school_roles from anon,authenticated;

create or replace function public.plan_staff_school_role(
  p_school_id uuid, p_staff_member_id uuid, p_role_key text,
  p_effective_from date default current_date
) returns uuid language plpgsql security definer
set search_path=pg_catalog,public,app_private as $$
declare
  v_staff public.staff_members%rowtype;
  v_school public.schools%rowtype;
  v_id uuid;
begin
  if auth.uid() is null or not public.has_school_role(p_school_id,array['school_admin']) then
    raise exception 'School administrator permission required';
  end if;
  if p_effective_from is null or p_role_key not in
    ('school_admin','principal','deputy_principal','hod','teacher','class_teacher','counsellor','social_worker','librarian','board_member')
  then raise exception 'Invalid planned school role'; end if;
  select * into v_school from public.schools where id=p_school_id and status='active';
  if not found then raise exception 'School unavailable'; end if;
  select * into v_staff from public.staff_members where id=p_staff_member_id and tenant_id=v_school.tenant_id for update;
  if not found then raise exception 'Staff outside school tenant'; end if;
  if not exists (
    select 1 from public.staff_school_assignments
    where school_id=p_school_id and staff_member_id=p_staff_member_id
      and effective_from<=p_effective_from and (effective_to is null or effective_to>=p_effective_from)
  ) then raise exception 'No effective school placement'; end if;
  if v_staff.user_id=auth.uid() then raise exception 'Self-assignment is not permitted'; end if;
  if v_staff.user_id is not null then
    raise exception 'Linked account exists; use active membership role management';
  end if;
  if exists (
    select 1 from public.staff_planned_school_roles
    where school_id=p_school_id and staff_member_id=p_staff_member_id and role_key=p_role_key
      and daterange(effective_from,coalesce(effective_to,'infinity'::date),'[]')
          && daterange(p_effective_from,'infinity'::date,'[]')
  ) then raise exception 'Planned role interval overlaps an existing assignment'; end if;
  insert into public.staff_planned_school_roles
    (tenant_id,school_id,staff_member_id,role_key,effective_from,created_by_user_id)
  values (v_school.tenant_id,p_school_id,p_staff_member_id,p_role_key,p_effective_from,auth.uid())
  returning id into v_id;
  insert into public.audit_events
    (tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values (v_school.tenant_id,p_school_id,auth.uid(),'staff.role_planned',
    'staff_planned_school_role',v_id,jsonb_build_object('role_key',p_role_key,'staff_member_id',p_staff_member_id));
  return v_id;
end;$$;

create or replace function public.end_planned_staff_school_role(
  p_school_id uuid, p_planned_role_id uuid, p_effective_to date default current_date
) returns boolean language plpgsql security definer
set search_path=pg_catalog,public,app_private as $$
declare v_role public.staff_planned_school_roles%rowtype;
begin
  if auth.uid() is null or not public.has_school_role(p_school_id,array['school_admin']) then
    raise exception 'School administrator permission required'; end if;
  select * into v_role from public.staff_planned_school_roles
    where id=p_planned_role_id and school_id=p_school_id for update;
  if not found then raise exception 'Planned role not found'; end if;
  if v_role.linked_at is not null then raise exception 'Already activated; manage account role instead'; end if;
  if p_effective_to is null or p_effective_to<v_role.effective_from then
    raise exception 'End date predates effective start'; end if;
  if v_role.effective_to is not null and p_effective_to>v_role.effective_to then
    raise exception 'Cannot extend ended role'; end if;
  update public.staff_planned_school_roles set effective_to=p_effective_to where id=v_role.id;
  insert into public.audit_events
    (tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values (v_role.tenant_id,p_school_id,auth.uid(),'staff.planned_role_ended',
    'staff_planned_school_role',v_role.id,jsonb_build_object('effective_to',p_effective_to));
  return true;
end;$$;

-- The existing accept_school_invitation routine validates the token, authenticated
-- email, identity collision, school and staff link before accepting the invitation.
-- This trigger runs in the SAME TRANSACTION at the final accepted transition.
create or replace function app_private.activate_planned_roles_on_staff_invitation()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,app_private as $$
declare v_plan public.staff_planned_school_roles%rowtype;
begin
  if new.status <> 'accepted' or old.status = 'accepted'
    or new.staff_member_id is null or new.accepted_user_id is null then
    return new;
  end if;
  if not exists (
    select 1 from public.staff_members
      where id=new.staff_member_id and tenant_id=new.tenant_id and user_id=new.accepted_user_id
  ) then raise exception 'Accepted staff identity mismatch'; end if;
  for v_plan in
    select * from public.staff_planned_school_roles
    where school_id=new.school_id and tenant_id=new.tenant_id
      and staff_member_id=new.staff_member_id and linked_at is null
      and (effective_to is null or effective_to>=current_date)
    order by effective_from,id for update
  loop
    if not exists (
      select 1 from public.school_memberships
      where school_id=new.school_id and staff_member_id=new.staff_member_id
        and user_id=new.accepted_user_id and role_key=v_plan.role_key
        and active_from<=greatest(current_date,v_plan.effective_from) and (active_to is null or active_to>=greatest(current_date,v_plan.effective_from))
    ) then
      insert into public.school_memberships
        (tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
      values (new.tenant_id,new.school_id,new.accepted_user_id,new.staff_member_id,v_plan.role_key,greatest(current_date,v_plan.effective_from));
    end if;
    update public.staff_planned_school_roles
      set linked_user_id=new.accepted_user_id, linked_at=now() where id=v_plan.id;
  end loop;
  return new;
end;$$;
drop trigger if exists staff_invitation_activate_planned_roles on public.school_invitations;
create trigger staff_invitation_activate_planned_roles
after update of status on public.school_invitations
for each row execute function app_private.activate_planned_roles_on_staff_invitation();

revoke all on function public.plan_staff_school_role(uuid,uuid,text,date) from public,anon;
grant execute on function public.plan_staff_school_role(uuid,uuid,text,date) to authenticated;
revoke all on function public.end_planned_staff_school_role(uuid,uuid,date) from public,anon;
grant execute on function public.end_planned_staff_school_role(uuid,uuid,date) to authenticated;
revoke all on function app_private.activate_planned_roles_on_staff_invitation() from public,anon,authenticated;

-- Guarded list read for Staff Directory; raw table remains inaccessible.
create or replace function public.list_staff_planned_roles(
 p_school_id uuid, p_staff_ids uuid[]
) returns table(id uuid, staff_member_id uuid, role_key text, effective_from date, effective_to date)
language plpgsql stable security definer
set search_path=pg_catalog,public,app_private as $$
begin
 if auth.uid() is null or not public.has_school_role(p_school_id,array['school_admin']) then
   raise exception 'School administrator permission required';
 end if;
 return query
 select r.id,r.staff_member_id,r.role_key,r.effective_from,r.effective_to
 from public.staff_planned_school_roles r
 where r.school_id=p_school_id and r.staff_member_id=any(p_staff_ids)
 order by r.staff_member_id,r.role_key,r.effective_from;
end;$$;
revoke all on function public.list_staff_planned_roles(uuid,uuid[]) from public,anon;
grant execute on function public.list_staff_planned_roles(uuid,uuid[]) to authenticated;
