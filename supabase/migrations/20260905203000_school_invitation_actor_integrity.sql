create or replace function app_private.user_can_manage_school_invitation(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists(
      select 1
      from public.platform_memberships pm
      where pm.user_id = p_user_id
        and pm.role_key = 'platform_admin'
        and pm.active_from <= current_date
        and (pm.active_to is null or pm.active_to >= current_date)
    )
    or exists(
      select 1
      from public.school_memberships sm
      where sm.school_id = p_school_id
        and sm.user_id = p_user_id
        and sm.role_key = 'school_admin'
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
    );
$$;

revoke all on function app_private.user_can_manage_school_invitation(uuid,uuid)
  from public, anon, authenticated;

comment on function app_private.user_can_manage_school_invitation(uuid,uuid) is
'Arbitrary-user mirror of the existing school-invitation management authority used by physical provenance guards.';

create or replace function app_private.user_owns_school_invitation_email(
  p_user_id uuid,
  p_email text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, auth
as $$
  select exists(
    select 1
    from auth.users u
    where u.id = p_user_id
      and lower(btrim(coalesce(u.email, ''))) = lower(btrim(coalesce(p_email, '')))
      and nullif(btrim(coalesce(u.email, '')), '') is not null
  );
$$;

revoke all on function app_private.user_owns_school_invitation_email(uuid,text)
  from public, anon, authenticated;

comment on function app_private.user_owns_school_invitation_email(uuid,text) is
'Private arbitrary-user email ownership check for binding invitation acceptance provenance to the invited account.';

create or replace function app_private.enforce_school_invitation_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending'
       or new.accepted_at is not null
       or new.accepted_user_id is not null then
      raise exception 'School invitations must be created pending without acceptance provenance';
    end if;

    if auth.uid() is not null
       and new.invited_by_user_id is distinct from auth.uid() then
      raise exception 'School invitation inviter must match authenticated actor';
    end if;

    if not app_private.user_can_manage_school_invitation(
      new.invited_by_user_id,
      new.school_id
    ) then
      raise exception 'School invitation inviter is not authorized for school';
    end if;

    return new;
  end if;

  if new.invited_by_user_id is distinct from old.invited_by_user_id then
    raise exception 'School invitation inviter provenance is immutable';
  end if;

  if old.status = 'accepted' then
    if new.status is distinct from old.status
       or new.accepted_user_id is distinct from old.accepted_user_id
       or new.accepted_at is distinct from old.accepted_at then
      raise exception 'Accepted school invitation provenance is immutable';
    end if;

    return new;
  end if;

  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    if old.status <> 'pending' then
      raise exception 'Only a pending school invitation can be accepted';
    end if;

    if old.expires_at <= now() then
      raise exception 'Expired school invitation cannot be accepted';
    end if;

    if new.accepted_user_id is null or new.accepted_at is null then
      raise exception 'Accepted school invitation requires acceptance provenance';
    end if;

    if auth.uid() is not null
       and new.accepted_user_id is distinct from auth.uid() then
      raise exception 'School invitation accepted user must match authenticated actor';
    end if;

    if not app_private.user_owns_school_invitation_email(
      new.accepted_user_id,
      old.email
    ) then
      raise exception 'School invitation accepted user does not own invited email';
    end if;
  elsif new.accepted_user_id is not null or new.accepted_at is not null then
    raise exception 'School invitation acceptance provenance requires accepted status';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_school_invitation_actor_integrity()
  from public, anon, authenticated;

comment on function app_private.enforce_school_invitation_actor_integrity() is
'Physically binds invitation creation to an authorized inviter, requires canonical pending creation, binds acceptance to the invited account, and freezes accepted provenance.';

drop trigger if exists school_invitation_actor_integrity_trg
  on public.school_invitations;
create trigger school_invitation_actor_integrity_trg
before insert or update of invited_by_user_id, status, accepted_user_id, accepted_at
on public.school_invitations
for each row execute function app_private.enforce_school_invitation_actor_integrity();
