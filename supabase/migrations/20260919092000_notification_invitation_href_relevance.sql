-- Issue #528: keep school-invitation notification actions relevant to the
-- recipient's current authority without rewriting the invitation/audit event itself.
-- Platform Admins keep the platform onboarding route. Current School Admins receive
-- the school-local invitation route. Ended/stale inviters are simply not notified,
-- so a notification side effect cannot block acceptance of the invitation.

create or replace function public.notify_school_invitation_status_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_school_name text;
  v_href text;
  v_current_school_id uuid;
  v_current_membership_staff_id uuid;
  v_is_platform_admin boolean := false;
  v_is_platform_support boolean := false;
begin
  if old.status is distinct from new.status and new.status = 'accepted' then
    select name into v_school_name
    from public.schools
    where id = new.school_id;

    if new.invited_by_user_id is not null
       and new.invited_by_user_id is distinct from new.accepted_user_id then

      select exists (
        select 1
        from public.platform_memberships pm
        where pm.user_id = new.invited_by_user_id
          and pm.role_key = 'platform_admin'
          and pm.active_from <= current_date
          and (pm.active_to is null or pm.active_to >= current_date)
      ) into v_is_platform_admin;

      select exists (
        select 1
        from public.platform_memberships pm
        where pm.user_id = new.invited_by_user_id
          and pm.role_key = 'platform_support'
          and pm.active_from <= current_date
          and (pm.active_to is null or pm.active_to >= current_date)
      ) into v_is_platform_support;

      if v_is_platform_admin then
        v_href := '/platform/invitations';
      elsif not v_is_platform_support then
        select sm.school_id, sm.staff_member_id
          into v_current_school_id, v_current_membership_staff_id
        from public.school_memberships sm
        where sm.user_id = new.invited_by_user_id
          and sm.active_from <= current_date
          and (sm.active_to is null or sm.active_to >= current_date)
        order by sm.active_from desc, sm.id asc
        limit 1;

        if v_current_school_id = new.school_id
           and exists (
             select 1
             from public.school_memberships sm
             where sm.user_id = new.invited_by_user_id
               and sm.school_id = new.school_id
               and sm.role_key = 'school_admin'
               and sm.active_from <= current_date
               and (sm.active_to is null or sm.active_to >= current_date)
               and (
                 sm.staff_member_id is null
                 or app_private.staff_member_covers_school_period(
                   sm.staff_member_id,
                   new.school_id,
                   current_date,
                   current_date
                 )
               )
           ) then
          v_href := '/school/invitations';
        end if;
      end if;

      if v_href is not null then
        insert into public.notifications (
          recipient_user_id,
          tenant_id,
          school_id,
          severity,
          title,
          body,
          href
        )
        values (
          new.invited_by_user_id,
          new.tenant_id,
          new.school_id,
          'success',
          'School invitation accepted',
          concat(new.email, ' joined ', coalesce(v_school_name, 'the school'), ' as ', replace(new.role_key, '_', ' '), '.'),
          v_href
        );
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.notify_school_invitation_status_change()
from public, anon, authenticated;

comment on function public.notify_school_invitation_status_change() is
'Creates recipient-specific invitation acceptance notifications only when the inviter still has actionable authority: Platform Admin routes to platform onboarding; current/effective School Admin routes to school invitations; stale/ended/Platform Support inviters are not notified.';
