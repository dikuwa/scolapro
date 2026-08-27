create or replace function public.revoke_school_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.school_invitations%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_invite
  from public.school_invitations
  where id = p_invitation_id
  for update;

  if not found then raise exception 'Invitation not found'; end if;
  if not app_private.can_manage_school_members(v_invite.school_id) then raise exception 'Permission denied'; end if;
  if v_invite.status <> 'pending' then raise exception 'Only pending invitations can be revoked'; end if;

  update public.school_invitations
  set status = 'revoked'
  where id = p_invitation_id;

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_invite.tenant_id, v_invite.school_id, auth.uid(), 'school_invitation.revoked', 'school_invitation', v_invite.id, jsonb_build_object('email', v_invite.email, 'role_key', v_invite.role_key));
end;
$$;

revoke all on function public.revoke_school_invitation(uuid) from public, anon;
grant execute on function public.revoke_school_invitation(uuid) to authenticated;
