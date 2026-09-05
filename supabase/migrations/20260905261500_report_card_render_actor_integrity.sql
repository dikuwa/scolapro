-- Close trusted-write provenance gaps in the report-card render outbox.
-- Render workers may advance job state, but every durable render request must
-- originate from a real report-card manager for the target school.

create or replace function app_private.enforce_report_card_render_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if new.requested_by_user_id is null then
    raise exception 'Report-card render requester is required';
  end if;

  if auth.uid() is not null
     and new.requested_by_user_id is distinct from auth.uid() then
    raise exception 'Report-card render requester must match authenticated actor';
  end if;

  if not app_private.user_can_manage_report_cards(new.requested_by_user_id,new.school_id) then
    raise exception 'Report-card render requester is not authorized for school';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_report_card_render_actor_integrity()
  from public, anon, authenticated;

comment on function app_private.enforce_report_card_render_actor_integrity() is
'Binds each durable report-card render request to the authenticated report manager or an explicitly attributed authorized manager on trusted writes.';

-- Keep the existing scope-integrity trigger first so malformed tenant/school/
-- snapshot combinations continue to fail with the established scope errors.
drop trigger if exists zz_report_card_render_actor_integrity_trg on public.report_card_render_jobs;
create trigger zz_report_card_render_actor_integrity_trg
before insert
on public.report_card_render_jobs
for each row execute function app_private.enforce_report_card_render_actor_integrity();
