-- Platform administration is SaaS/onboarding governance, not routine school staffing.
-- A platform-only inviter may establish a School Administrator for an active school,
-- but operational school roles must be invited by an active School Admin of that school.

create or replace function app_private.enforce_platform_invitation_onboarding_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_is_platform_admin boolean;
  v_is_target_school_admin boolean;
begin
  select exists(
    select 1
    from public.platform_memberships pm
    where pm.user_id = new.invited_by_user_id
      and pm.role_key = 'platform_admin'
      and pm.active_from <= current_date
      and (pm.active_to is null or pm.active_to >= current_date)
  ) into v_is_platform_admin;

  if not v_is_platform_admin then
    return new;
  end if;

  select exists(
    select 1
    from public.school_memberships sm
    where sm.user_id = new.invited_by_user_id
      and sm.school_id = new.school_id
      and sm.role_key = 'school_admin'
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
  ) into v_is_target_school_admin;

  if not v_is_target_school_admin and new.role_key <> 'school_admin' then
    raise exception 'Platform onboarding may only establish a school administrator';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_platform_invitation_onboarding_scope()
  from public, anon, authenticated;

comment on function app_private.enforce_platform_invitation_onboarding_scope() is
'Prevents platform-only actors from using the school invitation surface for routine staffing. Platform onboarding may establish School Admin; operational roles require target-school administration authority.';

drop trigger if exists school_invitation_platform_onboarding_scope_trg
  on public.school_invitations;
create trigger school_invitation_platform_onboarding_scope_trg
before insert on public.school_invitations
for each row execute function app_private.enforce_platform_invitation_onboarding_scope();
