create or replace function public.notify_school_invitation_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_name text;
begin
  if old.status is distinct from new.status and new.status = 'accepted' then
    select name into v_school_name from public.schools where id = new.school_id;

    if new.invited_by_user_id is not null and new.invited_by_user_id is distinct from new.accepted_user_id then
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
        '/platform/invitations'
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists school_invitation_notification_trigger on public.school_invitations;
create trigger school_invitation_notification_trigger
after update of status on public.school_invitations
for each row
execute function public.notify_school_invitation_status_change();

comment on function public.notify_school_invitation_status_change() is 'Creates durable user notifications for meaningful school invitation lifecycle events without using client-side toast state as the system of record.';
