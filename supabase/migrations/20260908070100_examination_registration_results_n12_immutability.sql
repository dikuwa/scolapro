-- N12 append-only physical integrity.
-- Trusted/database-owner writes must not be able to rewrite frozen submission or
-- import provenance accidentally. Corrections are represented by new rows/versions.

create or replace function app_private.prevent_n12_history_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'N12 historical records are immutable; append a correction or lifecycle event';
end;
$$;

revoke all on function app_private.prevent_n12_history_mutation()
  from public, anon, authenticated;

create trigger examination_registration_submissions_immutable_trg
before update or delete on public.examination_registration_submissions
for each row execute function app_private.prevent_n12_history_mutation();

create trigger examination_registration_submission_candidates_immutable_trg
before update or delete on public.examination_registration_submission_candidates
for each row execute function app_private.prevent_n12_history_mutation();

create trigger examination_registration_submission_subjects_immutable_trg
before update or delete on public.examination_registration_submission_subjects
for each row execute function app_private.prevent_n12_history_mutation();

create trigger examination_registration_submission_events_immutable_trg
before update or delete on public.examination_registration_submission_events
for each row execute function app_private.prevent_n12_history_mutation();

create trigger examination_result_import_batches_immutable_trg
before update or delete on public.examination_result_import_batches
for each row execute function app_private.prevent_n12_history_mutation();

create trigger examination_result_import_staging_immutable_trg
before update or delete on public.examination_result_import_staging
for each row execute function app_private.prevent_n12_history_mutation();

create trigger examination_result_import_promotions_immutable_trg
before update or delete on public.examination_result_import_promotions
for each row execute function app_private.prevent_n12_history_mutation();

comment on function app_private.prevent_n12_history_mutation() is
'Physical append-only guard for N12 frozen registration snapshots, lifecycle history, import provenance and promotion links.';
