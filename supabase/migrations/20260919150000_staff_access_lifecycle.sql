-- Issue #564: connect an existing staff identity to the canonical invitation and
-- school-membership lifecycle. Staff placement and login roles remain separate.

alter table public.school_invitations
  add column if not exists staff_member_id uuid references public.staff_members(id) on delete restrict;

create index if not exists school_invitations_staff_status_idx
  on public.school_invitations (school_id, staff_member_id, status, expires_at desc);

create or replace function public.resend_staff_access_invitation(p_invitation_id uuid)
returns table(invitation_id uuid, invitation_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path=pg_catalog,public,extensions,app_private
as $$
declare
  v_old public.school_invitations%rowtype;
  v_token text;
  v_new_id uuid;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_old from public.school_invitations where id=p_invitation_id for update;
  if not found then raise exception 'Invitation not found'; end if;
  if not app_private.user_can_manage_current_school_membership(auth.uid(),v_old.school_id) then raise exception 'Permission denied'; end if;
  if v_old.status<>'pending' then raise exception 'Only pending invitations can be resent'; end if;
  if v_old.staff_member_id is null then raise exception 'This invitation is not bound to an existing staff identity'; end if;
  v_token:=encode(gen_random_bytes(24),'hex');
  v_expires_at:=now()+interval '7 days';
  update public.school_invitations set status='revoked' where id=v_old.id;
  insert into public.school_invitations(
    tenant_id,school_id,staff_member_id,email,first_name,last_name,employee_number,
    role_key,token_hash,invited_by_user_id,expires_at
  ) values(
    v_old.tenant_id,v_old.school_id,v_old.staff_member_id,v_old.email,v_old.first_name,
    v_old.last_name,v_old.employee_number,v_old.role_key,encode(digest(v_token,'sha256'),'hex'),
    auth.uid(),v_expires_at
  ) returning id into v_new_id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_old.tenant_id,v_old.school_id,auth.uid(),'school_invitation.resent','school_invitation',v_new_id,
    jsonb_build_object('previous_invitation_id',v_old.id,'staff_member_id',v_old.staff_member_id,'role_key',v_old.role_key));
  return query select v_new_id,v_token,v_expires_at;
end;
$$;

create or replace function public.create_staff_access_invitation(
  p_school_id uuid,
  p_staff_member_id uuid,
  p_email text,
  p_role_key text
)
returns table(invitation_id uuid, invitation_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path=pg_catalog,public,extensions,app_private
as $$
declare
  v_school public.schools%rowtype;
  v_staff public.staff_members%rowtype;
  v_token text;
  v_id uuid;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.user_can_manage_current_school_membership(auth.uid(),p_school_id) then
    raise exception 'Permission denied';
  end if;
  if p_role_key not in (
    'school_admin','principal','deputy_principal','hod','teacher','class_teacher',
    'counsellor','social_worker','librarian','board_member'
  ) then raise exception 'Unsupported school role'; end if;
  if btrim(coalesce(p_email,'')) = '' then raise exception 'Email is required'; end if;

  select * into v_school from public.schools where id=p_school_id and status='active';
  if not found then raise exception 'School not found or inactive'; end if;
  select * into v_staff from public.staff_members where id=p_staff_member_id;
  if not found or v_staff.tenant_id<>v_school.tenant_id then
    raise exception 'Staff member is outside the school tenant';
  end if;
  if v_staff.user_id is not null then
    raise exception 'Staff member already has a linked account; manage roles instead';
  end if;
  if not exists(
    select 1 from public.staff_school_assignments ssa
    where ssa.school_id=p_school_id and ssa.staff_member_id=p_staff_member_id
  ) then raise exception 'Staff member is not placed at this school'; end if;
  if exists(
    select 1 from public.school_invitations si
    where si.school_id=p_school_id and si.staff_member_id=p_staff_member_id
      and si.status='pending' and si.expires_at>now()
  ) then raise exception 'A pending invitation already exists for this staff member'; end if;

  v_token:=encode(gen_random_bytes(24),'hex');
  v_expires_at:=now()+interval '7 days';
  insert into public.school_invitations(
    tenant_id,school_id,staff_member_id,email,first_name,last_name,employee_number,
    role_key,token_hash,invited_by_user_id,expires_at
  ) values(
    v_school.tenant_id,p_school_id,p_staff_member_id,lower(btrim(p_email)),
    v_staff.first_name,v_staff.last_name,v_staff.employee_number,p_role_key,
    encode(digest(v_token,'sha256'),'hex'),auth.uid(),v_expires_at
  ) returning id into v_id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_school.tenant_id,p_school_id,auth.uid(),'school_invitation.created',
    'school_invitation',v_id,jsonb_build_object(
      'staff_member_id',p_staff_member_id,'email',lower(btrim(p_email)),'role_key',p_role_key));
  return query select v_id,v_token,v_expires_at;
end;
$$;

