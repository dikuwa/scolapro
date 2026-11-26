# PR #1333 migration release preflight

Reconciled: **26 November 2026**  
Candidate: `release-candidate/1306-20261125`  
PR: [#1333](https://github.com/dikuwa/scolapro/pull/1333)  
Code head assessed: `9f5c1d48fa2ae8a698d011b4eeb86a3b0b41db3c`  
Branch tip at review: `2b11347b8ec7fcb8c836343047405cc1bd926c9c` (documentation-only after the code head)

This is a read-only production preflight. It does not apply, repair, or replay a
production/shared-database migration.

## Current evidence

- The candidate adds ten forward-only migrations with unique, lexicographically
  ordered timestamps.
- Database CI already proved a clean `supabase db reset` and the full pgTAP suite
  on the combined candidate: 521 files / 6,365 tests, passing.
- Application and authenticated E2E gates are recorded as passing in the candidate
  handback. That proves source behavior and clean-database ordering, not production
  data compatibility or production lock duration.
- No published migration is renamed or edited by the candidate.
- The candidate's grading policy is A1 + B1 in ADR-0008: applicability is checked
  against configured term end, and expired scales cannot be activated. Retrospective
  activation is intentionally not implemented.

## Lock-impact assessment

| Migration / operation | Impact | Release treatment |
| --- | --- | --- |
| `20261122160000_library_grade_booklists.sql` creates two tables, indexes, policies and triggers | New-object catalog locks; no existing business-table rewrite | Normally low risk. Confirm no concurrent migration and monitor DDL completion. |
| `20261122204600_school_grading_scale_governed_configuration.sql` replaces functions/triggers and revokes direct grading writes | Brief catalog/table trigger-definition locks; no data scan | Apply in a quiet window; verify RPC grants and direct `UPDATE` denial afterward. |
| `20261123163000_official_result_reapproval_verification_guard.sql` and `20261123171000_official_result_term_grading_scale_applicability.sql` replace the approval RPC | Function replacement is atomic; no table rewrite | Verify the application and migration are deployed as a pair. Do not run the old approval client against a partially migrated schema. |
| `20261124011000_library_issue_unlendable_condition_guard.sql` and `20261124043000_admission_same_status_decision_note_revision.sql` replace RPCs | Atomic function replacement | Application compatibility check is required before enabling new callers. |
| `20261125130000_official_result_grading_definition_provenance.sql` adds two nullable columns and a `NOT VALID` check | Fast metadata change for nullable columns/check; `ALTER COLUMN result_value TYPE numeric(10,4)` may rewrite or scan `official_results` and takes a strong table lock | **Release blocker until measured on a representative-size copy.** Capture row count/table size, lock wait, duration and WAL. Set an explicit lock/statement timeout policy. |
| `20261125130000...` drops/recreates `official_results_current` | Brief view/catalog lock; dependent queries must tolerate the replacement | Check dependent views/functions and post-migration view grants. |
| `20261125140000_guardian_absence_notice_guardian_control.sql` drops/adds the status check | `DROP CONSTRAINT` is quick; the new validated check can scan `guardian_absence_notices` and waits on conflicting table locks | **Precheck all existing statuses.** Stop if any value is outside the six allowed statuses. Measure on representative row volume. |
| `20261125140000...` backfills `guardian_absence_notice_events` | Data write, WAL and index growth in the migration transaction; source-table reads can contend with concurrent notice writes | **Release blocker until row count, WAL, duration and rollback space are known.** Prefer a quiet window and verify the backfill is idempotent. |

The approval functions deliberately lock all contributing `assessment_instances` in
deterministic `id` order and hold those row locks through readiness, calculation and
result insertion. This is an application concurrency contract, not a migration lock;
monitor approval-vs-mark-correction waits after release.

## Read-only legacy grading prechecks

Run these against a production snapshot or read replica before migration. Do not use
them as a reason to mutate production during the release window.

```sql
-- 1. Legacy official results that will fail closed on correction.
select
  count(*) as legacy_results,
  count(*) filter (where superseded_at is null) as current_legacy_results,
  count(*) filter (where superseded_at is not null) as superseded_legacy_results
from public.official_results
where grading_definition_snapshot is null
   or grading_definition_fingerprint is null;

-- 2. Results with only one half of the new provenance pair.
select count(*) as malformed_provenance_rows
from public.official_results
where (grading_definition_snapshot is null)
   <> (grading_definition_fingerprint is null);

-- 3. Existing grading-scale definitions and bands that must remain readable.
select gs.school_id, gs.id, gs.scale_key, gs.version, gs.status,
       gs.effective_from, gs.effective_to, gs.decimal_places,
       count(gb.id) as band_count
from public.grading_scales gs
left join public.grading_scale_bands gb on gb.grading_scale_id = gs.id
group by gs.school_id, gs.id, gs.scale_key, gs.version, gs.status,
         gs.effective_from, gs.effective_to, gs.decimal_places
order by gs.school_id, gs.scale_key, gs.version;

-- 4. Current approval prerequisites: missing term ends and overlapping/invalid periods.
select y.school_id, y.year, t.term_number, t.ends_on
from public.academic_years y
join public.academic_terms t on t.academic_year_id = y.id
where t.ends_on is null;

select school_id, scale_key, version, effective_from, effective_to
from public.grading_scales
where effective_to is not null and effective_to < effective_from;

-- 5. Guardian statuses that would fail the new validated constraint.
select status, count(*)
from public.guardian_absence_notices
group by status
order by status;

-- 6. Backfill scope and duplicate-safety estimate.
select
  (select count(*) from public.guardian_absence_notices) as notices,
  (select count(*) from public.guardian_absence_notice_events) as existing_events,
  (select count(*) from public.guardian_absence_notices n
   where not exists (
     select 1 from public.guardian_absence_notice_events e
     where e.notice_id = n.id and e.event_type = 'submitted'
   )) as notices_needing_submission_event,
  (select count(*) from public.guardian_absence_notices n
   where n.reviewed_at is not null and not exists (
     select 1 from public.guardian_absence_notice_events e
     where e.notice_id = n.id and e.event_type = 'reviewed'
   )) as notices_needing_review_event;
```

Interpretation:

- `malformed_provenance_rows > 0` indicates pre-existing bad state and must be
  investigated before proceeding.
- Any current legacy result without a snapshot is not safely correctable by the new
  RPC. It needs a governed historical reconstruction or an explicit business decision;
  do not fill it with guessed bands or a current scale.
- Missing term ends make approval fail closed under the candidate's accepted policy.
- Any guardian status outside `submitted`, `under_review`, `accepted`, `returned`,
  `closed`, `withdrawn` is a hard stop before the constraint change.

## Historical compatibility checks

- Preserve the original official result, its supersession chain, raw marks, rule
  version, scale identity and audit events. The new snapshot is additive and must not
  rewrite historical values.
- Verify that current and superseded results remain visible through
  `official_results_current` only when `superseded_at is null`; historical records
  remain addressable by their stable IDs.
- Verify correction behavior in three fixtures: snapshot present and unchanged
  (allowed), snapshot present but selected definition changed (denied), and legacy
  snapshot absent (denied with an actionable remediation path).
- Compare pre/post counts and checksums for `official_results`, `official_results`
  supersession columns, grading scales/bands and guardian notices. The only expected
  new rows are guardian event backfill rows and the only expected schema additions are
  the documented provenance/event objects.
- Do not activate a scale retrospectively while ADR-0008 remains proposed. A late
  configuration must remain an explicit operational exception, not an implicit data
  repair.

## Ordering and application compatibility

Before production approval:

1. Confirm the exact merged `main` commit contains the candidate code head and rerun
   the application, database and E2E workflows on that exact merge result. The RC
   branch itself is tested, but that exact tree has not yet been `main`.
2. Preserve migration order exactly as committed. Do not replay individual stacked
   PRs, rename timestamps, or edit an already-published migration.
3. Deploy the application code that knows about the new nullable provenance fields,
   RPC behavior and event history only with the matching database migration set.
4. Verify RPC signatures and grants for `approve_official_subject_result`, guardian
   notice submit/review/withdraw/resubmit, admission decision and library issue
   functions. Old clients must not be allowed to assume pre-RC semantics after the
   new constraints are active.
5. Exercise a read-only smoke query for `official_results_current`, grading-scale
   history, guardian notice history and each affected RPC's `to_regprocedure(...)`
   identity after migration.

## Backup / restore rehearsal

Required before production execution:

- Obtain a fresh provider backup or `pg_dump` from an approved non-production/scrubbed
  source. Record timestamp, source identity, PostgreSQL major version, object count,
  dump checksum and available restore point.
- Restore into an isolated disposable database, never a shared staging database and
  never the production project. Run schema/migration ledger checks, row counts,
  foreign-key checks and the legacy grading prechecks above.
- Apply the candidate migrations to the restored copy, then repeat the checks and
  run the relevant pgTAP/approval-history fixtures. Confirm the restore remains usable
  if the migration transaction is rolled back or the migration is deliberately
  aborted before commit.
- Prove that the backup can be read independently of the source and that the restore
  owner can retrieve it within the accepted recovery-time objective.

The local rehearsal was **not completed** in this pass. An isolated RC worktree was
used, but the Supabase CLI could not complete a disposable reset: the default local
port was occupied by another local stack; after moving the RC stack to isolated ports,
the CLI recreated the database but timed out during health/start orchestration and
removed the container. No production or shared database was touched, and no backup
was taken from a hosted/shared database.

## Production go / no-go checklist

The release manager should mark each item with evidence, timestamp and owner:

- [ ] Exact merged `main` SHA and migration list recorded; no migration renamed/edited.
- [ ] Database CI, application CI and E2E rerun on exact merged SHA.
- [ ] Fresh backup/PITR health confirmed; checksum and restore owner recorded.
- [ ] Disposable restore completed on the same PostgreSQL major version.
- [ ] Restore validation passed: schema, FK, migration ledger, row counts and pgTAP.
- [ ] `official_results` size and `numeric(10,2) → numeric(10,4)` timing/WAL measured;
      lock timeout and abort procedure approved.
- [ ] Guardian notice status inventory contains only allowed values.
- [ ] Guardian event backfill volume, duration, WAL and rollback space measured.
- [ ] Legacy grading rows inventoried; current legacy rows have a documented governed
      remediation or an explicit decision that correction remains blocked.
- [ ] Missing academic term-end dates and invalid/overlapping grading periods have an
      owner and release decision.
- [ ] Application compatibility smoke tests pass for current and historical result
      reads, correction denial, guardian history and affected RPC signatures.
- [ ] Migration lock monitoring, cancellation threshold and rollback/restore owner
      are present in the change window.
- [ ] Production/shared migration execution is separately approved. This document is
      not that approval.

## Disposition

**STATUS: IN PROGRESS** — source ordering and clean-database CI are green, but
production data prechecks, representative lock/backfill measurements, and an isolated
backup/restore proof remain outstanding. **Safe to execute production migrations: NO.**
