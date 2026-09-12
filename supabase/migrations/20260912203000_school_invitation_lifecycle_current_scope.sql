-- School invitation management is school-local operational authority.
-- Creation was hardened by #441; bind invitation history and revocation to the
-- same deterministic current-school / effective-placement boundary without
-- changing token acceptance semantics.

create or replace function app_private.can_access_current_school_invitations(
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select auth.uid() is not null
    and app_private.user_can_manage_current_school_membership(auth.uid(),p_school_id);
$$;

revoke all on function app_private.can_access_current_school_invitations(uuid)
from public,anon;
grant execute on function app_private.can_access_current_school_invitations(uuid)
to authenticated;

comment on function app_private.can_access_current_school_invitations(uuid) is
'RLS wrapper for school invitation history: deterministic current-school school-admin authority with authoritative linked staff placement precedence, or governed Platform Admin authority. Platform Support has no override.';

drop policy if exists "authorized admins can read school invitations"
on public.school_invitations;
create policy "authorized admins can read school invitations"
on public.school_invitations for select
to authenticated
using (app_private.can_access_current_school_invitations(school_id));

create or replace function public.revoke_school_invitation(
  p_invitation_id uuid,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_invite public.school_invitations%rowtype;
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_invite
  from public.school_invitations
  where id=p_invitation_id
  for update;

  if not found then
    raise exception 'Invitation not found';
  end if;

  if not app_private.user_can_manage_school_invitation(auth.uid(),v_invite.school_id) then
    raise exception 'Permission denied';
  end if;

  if v_invite.status='revoked' then
    return true;
  end if;

  if v_invite.status='accepted' then
    raise exception 'Accepted invitation cannot be revoked';
  end if;

  if v_invite.status='expired' or v_invite.expires_at<=now() then
    update public.school_invitations
    set status='expired'
    where id=v_invite.id and status='pending';
    raise exception 'Expired invitation cannot be revoked';
  end if;

  update public.school_invitations
  set status='revoked',
      revoked_at=now(),
      revoked_by_user_id=auth.uid(),
      revoke_reason=v_reason
  where id=v_invite.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_invite.tenant_id,v_invite.school_id,auth.uid(),
    'school_invitation.revoked','school_invitation',v_invite.id,
    jsonb_build_object('role_key',v_invite.role_key,'reason',v_reason)
  );

  return true;
end;
$$;

revoke all on function public.revoke_school_invitation(uuid,text) from public,anon;
grant execute on function public.revoke_school_invitation(uuid,text) to authenticated;

comment on function public.revoke_school_invitation(uuid,text) is
'Governed, audited invitation revocation bound to deterministic current-school authority and authoritative linked staff placement; Platform Admin retains governed cross-school authority.';
