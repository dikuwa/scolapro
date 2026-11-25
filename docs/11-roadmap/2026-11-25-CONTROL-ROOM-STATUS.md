# Control Room status — #1306 autonomous completion wave (25 November 2026)

Base main: `298a8c7de48dec957dc4b9c1d769d571b351eb3c`.

This record is authoritative alongside `CONTROL-ROOM.md`, `COORDINATED-DELIVERY-LEDGER.md`
and `IMPLEMENTATION-STATUS.md` for the #1306 wave. Classification meanings are unchanged:
**COMPLETE / INTEGRATED**, **SOURCE-VERIFIED**, **DEPLOYMENT-GATED**, **LIVE-QA-GATED**,
**ACTUAL IMPLEMENTATION GAP**, **REQUIREMENTS-GATED**.

## 1. Workstream handbacks

### B1 — admissions decision notes (#1324 / PR #1325) — DONE

- Branch: `feat/1324-admissions-decision-notes-20261124`
- Head: `eae935cb1e4077128d00c2d7cf40ab9b5bf76678`
- CI: quality pass, Database validate pass, authenticated E2E pass.
- Fixed root cause: the conflict baseline used the *normalised* decision status, so an
  application still in `received` submitted an empty `expectedStatus` and the first
  decision was rejected as an invalid review state. The raw authoritative status is now
  the conflict token; the editable draft is normalised separately.
- A note-only revision preserves `reviewed_at`, so the previous remount key never
  changed and a successful save left the editor open. The success redirect now identifies
  the saved application (`decided` + `revision`) so only that editor closes and
  re-initialises; other open drafts keep their captured baseline and stale-write
  rejection.
- Added: authenticated regression for a stale editor racing a newer note; repeatable
  fixture by replacing the synthetic application (server-managed provenance cannot be
  cleared in place).

### B2 — accepted application to enrolment (PR #1327) — DONE (dependency satisfied)

