-- Enforce first-login rotation at the database boundary, not just the UI.
-- Direct authenticated RPC calls can bypass Next.js page and action guards.
create or replace function public.prevent_invitation_acceptance_before_rotation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.status = 'accepted'
     and old.status is distinct from 'accepted'
     and coalesce(auth.role(), '') = 'authenticated'
     and not exists (
       select 1
       from public.user_profiles up
       where up.user_id = auth.uid()
         and up.must_change_password is false
     ) then
    raise exception 'Complete account security setup before accepting invitations'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists school_invitation_rotation_acceptance_guard on public.school_invitations;
create trigger school_invitation_rotation_acceptance_guard
before update of status on public.school_invitations
for each row execute function public.prevent_invitation_acceptance_before_rotation();

revoke all on function public.prevent_invitation_acceptance_before_rotation()
  from public, anon, authenticated;
