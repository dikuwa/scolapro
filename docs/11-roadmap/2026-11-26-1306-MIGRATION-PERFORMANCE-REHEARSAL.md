# 1306 migration performance and recovery rehearsal

Rehearsal date: 26 November 2026  
Candidate: `release-candidate/1306-20261125`  
Candidate HEAD: `71e7fc7e3c9b028bb298b92756e243fda39c9ac3`  
Database: disposable local Supabase PostgreSQL 17.12 container  
Migration ledger: 889 rows, final version `20261126150000`

This rehearsal used only synthetic rows in a disposable `perf_lab` schema. The
previous isolated backup/restore result was reused; no production or shared
database, snapshot, object store or hosted credential was accessed.

## Dataset and measurements

The synthetic workload contained 100,000 official-result-shaped rows with a
`numeric(10,2)` value and 100,000 guardian-notice-shaped rows. One quarter of
the notices had review timestamps. The measured operations correspond to the
two candidate operations with the largest data-impact risk:

| Operation | Rows affected | Duration | WAL generated | Result |
| --- | ---: | ---: | ---: | --- |
| `official_results.result_value` `numeric(10,2)` → `numeric(10,4)` | 100,000 | 1,668.3 ms | 19,333,120 bytes | pass |
| Guardian submitted/reviewed event backfill | 125,000 events | 3,529.9 ms | 33,554,432 bytes | pass |

WAL was measured with `pg_current_wal_lsn()` and `pg_wal_lsn_diff()` around each
operation. The backfill produced 100,000 submitted and 25,000 reviewed events;
all 125,000 `(notice_id,event_type)` pairs were distinct.

## Locking and concurrent access

A separate transaction held an `ACCESS SHARE` read transaction on the synthetic
official-results table for five seconds while the precision alteration requested
its stronger table lock. The DDL completed after `5,022.8 ms` and succeeded
under a 10-second `lock_timeout`. A concurrent count query returned all 100,000
rows while the read transaction was open.

The observed wait is expected DDL behavior. Production execution must use a
quiet window and an explicit lock timeout; it must not wait indefinitely behind
application traffic.

## Interrupted migration recovery

The precision alteration was started in a transaction, followed by a 20-second
wait. The backend was terminated while the transaction was open. PostgreSQL
reported successful backend termination; after recovery:

- the interrupted column was absent (`0` catalog rows);
- the synthetic table remained readable (`100,000` rows);
- the precision and event integrity checks remained valid.

This verifies transactional rollback for the tested DDL shape, not crash
recovery after host loss or storage failure.

## Release thresholds and abort criteria

These are operational preflight thresholds for a same-major-version rehearsal,
not a production approval:

1. Abort before production execution if any migration cannot acquire its required
   lock within 10 seconds during the rehearsal or change window.
2. Abort if any measured operation exceeds 2x its rehearsal duration without an
   approved explanation and a new rehearsal.
3. Abort if WAL exceeds 2x the measured baseline (`38,666,240` bytes for the
   precision rewrite or `67,108,864` bytes for the event backfill) for an equivalent row volume, or if available
   free storage cannot cover WAL plus rollback space.
4. Abort if concurrent read/write smoke tests fail, if the migration is not
   transactional where expected, or if post-abort row counts, constraints,
   migration ledger or historical provenance differ unexpectedly.
5. Abort if legacy grading prechecks identify unknown or ambiguous provenance;
   preserve the result and route it to governed historical remediation. Never
   synthesize a grading snapshot or fingerprint.

The thresholds must be recalibrated against a scrubbed production-sized copy
before a live change window. This rehearsal does not establish a safe maximum
row count for every tenant.

## Disposition

Synthetic duration, WAL, lock-wait, concurrent-read, interrupted-transaction
and integrity checks passed. Prior backup/restore evidence remains accepted and
was not repeated. Production execution remains **NOT APPROVED** until the
release owner records a same-size backup/PITR confirmation, legacy grading
provenance disposition, storage capacity check and change-window authorization.
