-- Detention attendance outcomes are terminal discipline evidence. The public RPC already
-- records them once; this guard makes that actor/finality rule physical so trusted writes
-- cannot manufacture or rewrite the recorded outcome outside the governed workflow.

create or replace function app_private.enforce_detention_session_item_actor_finality()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if tg_op='INSERT' then
    if new.attendance_status<>'scheduled'
       or new.recorded_by_user_id is not null
       or new.recorded_at is not null
       or new.outcome_note is not null then
      raise exception 'Detention session item must be created in canonical scheduled state';
    end if;
    return new;
  end if;

  if old.attendance_status<>'scheduled' then
    if new.attendance_status is distinct from old.attendance_status
       or new.recorded_by_user_id is distinct from old.recorded_by_user_id
       or new.recorded_at is distinct from old.recorded_at
       or new.outcome_note is distinct from old.outcome_note then
      raise exception 'Detention attendance outcome provenance is immutable';
    end if;
    return new;
  end if;

  if new.attendance_status='scheduled' then
    if new.recorded_by_user_id is not null
       or new.recorded_at is not null
       or new.outcome_note is not null then
      raise exception 'Scheduled detention item cannot carry outcome provenance';
    end if;
    return new;
  end if;

  if new.recorded_by_user_id is null or new.recorded_at is null then
    raise exception 'Detention attendance outcome requires recorder and timestamp';
  end if;

  if auth.uid() is not null and new.recorded_by_user_id<>auth.uid() then
    raise exception 'Detention attendance recorder must match authenticated actor';
  end if;

  if not app_private.user_can_complete_detention_session_actor(new.recorded_by_user_id,new.detention_session_id) then
    raise exception 'Detention attendance recorder is not authorized for session';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_detention_session_item_actor_finality()
from public,anon,authenticated;

drop trigger if exists zz_detention_session_item_actor_finality_trg
on public.detention_session_items;
create trigger zz_detention_session_item_actor_finality_trg
before insert or update of attendance_status,outcome_note,recorded_by_user_id,recorded_at
on public.detention_session_items
for each row execute function app_private.enforce_detention_session_item_actor_finality();

comment on function app_private.enforce_detention_session_item_actor_finality() is
'Physical finality and actor-integrity guard for detention attendance outcomes. Items start scheduled without outcome provenance; the first final outcome requires an authorized recorder and is immutable thereafter.';