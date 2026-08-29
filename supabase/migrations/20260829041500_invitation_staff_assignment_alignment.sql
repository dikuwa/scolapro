-- Invitation acceptance must not duplicate a staff identity that was imported before
-- the person received a login account. Employee number is the deterministic bridge.

create or replace function public.accept_school_invitation(p_token text)
returns table(school_id uuid, role_key text)
language plpgsql
security definer
set search_path = public, extensions, app_private
as $$
declare
  v_invite public.school_invitations%rowtype;
  v_user_email text;
  v_staff public.staff_members%rowtype;
  v_staff_id uuid;
  v_assignment_type text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  v_user_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_user_email = '' then raise exception 'Authenticated account has no email'; end if;

  select * into v_invite
  from public.school_invitations
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and status = 'pending'
  for update;
  if not found then raise exception 'Invitation is invalid or no longer available'; end if;
  if v_invite.expires_at <= now() then
    update public.school_invitations set status='expired' where id=v_invite.id;
    raise exception 'Invitation has expired';
  end if;
  if lower(btrim(v_invite.email)) <> v_user_email then
    raise exception 'Invitation email does not match the signed-in account';
  end if;

  -- Prefer an identity already linked to this Auth account.
  select * into v_staff
  from public.staff_members
  where tenant_id=v_invite.tenant_id and user_id=auth.uid()
  order by created_at asc
  limit 1;

  -- Otherwise bridge an imported/pre-created identity only by exact employee number.
  if not found and nullif(btrim(coalesce(v_invite.employee_number,'')),'') is not null then
    select * into v_staff
    from public.staff_members
    where tenant_id=v_invite.tenant_id
      and upper(btrim(employee_number))=upper(btrim(v_invite.employee_number))
    order by created_at asc
    limit 1
    for update;

    if found then
      if v_staff.user_id is not null and v_staff.user_id<>auth.uid() then
        raise exception 'Employee number is already linked to another account';
      end if;
      if v_invite.first_name is not null and lower(btrim(v_staff.first_name))<>lower(btrim(v_invite.first_name)) then
        raise exception 'Invitation employee number conflicts with the existing staff first name';
      end if;
      if v_invite.last_name is not null and lower(btrim(v_staff.last_name))<>lower(btrim(v_invite.last_name)) then
        raise exception 'Invitation employee number conflicts with the existing staff surname';
      end if;
      update public.staff_members
      set user_id=auth.uid(),updated_at=now()
      where id=v_staff.id and user_id is null;
    end if;
  end if;

  if v_staff.id is null then
    insert into public.staff_members(tenant_id,user_id,employee_number,first_name,last_name,status)
    values(
      v_invite.tenant_id,
      auth.uid(),
      nullif(upper(btrim(coalesce(v_invite.employee_number,''))),''),
      coalesce(v_invite.first_name,split_part(v_invite.email,'@',1)),
      coalesce(v_invite.last_name,''),
      'active'
    )
    returning * into v_staff;
  end if;
  v_staff_id:=v_staff.id;

  insert into public.user_profiles(user_id,display_name)
  values(auth.uid(),nullif(btrim(concat_ws(' ',v_invite.first_name,v_invite.last_name)),''))
  on conflict(user_id) do update
  set display_name=coalesce(public.user_profiles.display_name,excluded.display_name),updated_at=now();

  insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
  values(v_invite.tenant_id,v_invite.school_id,auth.uid(),v_staff_id,v_invite.role_key,current_date)
  on conflict do nothing;

  -- A login role and an employment placement are different concepts. Ensure the
  -- staff identity has a school placement without overwriting an existing one.
  v_assignment_type:=case
    when v_invite.role_key in ('teacher','class_teacher') then 'teacher'
    when v_invite.role_key in ('school_admin','principal','deputy_principal','hod') then 'management'
    when v_invite.role_key in ('counsellor','librarian') then 'support'
    else 'staff'
  end;

  if not exists(
    select 1 from public.staff_school_assignments ssa
    where ssa.school_id=v_invite.school_id
      and ssa.staff_member_id=v_staff_id
      and ssa.effective_from<=current_date
      and (ssa.effective_to is null or ssa.effective_to>=current_date)
  ) then
    insert into public.staff_school_assignments(
      tenant_id,school_id,staff_member_id,assignment_type,position_title,effective_from,created_by_user_id
    ) values(
      v_invite.tenant_id,v_invite.school_id,v_staff_id,v_assignment_type,null,current_date,auth.uid()
    );
  end if;

  update public.school_invitations
  set status='accepted',accepted_at=now(),accepted_user_id=auth.uid()
  where id=v_invite.id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_invite.tenant_id,v_invite.school_id,auth.uid(),'school_invitation.accepted','school_invitation',v_invite.id,
    jsonb_build_object('role_key',v_invite.role_key,'staff_member_id',v_staff_id));

  return query select v_invite.school_id,v_invite.role_key;
end;
$$;

revoke all on function public.accept_school_invitation(text) from public,anon;
grant execute on function public.accept_school_invitation(text) to authenticated;

comment on function public.accept_school_invitation(text) is
'Accepts a school role invitation and deterministically reuses an existing tenant staff identity by employee number before creating a new one; also ensures an effective school placement.';
