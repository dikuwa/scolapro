# 1306 Final Release Acceptance Package

Date: 27 November 2026  
Candidate: `release-candidate/1306-20261125`  
Exact HEAD: `71e7fc7e3c9b028bb298b92756e243fda39c9ac3`  
Main: unchanged at `298a8c7de48dec957dc4b9c1d769d571b351eb3c`  
PR #1333: draft

## Recommendation

**Technical release recommendation: NO-GO pending storage authentication acceptance.**

The RC code and database gates are green, migration performance and rollback have
been rehearsed on synthetic data, and the provenance exception is test-fixture
residue. Storage signed-URL verification has not passed in a reliable isolated
runtime, so evidence storage remains a release blocker. Missing exact-width
screenshots are evidence gaps, not confirmed defects.

## CI and exact-head evidence

- Quality, Database/pgTAP and Authenticated E2E: PASS on the verified RC HEAD.
- Playwright: 102/102 passed, 0 flaky, 0 skipped — [workflow 45875770787](https://github.com/dikuwa/scolapro/actions/runs/45875770787).
- Visual report: [artifact 15144539779](https://github.com/dikuwa/scolapro/actions/artifacts/15144539779).
- Migration thresholds and rehearsal: [PR #1343](https://github.com/dikuwa/scolapro/pull/1343), documentation-only, HEAD `aa693cf96230f762dd9455ef16ac1bd0c28daf61`.

## Migration inventory and order

The RC contains these forward-only migrations in lexicographic order; no published
migration is renamed or edited:

1. `20261122160000_library_grade_booklists.sql`
2. `20261122204600_school_grading_scale_governed_configuration.sql`
3. `20261123163000_official_result_reapproval_verification_guard.sql`
4. `20261123171000_official_result_term_grading_scale_applicability.sql`
5. `20261124011000_library_issue_unlendable_condition_guard.sql`
6. `20261124043000_admission_same_status_decision_note_revision.sql`
7. `20261125120000_guardian_absence_evidence_reviewer_authority.sql`
8. `20261125121000_guardian_absence_notice_review_integrity.sql`
9. `20261125130000_official_result_grading_definition_provenance.sql`
10. `20261125140000_guardian_absence_notice_guardian_control.sql`
11. `20261126120000_guardian_absence_notice_submit_concurrency.sql`
12. `20261126150000_academic_rollover_configuration.sql`

Database CI proved clean reset and pgTAP ordering. The accepted rehearsal recorded
889 migration-ledger rows and final version `20261126150000`.

## Security and provenance

- Tenant isolation, RLS, governed RPC authority, audit history and destructive
  confirmation coverage passed the hosted security/database gates.
- Historical grading results are preserved and correction fails closed when the
  original definition cannot be proven.
- The single provenance-less current result was identified as local-only E2E data
  from `e2e/progression-workspace.spec.ts`, marked `synthetic_fixture_only`.
  It is not evidence of a production remediation requirement; disposable E2E data
  must be reset before interpreting legacy counts.
- No production record was reconstructed, corrected or modified.

## Storage disposition

**BLOCKED.** The pinned CI-compatible Supabase CLI was used in isolated stacks, but
the runtime still produced `signature verification failed` during signed access.
The following remain unaccepted: authorized upload/download, expiry, cross-school
denial, metadata consistency and restart recovery. No production or shared storage
was accessed. Do not weaken JWT verification, RLS or authorization; rerun with a
uniquely named stack, collision-free ports and one consistent Auth/API/Storage key
set, or in the pinned CI environment.

## Visual disposition

Artifact review found no confirmed design-system, accessibility or responsive defect.
Evidence exists for progression and guardian workflows at 390/768/1440 in both
themes. Grading, library and staff leave use 375/768/1440; dedicated academic setup,
admissions, and exact 390px captures for those areas are missing. These are evidence
gaps, not grounds for speculative UI changes.

## Production preflight

Before any production change window, record owner and timestamp for each:

- Read-only legacy provenance counts: unknown, ambiguous and synthetic rows separated.
- Production table sizes, guardian backfill volume and available storage/WAL headroom.
- Fresh provider backup/PITR health, checksum, PostgreSQL major version and isolated restore proof.
- Storage JWT issuer/algorithm/key identity alignment and all six runtime assertions.
- Same-size rehearsal with `lock_timeout`, duration and WAL measurements.
- Application/database compatibility smoke tests for historical results, guardian history and affected RPC signatures.
- Explicit abort owner and recovery owner.
- Approved change window and release-owner authorization.

Synthetic thresholds from PR #1343 are operational baselines only:

- Abort lock acquisition at 10 seconds.
- Investigate duration above 2× rehearsal baseline.
- Investigate WAL above 2× baseline (`38,666,240` and `67,108,864` bytes for the measured operations).
- Abort on integrity, rollback, concurrent-access or provenance-precheck failures.

## Post-release verification

Immediately after an authorized release, verify migration ledger and schema, RPC
grants, tenant/RLS smoke cases, current and historical grading reads, guardian event
history, evidence upload/download and signed URL expiry, admission/library guards,
academic rollover readiness, error rates, WAL/storage headroom and backup freshness.
Record results and rollback/escalation owner; do not treat a green deployment as
proof of historical provenance.

## Owner decisions

1. Academic owner: confirm term-end applicability and whether retrospective grading
   activation remains prohibited under proposed ADR-0008.
2. Release owner: approve storage runtime evidence, backup/PITR, production-sized
   rehearsal, thresholds and change window.
3. Data owner: approve read-only production legacy provenance precheck and disposition
   of any unknown or ambiguous rows; never synthesize historical definitions.

STATUS: IN PROGRESS  
SAFE TO PROMOTE: NO  
NEXT UNLOCKED WORK: close storage acceptance, then obtain release-owner sign-off and
reissue this package with the final go/no-go decision.
