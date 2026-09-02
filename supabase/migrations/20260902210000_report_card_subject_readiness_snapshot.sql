-- Freeze the non-blocking learner subject/result reconciliation inside every newly
-- created report-card snapshot. This preserves the exact readiness evidence that
-- existed at generation time without changing report generation, certification,
-- publication, result calculation, or legacy compatibility.

create or replace function app_private.enrich_report_card_snapshot_subject_readiness()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if new.enrolment_id is null then
    raise exception 'Report-card snapshot enrolment is required';
  end if;
  if new.term_number is null or new.term_number<1 or new.term_number>6 then
    raise exception 'Term number is invalid';
  end if;

  new.data_snapshot:=coalesce(new.data_snapshot,'{}'::jsonb)
    || jsonb_build_object(
      'subject_result_readiness',
      app_private.build_learner_subject_result_readiness(
        new.enrolment_id,
        new.term_number::smallint
      )
    );

  return new;
end;
$$;

revoke all on function app_private.enrich_report_card_snapshot_subject_readiness()
from public,anon,authenticated;

create trigger report_card_snapshot_subject_readiness_enrichment_trg
before insert on public.report_card_snapshots
for each row
execute function app_private.enrich_report_card_snapshot_subject_readiness();

comment on function app_private.enrich_report_card_snapshot_subject_readiness() is
  'Captures the non-blocking subject-registration/result reconciliation inside each new report-card data snapshot so later registration changes cannot rewrite the evidence that existed at generation time.';