- Branch: `feat/1326-admissions-accepted-enrolment-20261124`
- Head: `7df9f702` (merge of the corrected #1325 baseline).
- CI: quality pass, authenticated E2E pass.
- Verified from source: only `school_admin` can complete enrolment; the RPC re-checks
  status, accepted grade, same school/year/class, existing-identity tenant scope,
  duplicate current enrolment, and writes `admission.enrolled` audit provenance with
  `reused_existing_learner`. UI filters classes by application year + requested grade and
  fails closed when none exist.

### B3 — integrated admissions QA (PR #1328) — SOURCE-COMPLETE; CI GREEN

- Branch: `qa/1323-1325-1327-admissions-integration-20261124`
- Head: `fe79f46c` (merge of #1327 + fixture repair).
- CI: quality pass, authenticated E2E pass.
- Fixed the outstanding CodeRabbit finding: the historical 2025 intake job now refreshes
  `created_at` so it stays inside the workspace's newest-30 queue on repeated runs.
- QA-only. **Never merge directly.**

### A — assessment / grading integrity (PR #1330) — DONE; CI GREEN

- Branch: `lane-a/grading-provenance-hardening-20261125`
- Base: `feat/1316-grading-term-applicability-20261123` (#1318) → open after #1318.
- Head: `1ace22af`.
- CI: quality pass, Database validate pass, authenticated E2E pass.
- Corrected defects:
  1. Official results now retain `grading_definition_snapshot` (version, precision,
     effective period, ordered bands) and `grading_definition_fingerprint`; both are
     immutable after approval.
  2. A correction must reuse the superseded result's fingerprint; legacy results without
     a snapshot fail closed rather than accepting an unverifiable definition.
  3. A used `(key, version)` cannot return to draft, change definition fields, recreate a
     draft shadow, change bands, or be deleted — including legacy rows still in `draft`.
  4. Restored the `for update of ai` mark-correction serialization accidentally dropped
     in #1318.
  5. Term-end lookup uses `v_enrolment.academic_year`; scheme/enrolment year mismatch
     fails closed.
  6. `result_value` widened to `numeric(10,4)` (view recreated around the change).
  7. Readiness counts the required component set; assessment management links gate on the
     deterministic current-school role.
- Regression coverage: node source contract + authenticated lifecycle assertions,
  plus pgTAP for the legacy used-draft scale.

**Outstanding product-owner decision:** whether a retrospective grading scale may be
activated after its term ended. The activation guard uses `current_date`; the approval
guard uses the academic term end. This wave did not change either and did not invent a
policy.

### C — parent notices / guardian workflows (PR #1329) — DONE; CI GREEN

- Branch: `lane-c/parent-notice-completion-20261125`
- Head: `b63ce459`.
- CI: quality pass, Database validate pass, authenticated E2E pass.
- Security correction (pre-existing defect): guardian absence evidence storage reads used
  `can_view_operational_learners`, so `teacher`, `hod` and `librarian` could enumerate and
  sign medical/support evidence although the notice metadata policy denied them. Storage
  reads now use `can_review_guardian_absence_notice`, with pgTAP denial coverage.
- Completed actions:
  - evidence open/download for the submitting guardian and authorized reviewers through
    an RLS-authorized route that mints a 90-second signed URL for the fixed private bucket;
  - duplicate active notices for the same learner/period refused;
  - bounded review transitions (`accepted`/`closed` final);
  - stale-review protection via `review_guardian_absence_notice_checked`;
  - reviewer notification on submission and guardian notification on outcome, with fixed
    copy (no learner name, reason, message or evidence);
  - guardian submission revalidates the staff review queue.
- Not implemented in this slice (honest gap, not a regression): guardian withdrawal,
  editing/resubmission of a `returned` notice, per-notice detail/audit view, review-queue
  pagination, and the explicit `under_review`/`close` buttons. The database permits some of
  these; they remain product-facing follow-up.

### D — learner progression / promotion (PR #1331) — DONE; CI GREEN

- Branch: `lane-d/progression-workspace-20261125`
- Head: `7e59ac5d`.
- CI: quality pass (build + typecheck + source tests), authenticated E2E pass.
- The backend was complete but had **no operator UI**: generate/override/approve/lock/
  publish had no caller in `src/`, there was no navigation entry and no promotion UI test.
- Added `/school/progression` as thin orchestration over the canonical RPCs: summary-first
  counts, next-year and rule-set prerequisite warnings, canonical readiness preview,
  generate, reasoned override, approve, lock (with confirmation), and publish (destination
  class + effective date + confirmation) with a published receipt.
- Authorization limited to `school_admin`/`principal`/`deputy_principal`, matching publish
  and the bulk readiness projection. Navigation visibility is now asserted by the
  validator for leadership and denied for HOD/teacher/class_teacher/counsellor/parent/
  librarian.
- Not verified: populated-cohort browser acceptance and HOD preparation UI (deliberately
  not exposed because bulk readiness and publish exclude HOD).

### E — library and staff leave (#1305, #1321, #1308) — DONE

| PR | Head | CI | Action this wave |
|---|---|---|---|
| #1305 booklists | `8924905f` | quality, Database, authenticated E2E pass | Fixed 3 CodeRabbit findings: per-learner allocation cap in demand metrics, save-completion editor isolation, deterministic tenant-isolation fixture. |
| #1321 library issue guard | `c9d1ceb4` | quality, Database, authenticated E2E pass | Verified; no unresolved review threads. |
| #1308 staff leave editor | `3e7d9736` | quality, authenticated E2E pass | Verified; no unresolved review threads. |

`#1305` and `#1321` both touch `src/features/library/class-operations.tsx` and
`library-workspace.tsx`. Merge and re-verify one after the other; neither adds a conflicting
migration.

## 2. Recommended integration sequence

1. #1325 → #1327 → (#1328 evidence only, do not merge).
2. #1314 → #1312 → #1317 → #1318 → #1330.
3. #1305 → #1321 (shared library files), independent of #1308.
4. #1329 (guardian), #1331 (progression) — independent of each other.
5. #1310 (guardian lifecycle evidence) and #1315 (assessment integration evidence) are
   QA-only; use as evidence, do not merge.

## 3. Verification performed

- Every listed PR was checked against its **actual head** with `gh pr checks` after the
  final push. Green means quality (format/lint/typecheck/unit/source-contract/build),
  Database validate (migrations + full pgTAP suite), and authenticated Playwright E2E as
  applicable.
- Local: source-contract tests per lane, `tsc --noEmit`, `eslint` on changed files,
  `validate:navigation`, and `next build` for the progression workspace.
- NOT verified: browser/device visual acceptance at 390/768/1440 light/dark for the new
  screens; populated real-data progression; evidence download against live storage; the
  guardian notification copy in a real inbox UI; production migration execution (out of
  scope without Control Room acceptance).

## 4. Residual CodeRabbit threads

- #1328 fixture finding — fixed in `fe79f46c`.
- #1305 three findings — fixed in `8924905f`.
- #1315 seven findings — QA-only branch; the grading-activation finding is the open
  product-owner decision above; the negative-fixture replay finding is already fixed on
  #1318 (`e2e/support/official-result-term-grading-negative-local-fixture.sql`); the
  guardian-publication test-isolation findings remain on the QA evidence branch and do not
  change product code.
- #1289 is evidence-only and not part of this wave.

## 5. Standing guards preserved

No attendance rewrite by guardian notices; daily/register, subject-period and
late-arrival remain separate; no second promotion engine; no invented grading thresholds
or national policy; no direct writes to progression or official-result tables from the
client; no service-role use before RLS authorization; additive migrations only.
