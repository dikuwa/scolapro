-- Official report-card history should carry its publication actor directly on the
-- snapshot instead of requiring audit-log reconstruction. Preserve older historical
-- rows as-is when an actor was not recorded at publication time; all future
-- publication transitions must stamp the authenticated actor and keep it immutable.

alter table public.report_card_snapshots
  add column if not exists published_by_user_id uuid references auth.users(id) on delete restrict;

create index if not exists report_card_snapshots_published_by_idx
  on public.report_card_snapshots(published_by_user_id)
  where published_by_user_id is not null;

create or replace function app_private.guard_report_card_publication_provenance()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.published_by_user_id is not null
     and new.published_by_user_id is distinct from old.published_by_user_id then
    raise exception 'Report-card publication actor is immutable';
  end if;

  if new.status = 'published' and old.status <> 'published' then
    if auth.uid() is null then
      raise exception 'Report-card publication requires an authenticated actor';
    end if;
    new.published_by_user_id := auth.uid();
    new.published_at := coalesce(new.published_at, now());
  end if;

  return new;
end;
$$;

revoke all on function app_private.guard_report_card_publication_provenance()
  from public, anon, authenticated;

drop trigger if exists report_card_publication_provenance_guard on public.report_card_snapshots;
create trigger report_card_publication_provenance_guard
before update on public.report_card_snapshots
for each row execute function app_private.guard_report_card_publication_provenance();

comment on column public.report_card_snapshots.published_by_user_id is
  'Authenticated actor who first transitioned this immutable report-card snapshot to published. Historical rows published before this field existed may remain null.';
comment on function app_private.guard_report_card_publication_provenance() is
  'Stamps the authenticated publisher on first publication and prevents that provenance from being rewritten.';