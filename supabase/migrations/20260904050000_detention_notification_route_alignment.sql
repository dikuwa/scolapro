-- Detention assignment notifications are consumed by the assigned staff member,
-- not by the school-wide late-arrival manager. Normalize newly-created durable
-- notification links onto the self-scoped supervision workspace without weakening
-- the existing immutability of notification content/provenance.

create or replace function app_private.align_detention_supervision_notification_href()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if new.href='/late-arrivals'
    and new.title in ('Detention supervision assigned','Detention duty scheduled') then
    new.href := '/my-detention-supervision';
  end if;
  return new;
end;
$$;

revoke all on function app_private.align_detention_supervision_notification_href()
from public,anon,authenticated;

drop trigger if exists detention_supervision_notification_href_trg on public.notifications;
create trigger detention_supervision_notification_href_trg
before insert
on public.notifications
for each row execute function app_private.align_detention_supervision_notification_href();

-- Repair already-created assignment/duty notifications once during migration so
-- users do not retain a link to a management route they may not be authorized to open.
update public.notifications
set href='/my-detention-supervision'
where href='/late-arrivals'
  and title in ('Detention supervision assigned','Detention duty scheduled');

comment on function app_private.align_detention_supervision_notification_href() is
'Routes newly-created detention assignment and scheduled-duty notifications to the self-scoped My detention supervision workspace while leaving unrelated late-arrival management notifications unchanged. Existing rows are repaired once by migration and remain subject to notification immutability.';
