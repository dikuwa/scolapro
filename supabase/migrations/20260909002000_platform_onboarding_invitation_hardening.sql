-- Platform support is not an implicit school operator. Generic school/tenant access
-- remains membership based, with platform administrators retaining explicit platform scope.
create or replace function app_private.has_school_access(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or exists (
      select 1
      from public.school_memberships sm
      where sm.school_id = target_school_id
        and sm.user_id = auth.uid()
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
    );
$$;

create or replace function app_private.has_tenant_access(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or exists (
      select 1
      from public.school_memberships sm
      where sm.tenant_id = target_tenant_id
        and sm.user_id = auth.uid()
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
    );
$$;

alter table public.school_invitations
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists revoke_reason text;

create or replace function public.revoke_school_invitation(
  p_invitation_id uuid,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_invite public.school_invitations%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_invite
  from public.school_invitations
  where id = p_invitation_id
  for update;

  if not found then
    raise exception 'Invitation not found';
  end if;

  if not app_private.can_manage_school_members(v_invite.school_id) then
    raise exception 'Permission denied';
  end if;

  if v_invite.status = 'revoked' then
    return true;
  end if;

  if v_invite.status = 'accepted' then
    raise exception 'Accepted invitation cannot be revoked';
  end if;

  if v_invite.status = 'expired' or v_invite.expires_at <= now() then
    update public.school_invitations
    set status = 'expired'
    where id = v_invite.id and status = 'pending';
    raise exception 'Expired invitation cannot be revoked';
  end if;

  update public.school_invitations
  set status = 'revoked',
      revoked_at = now(),
      revoked_by_user_id = auth.uid(),
      revoke_reason = v_reason
  where id = v_invite.id;

  insert into public.audit_events (
    tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
  ) values (
    v_invite.tenant_id,
    v_invite.school_id,
    auth.uid(),
    'school_invitation.revoked',
    'school_invitation',
    v_invite.id,
    jsonb_build_object('role_key', v_invite.role_key, 'reason', v_reason)
  );

  return true;
end;
$$;

revoke all on function public.revoke_school_invitation(uuid,text) from public, anon;
grant execute on function public.revoke_school_invitation(uuid,text) to authenticated;

create or replace function public.accept_school_invitation(p_token text)
returns table(school_id uuid, role_key text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_invite public.school_invitations%rowtype;
  v_user_email text;
  v_staff_id uuid;
  v_staff_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  v_user_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_user_email = '' then
    raise exception 'Authenticated account has no email';
  end if;

  select * into v_invite
  from public.school_invitations
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
  for update;

  if not found then
    raise exception 'Invitation is invalid or no longer available';
  end if;

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
    raise exception 'Invitation has been revoked';
  end if;

  if v_invite.status = 'expired' or v_invite.expires_at <= now() then
    update public.school_invitations set status = 'expired'
    where id = v_invite.id and status = 'pending';
    raise exception 'Invitation has expired';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'Invitation is invalid or no longer available';
  end if;

  select id into v_staff_id
  from public.staff_members
  where tenant_id = v_invite.tenant_id
    and user_id = auth.uid()
  order by created_at asc
  limit 1;

  if v_staff_id is null and v_invite.employee_number is not null then
    select id, user_id into v_staff_id, v_staff_user_id
    from public.staff_members
    where tenant_id = v_invite.tenant_id
      and employee_number = v_invite.employee_number
    for update;

    if v_staff_id is not null and v_staff_user_id is not null and v_staff_user_id <> auth.uid() then
      raise exception 'Invitation staff identity is already linked to another account';
    end if;

    if v_staff_id is not null then
      update public.staff_members
      set user_id = auth.uid(), updated_at = now()
      where id = v_staff_id and user_id is null;
    end if;
  end if;

  if v_staff_id is null then
    insert into public.staff_members (
      tenant_id, user_id, employee_number, first_name, last_name, status
    ) values (
      v_invite.tenant_id,
      auth.uid(),
      v_invite.employee_number,
      coalesce(v_invite.first_name, split_part(v_invite.email, '@', 1)),
      coalesce(v_invite.last_name, ''),
      'active'
    )
    returning id into v_staff_id;
  end if;

  insert into public.user_profiles (user_id, display_name)
  values (
    auth.uid(),
    nullif(btrim(concat_ws(' ', v_invite.first_name, v_invite.last_name)), '')
  )
  on conflict (user_id) do update
  set display_name = coalesce(public.user_profiles.display_name, excluded.display_name),
      updated_at = now();

  insert into public.school_memberships (
    tenant_id, school_id, user_id, staff_member_id, role_key, active_from
  ) values (
    v_invite.tenant_id,
    v_invite.school_id,
    auth.uid(),
    v_staff_id,
    v_invite.role_key,
    current_date
  )
  on conflict do nothing;

  update public.school_invitations
  set status = 'accepted', accepted_at = now(), accepted_user_id = auth.uid()
  where id = v_invite.id;

  insert into public.audit_events (
    tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
  ) values (
    v_invite.tenant_id,
    v_invite.school_id,
    auth.uid(),
    'school_invitation.accepted',
    'school_invitation',
    v_invite.id,
    jsonb_build_object('role_key', v_invite.role_key, 'staff_member_id', v_staff_id)
  );

  return query select v_invite.school_id, v_invite.role_key;
end;
$$;

revoke all on function public.accept_school_invitation(text) from public, anon;
grant execute on function public.accept_school_invitation(text) to authenticated;

comment on function public.revoke_school_invitation(uuid,text) is
  'Governed, audited, school-scoped invitation revocation. Terminal invitation states are not rewritten.';
