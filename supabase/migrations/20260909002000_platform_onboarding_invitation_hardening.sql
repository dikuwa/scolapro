-- Accepted school invitations are consumed identity grants. Their target identity,
-- role and consumer are immutable, and replay by the same identity is idempotent.
-- Preserve the established platform-support metadata boundary and the current
-- invitation-to-staff-placement semantics.

create or replace function app_private.enforce_consumed_school_invitation_finality()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old.status = 'accepted' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.email is distinct from old.email
    or new.role_key is distinct from old.role_key
    or new.accepted_user_id is distinct from old.accepted_user_id
    or new.status is distinct from old.status
  ) then
    raise exception 'Accepted school invitation identity and role are immutable';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_consumed_school_invitation_finality()
  from public, anon, authenticated;

drop trigger if exists consumed_school_invitation_finality_trg
  on public.school_invitations;
create trigger consumed_school_invitation_finality_trg
before update of tenant_id, school_id, email, role_key, accepted_user_id, status
on public.school_invitations
for each row execute function app_private.enforce_consumed_school_invitation_finality();

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
  for update;

  if not found then raise exception 'Invitation is invalid or no longer available'; end if;

  if lower(btrim(v_invite.email)) <> v_user_email then
    raise exception 'Invitation email does not match the signed-in account';
  end if;

  if v_invite.status = 'accepted' then
    if v_invite.accepted_user_id is distinct from auth.uid() then
      raise exception 'Invitation is invalid or no longer available';
    end if;
    return query select v_invite.school_id, v_invite.role_key;
    return;
  end if;

  if v_invite.status = 'revoked' then
    raise exception 'Invitation is invalid or no longer available';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'Invitation is invalid or no longer available';
  end if;

  if v_invite.expires_at <= now() then
    update public.school_invitations set status='expired' where id=v_invite.id;
    raise exception 'Invitation has expired';
  end if;

  select * into v_staff
  from public.staff_members
  where tenant_id=v_invite.tenant_id and user_id=auth.uid()
  order by created_at asc
  limit 1;

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

  v_assignment_type:=case
    when v_invite.role_key in ('teacher','class_teacher') then 'teacher'
    when v_invite.role_key in ('school_admin','principal','deputy_principal','hod') then 'management'
    when v_invite.role_key in ('counsellor','social_worker','librarian') then 'support'
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
'Accepts a school role invitation using canonical tenant staff identity/placement rules. Replaying a consumed token by the same authenticated identity is idempotent; another identity cannot replay it.';
