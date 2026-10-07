-- Issue #1151: close the one production schema fragment that was skipped when
-- lesson-preparation offline support was later superseded by the objective-driven
-- preparation migration.
--
-- Fresh databases already receive these objects from
-- 20260921123000_lesson_preparation_offline_drafts.sql, so this is intentionally
-- idempotent. Connected production has the newer offline-draft RPC but was missing
-- the mutation identity column/index that RPC depends on.

alter table public.lesson_preparations
  add column if not exists offline_client_mutation_id uuid;

create unique index if not exists lesson_preparations_offline_mutation_idx
  on public.lesson_preparations(offline_client_mutation_id)
  where offline_client_mutation_id is not null;

comment on column public.lesson_preparations.offline_client_mutation_id is
  'Idempotency identity for offline lesson-preparation draft replay; one server draft mutation per client mutation id.';