create or replace function public.accept_school_invitation(p_token text)
returns table(school_id uuid, role_key text)
language plpgsql
security definer
set search_path=public,extensions,app_private
as $$
declare
  v_invite public.school_invitations%rowtype;
  v_staff public.staff_members%rowtype;
  v_email text;
  v_staff_id uuid;
  v_assignment_type text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  v_email:=lower(coalesce(auth.jwt()->>'email',''));
  if v_email='' then raise exception 'Authenticated account has no email'; end if;
  select * into v_invite from public.school_invitations
  where token_hash=encode(digest(p_token,'sha256'),'hex') and status='pending' for update;
  if not found then raise exception 'Invitation is invalid or no longer available'; end if;
  if v_invite.expires_at<=now() then
    update public.school_invitations set status='expired' where id=v_invite.id;
    raise exception 'Invitation has expired';
  end if;
  if lower(btrim(v_invite.email))<>v_email then
    raise exception 'Invitation email does not match the signed-in account';
  end if;

  if v_invite.staff_member_id is not null then
    select * into v_staff from public.staff_members
    where id=v_invite.staff_member_id and tenant_id=v_invite.tenant_id for update;
    if not found then raise exception 'Invited staff identity no longer exists'; end if;
    if v_staff.user_id is not null and v_staff.user_id<>auth.uid() then
      raise exception 'Staff identity is already linked to another account';
    end if;
    update public.staff_members set user_id=auth.uid(),updated_at=now()
    where id=v_staff.id and user_id is null;
  else
    select * into v_staff from public.staff_members
    where tenant_id=v_invite.tenant_id and user_id=auth.uid()
    order by created_at asc limit 1;
    if not found and nullif(btrim(coalesce(v_invite.employee_number,'')),'') is not null then
      select * into v_staff from public.staff_members
      where tenant_id=v_invite.tenant_id
        and upper(btrim(employee_number))=upper(btrim(v_invite.employee_number))
      order by created_at asc limit 1 for update;
      if found then
        if v_staff.user_id is not null and v_staff.user_id<>auth.uid() then
          raise exception 'Employee number is already linked to another account';
        end if;
        update public.staff_members set user_id=auth.uid(),updated_at=now()
        where id=v_staff.id and user_id is null;
      end if;
    end if;
  end if;

  if v_staff.id is null then
    insert into public.staff_members(tenant_id,user_id,employee_number,first_name,last_name,status)
    values(v_invite.tenant_id,auth.uid(),nullif(upper(btrim(coalesce(v_invite.employee_number,''))),''),
      coalesce(v_invite.first_name,split_part(v_invite.email,'@',1)),coalesce(v_invite.last_name,''),'active')
    returning * into v_staff;
  end if;
  v_staff_id:=v_staff.id;
  insert into public.user_profiles(user_id,display_name)
  values(auth.uid(),nullif(btrim(concat_ws(' ',v_invite.first_name,v_invite.last_name)),''))
  on conflict(user_id) do update set display_name=coalesce(public.user_profiles.display_name,excluded.display_name),updated_at=now();

  insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
  values(v_invite.tenant_id,v_invite.school_id,auth.uid(),v_staff_id,v_invite.role_key,current_date)
  on conflict do nothing;

  v_assignment_type:=case
    when v_invite.role_key in ('teacher','class_teacher') then 'teacher'
    when v_invite.role_key in ('school_admin','principal','deputy_principal','hod') then 'management'
    when v_invite.role_key in ('counsellor','librarian') then 'support'
    else 'staff' end;
  if not exists(
    select 1 from public.staff_school_assignments
    where school_id=v_invite.school_id and staff_member_id=v_staff_id
      and effective_from<=current_date and (effective_to is null or effective_to>=current_date)
  ) then
    insert into public.staff_school_assignments(
      tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id
    ) values(v_invite.tenant_id,v_invite.school_id,v_staff_id,v_assignment_type,current_date,auth.uid());
  end if;
  update public.school_invitations
  set status='accepted',accepted_at=now(),accepted_user_id=auth.uid()
  where id=v_invite.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_invite.tenant_id,v_invite.school_id,auth.uid(),'school_invitation.accepted',
    'school_invitation',v_invite.id,jsonb_build_object(
      'role_key',v_invite.role_key,'staff_member_id',v_staff_id));
  return query select v_invite.school_id,v_invite.role_key;
end;
$$;

