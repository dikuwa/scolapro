-- School membership and staff-placement mutations are school-local authority surfaces.
-- Preserve Platform Admin governed cross-school authority while preventing an older active
-- non-current membership, or a stale membership after authoritative placement ends, from
-- authorizing staffing/member-management writes.

create or replace function app_private.user_can_manage_current_school_membership(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select exists(
      select 1
      from public.platform_memberships pm
      where pm.user_id=p_user_id
        and pm.role_key='platform_admin'
        and pm.active_from<=current_date
        and (pm.active_to is null or pm.active_to>=current_date)
    )
    or (
      app_private.user_targets_current_school(p_user_id,p_school_id)
      and exists(
        select 1
        from public.school_memberships sm
        where sm.school_id=p_school_id
          and sm.user_id=p_user_id
          and sm.role_key='school_admin'
          and sm.active_from<=current_date
          and (sm.active_to is null or sm.active_to>=current_date)
          and (
            sm.staff_member_id is null
            or app_private.staff_member_covers_school_period(
              sm.staff_member_id,p_school_id,current_date,current_date
            )
          )
      )
    );
$$;
revoke all on function app_private.user_can_manage_current_school_membership(uuid,uuid)
from public,anon,authenticated;

create or replace function app_private.user_can_manage_staff_school_assignment(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select exists(
      select 1
      from public.platform_memberships pm
      where pm.user_id=p_user_id
        and pm.role_key='platform_admin'
        and pm.active_from<=current_date
        and (pm.active_to is null or pm.active_to>=current_date)
    )
    or (
      app_private.user_targets_current_school(p_user_id,p_school_id)
      and exists(
        select 1
        from public.school_memberships sm
        where sm.school_id=p_school_id
          and sm.user_id=p_user_id
          and sm.role_key in ('school_admin','principal','deputy_principal')
          and sm.active_from<=current_date
          and (sm.active_to is null or sm.active_to>=current_date)
          and (
            sm.staff_member_id is null
            or app_private.staff_member_covers_school_period(
              sm.staff_member_id,p_school_id,current_date,current_date
            )
          )
      )
    );
$$;
revoke all on function app_private.user_can_manage_staff_school_assignment(uuid,uuid)
from public,anon,authenticated;

-- Keep the generic school-member helper unchanged. Other domains (including #427 timetable
-- mutation semantics) deliberately compose it with their own current-school invariants.
-- Invitation creation uses the dedicated helper below instead of widening this generic helper.
create or replace function app_private.user_can_manage_school_invitation(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select app_private.user_can_manage_current_school_membership(p_user_id,p_school_id);
$$;
revoke all on function app_private.user_can_manage_school_invitation(uuid,uuid)
from public,anon,authenticated;

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
set search_path=pg_catalog,public,app_private
as $$
declare
  v_school public.schools%rowtype;
  v_staff public.staff_members%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.user_can_manage_staff_school_assignment(auth.uid(),p_school_id) then
    raise exception 'Permission denied';
  end if;
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
revoke all on function public.assign_staff_to_school(uuid,uuid,text,text,date,date) from public,anon;
grant execute on function public.assign_staff_to_school(uuid,uuid,text,text,date,date) to authenticated;

create or replace function public.end_staff_school_assignment(
  p_assignment_id uuid,
  p_effective_to date default current_date
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_assignment public.staff_school_assignments%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_assignment from public.staff_school_assignments where id=p_assignment_id for update;
  if not found then raise exception 'Staff assignment not found'; end if;
  if not app_private.user_can_manage_staff_school_assignment(auth.uid(),v_assignment.school_id) then
    raise exception 'Permission denied';
  end if;
  if p_effective_to is null or p_effective_to<v_assignment.effective_from then
    raise exception 'Effective-to date cannot precede effective-from date';
  end if;
  if v_assignment.effective_to is not null and p_effective_to>v_assignment.effective_to then
    raise exception 'Cannot extend a closed assignment through the end-assignment workflow';
  end if;

  update public.staff_school_assignments
  set effective_to=p_effective_to,updated_at=now()
  where id=v_assignment.id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_assignment.tenant_id,v_assignment.school_id,auth.uid(),'staff.school_assignment.ended','staff_school_assignment',v_assignment.id,
    jsonb_build_object('staff_member_id',v_assignment.staff_member_id,'effective_to',p_effective_to));
  return true;
end;
$$;
revoke all on function public.end_staff_school_assignment(uuid,date) from public,anon;
grant execute on function public.end_staff_school_assignment(uuid,date) to authenticated;

create or replace function public.create_school_invitation(
  p_school_id uuid,
  p_email text,
  p_first_name text default null,
  p_last_name text default null,
  p_employee_number text default null,
  p_role_key text default 'school_admin'
)
returns table(invitation_id uuid, invitation_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path=pg_catalog,public,extensions,app_private
as $$
declare
  v_school public.schools%rowtype;
  v_token text;
  v_invitation_id uuid;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_school
  from public.schools
  where id=p_school_id and status='active';
  if not found then raise exception 'School not found or inactive'; end if;

  if not app_private.user_can_manage_current_school_membership(auth.uid(),p_school_id) then
    raise exception 'Permission denied';
  end if;

  if p_role_key not in (
    'school_admin','principal','deputy_principal','hod','teacher','class_teacher',
    'counsellor','social_worker','librarian','board_member'
  ) then raise exception 'Unsupported school role'; end if;
  if btrim(coalesce(p_email,''))='' then raise exception 'Email is required'; end if;

  update public.school_invitations si
  set status='expired'
  where si.school_id=p_school_id
    and lower(btrim(si.email))=lower(btrim(p_email))
    and si.role_key=p_role_key
    and si.status='pending'
    and si.expires_at<=now();

  if exists(
    select 1 from public.school_invitations si
    where si.school_id=p_school_id
      and lower(btrim(si.email))=lower(btrim(p_email))
      and si.role_key=p_role_key
      and si.status='pending'
      and si.expires_at>now()
  ) then raise exception 'A pending invitation already exists for this email and role'; end if;

  v_token:=encode(gen_random_bytes(24),'hex');
  v_expires_at:=now()+interval '7 days';

  insert into public.school_invitations(
    tenant_id,school_id,email,first_name,last_name,employee_number,
    role_key,token_hash,invited_by_user_id,expires_at
  ) values(
    v_school.tenant_id,p_school_id,lower(btrim(p_email)),
    nullif(btrim(coalesce(p_first_name,'')),''),
    nullif(btrim(coalesce(p_last_name,'')),''),
    nullif(btrim(coalesce(p_employee_number,'')),''),
    p_role_key,encode(digest(v_token,'sha256'),'hex'),auth.uid(),v_expires_at
  ) returning id into v_invitation_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_school.tenant_id,p_school_id,auth.uid(),'school_invitation.created',
    'school_invitation',v_invitation_id,
    jsonb_build_object('email',lower(btrim(p_email)),'role_key',p_role_key)
  );

  return query select v_invitation_id,v_token,v_expires_at;
end;
$$;
revoke all on function public.create_school_invitation(uuid,text,text,text,text,text) from public,anon;
grant execute on function public.create_school_invitation(uuid,text,text,text,text,text) to authenticated;

comment on function app_private.user_can_manage_current_school_membership(uuid,uuid) is
'Current-school school-admin membership authority with authoritative linked staff placement precedence. Platform Admin retains governed cross-school authority.';
comment on function app_private.user_can_manage_staff_school_assignment(uuid,uuid) is
'Current-school staffing mutation authority. Linked manager placement must be currently effective when authoritative placement history exists; legacy membership fallback remains only without assignment history. Platform Admin remains governed cross-school authority.';
comment on function public.end_staff_school_assignment(uuid,date) is
'Audited current-school workflow for ending an effective-dated staff placement without deleting history.';
comment on function public.create_school_invitation(uuid,text,text,text,text,text) is
'Creates school membership invitations through deterministic current-school authority; Platform Admin remains subject to platform onboarding governance.';
