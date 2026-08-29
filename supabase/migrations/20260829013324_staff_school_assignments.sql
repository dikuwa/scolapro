-- Staff identity is tenant-wide; school employment/placement is a separate,
-- effective-dated relationship and must not depend on the staff member having an
-- Auth account. This enables imported staff to exist operationally before invite.

create table public.staff_school_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  staff_member_id uuid not null references public.staff_members(id) on delete restrict,
  assignment_type text not null default 'staff' check (assignment_type in ('staff','teacher','management','support','temporary','other')),
  position_title text,
  effective_from date not null default current_date,
  effective_to date,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(school_id,staff_member_id,effective_from),
  check(effective_to is null or effective_to>=effective_from)
);

create index staff_school_assignments_school_active_idx
  on public.staff_school_assignments(school_id,effective_from,effective_to,staff_member_id);
create index staff_school_assignments_staff_idx
  on public.staff_school_assignments(staff_member_id,effective_from desc);

alter table public.staff_school_assignments enable row level security;

create policy "school members read staff assignments"
on public.staff_school_assignments for select to authenticated
using (
  app_private.has_school_access(school_id)
  or app_private.has_platform_role(array['platform_admin'])
);

create policy "school leaders insert staff assignments"
on public.staff_school_assignments for insert to authenticated
with check (
  app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal'])
  or app_private.has_platform_role(array['platform_admin'])
);

create policy "school leaders update staff assignments"
on public.staff_school_assignments for update to authenticated
using (
  app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal'])
  or app_private.has_platform_role(array['platform_admin'])
)
with check (
  app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal'])
  or app_private.has_platform_role(array['platform_admin'])
);

create policy "school leaders delete staff assignments"
on public.staff_school_assignments for delete to authenticated
using (
  app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal'])
  or app_private.has_platform_role(array['platform_admin'])
);

create or replace function app_private.enforce_staff_school_assignment_scope()
returns trigger
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_school_tenant uuid;
  v_staff_tenant uuid;
begin
  select tenant_id into v_school_tenant from public.schools where id=new.school_id;
  select tenant_id into v_staff_tenant from public.staff_members where id=new.staff_member_id;
  if v_school_tenant is null or v_staff_tenant is null then raise exception 'School or staff member not found'; end if;
  if new.tenant_id<>v_school_tenant or new.tenant_id<>v_staff_tenant then
    raise exception 'Staff assignment tenant must match both school and staff member';
  end if;
  return new;
end;
$$;

drop trigger if exists staff_school_assignment_scope_trg on public.staff_school_assignments;
create trigger staff_school_assignment_scope_trg
before insert or update on public.staff_school_assignments
for each row execute function app_private.enforce_staff_school_assignment_scope();
revoke all on function app_private.enforce_staff_school_assignment_scope() from public,anon,authenticated;

create or replace function public.assign_staff_to_school(
  p_school_id uuid,
  p_staff_member_id uuid,
  p_assignment_type text default 'staff',
  p_position_title text default null,
  p_effective_from date default current_date,
  p_effective_to date default null
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_school public.schools%rowtype;
  v_staff public.staff_members%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (
    app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])
    or app_private.has_platform_role(array['platform_admin'])
  ) then raise exception 'Permission denied'; end if;
  if p_assignment_type not in ('staff','teacher','management','support','temporary','other') then raise exception 'Invalid assignment type'; end if;
  if p_effective_from is null then raise exception 'Effective-from date is required'; end if;
  if p_effective_to is not null and p_effective_to<p_effective_from then raise exception 'Effective-to date cannot precede effective-from date'; end if;

  select * into v_school from public.schools where id=p_school_id;
  if not found then raise exception 'School not found'; end if;
  select * into v_staff from public.staff_members where id=p_staff_member_id;
  if not found or v_staff.tenant_id<>v_school.tenant_id then raise exception 'Staff member not found in school tenant'; end if;

  insert into public.staff_school_assignments(
    tenant_id,school_id,staff_member_id,assignment_type,position_title,effective_from,effective_to,created_by_user_id
  ) values(
    v_school.tenant_id,v_school.id,v_staff.id,p_assignment_type,nullif(btrim(coalesce(p_position_title,'')),''),p_effective_from,p_effective_to,auth.uid()
  )
  on conflict(school_id,staff_member_id,effective_from) do update set
    assignment_type=excluded.assignment_type,
    position_title=excluded.position_title,
    effective_to=excluded.effective_to,
    updated_at=now()
  returning id into v_id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_school.tenant_id,v_school.id,auth.uid(),'staff.school_assignment.saved','staff_school_assignment',v_id,
    jsonb_build_object('staff_member_id',v_staff.id,'assignment_type',p_assignment_type,'effective_from',p_effective_from,'effective_to',p_effective_to));
  return v_id;
end;
$$;

revoke all on public.staff_school_assignments from anon;
grant select,insert,update,delete on public.staff_school_assignments to authenticated;
revoke all on function public.assign_staff_to_school(uuid,uuid,text,text,date,date) from public,anon;
grant execute on function public.assign_staff_to_school(uuid,uuid,text,text,date,date) to authenticated;

comment on table public.staff_school_assignments is
'Effective-dated school placement for a tenant-wide staff identity, independent of Auth account membership.';