create or replace function public.add_staff_school_role(
  p_school_id uuid,
  p_staff_member_id uuid,
  p_role_key text,
  p_effective_from date default current_date
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare v_school public.schools%rowtype; v_staff public.staff_members%rowtype; v_id uuid;
begin
  if auth.uid() is null or not app_private.user_can_manage_current_school_membership(auth.uid(),p_school_id) then raise exception 'Permission denied'; end if;
  if p_role_key not in ('school_admin','principal','deputy_principal','hod','teacher','class_teacher','counsellor','social_worker','librarian','board_member') then raise exception 'Unsupported school role'; end if;
  if p_effective_from is null then raise exception 'Effective-from date is required'; end if;
  select * into v_school from public.schools where id=p_school_id and status='active';
  select * into v_staff from public.staff_members where id=p_staff_member_id and tenant_id=v_school.tenant_id;
  if not found or v_staff.user_id is null then raise exception 'Staff member must have a linked account'; end if;
  if not exists(select 1 from public.staff_school_assignments where school_id=p_school_id and staff_member_id=p_staff_member_id) then raise exception 'Staff member is not placed at this school'; end if;
  if exists(select 1 from public.school_memberships where school_id=p_school_id and staff_member_id=p_staff_member_id and role_key=p_role_key and active_from<=p_effective_from and (active_to is null or active_to>=p_effective_from)) then raise exception 'Staff member already has this active role'; end if;
  insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
  values(v_school.tenant_id,p_school_id,v_staff.user_id,p_staff_member_id,p_role_key,p_effective_from)
  returning id into v_id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_school.tenant_id,p_school_id,auth.uid(),'school_membership.role_added','school_membership',v_id,
    jsonb_build_object('staff_member_id',p_staff_member_id,'role_key',p_role_key,'effective_from',p_effective_from));
  return v_id;
end;
$$;

create or replace function public.end_staff_school_role(
  p_school_id uuid,
  p_membership_id uuid,
  p_effective_to date default current_date
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare v_membership public.school_memberships%rowtype;
begin
  if auth.uid() is null or not app_private.user_can_manage_current_school_membership(auth.uid(),p_school_id) then raise exception 'Permission denied'; end if;
  select * into v_membership from public.school_memberships where id=p_membership_id and school_id=p_school_id for update;
  if not found then raise exception 'School role not found'; end if;
  if p_effective_to is null or p_effective_to<v_membership.active_from then raise exception 'Role end date is invalid'; end if;
  if v_membership.active_to is not null and p_effective_to>v_membership.active_to then raise exception 'Cannot extend a closed school role'; end if;
  update public.school_memberships set active_to=p_effective_to where id=p_membership_id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_membership.tenant_id,p_school_id,auth.uid(),'school_membership.role_ended','school_membership',p_membership_id,
    jsonb_build_object('staff_member_id',v_membership.staff_member_id,'role_key',v_membership.role_key,'effective_to',p_effective_to));
  return true;
end;
$$;

revoke all on function public.create_staff_access_invitation(uuid,uuid,text,text) from public,anon;
revoke all on function public.accept_school_invitation(text) from public,anon;
revoke all on function public.add_staff_school_role(uuid,uuid,text,date) from public,anon;
revoke all on function public.end_staff_school_role(uuid,uuid,date) from public,anon;
grant execute on function public.create_staff_access_invitation(uuid,uuid,text,text) to authenticated;
revoke all on function public.resend_staff_access_invitation(uuid) from public,anon;
grant execute on function public.resend_staff_access_invitation(uuid) to authenticated;
grant execute on function public.accept_school_invitation(text) to authenticated;
grant execute on function public.add_staff_school_role(uuid,uuid,text,date) to authenticated;
grant execute on function public.end_staff_school_role(uuid,uuid,date) to authenticated;

create or replace function public.list_staff_access_directory_page(
  p_school_id uuid,
  p_query text default null,
  p_page integer default 1,
  p_page_size integer default 50
)
returns table(
  row_id uuid,
  staff_id uuid,
  staff_name text,
  employee_number text,
  staff_code text,
  default_room_name text,
  labels text[],
  active_from date,
  active_to date,
  has_account boolean,
  total_count bigint,
  linked_user_id uuid,
  pending_invitation_id uuid,
  pending_invitation_status text,
  active_roles jsonb
)
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  with base as (
    select * from public.list_staff_directory_page(p_school_id,p_query,p_page,p_page_size)
  )
  select
    base.row_id,base.staff_id,base.staff_name,base.employee_number,base.staff_code,
    base.default_room_name,base.labels,base.active_from,base.active_to,base.has_account,
    base.total_count,staff.user_id,
    pending.id,pending.status,
    coalesce(roles.items,'[]'::jsonb)
  from base
  left join public.staff_members staff on staff.id=base.staff_id
  left join lateral (
    select si.id,si.status
    from public.school_invitations si
    where si.school_id=p_school_id and si.staff_member_id=base.staff_id
      and si.status='pending' and si.expires_at>now()
    order by si.invited_at desc
    limit 1
  ) pending on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id',sm.id,'roleKey',sm.role_key,'activeFrom',sm.active_from,'activeTo',sm.active_to
    ) order by sm.role_key,sm.active_from) items
    from public.school_memberships sm
    where sm.school_id=p_school_id and sm.staff_member_id=base.staff_id
      and sm.active_from<=current_date and (sm.active_to is null or sm.active_to>=current_date)
  ) roles on true;
$$;

revoke all on function public.list_staff_access_directory_page(uuid,text,integer,integer) from public,anon;
grant execute on function public.list_staff_access_directory_page(uuid,text,integer,integer) to authenticated;