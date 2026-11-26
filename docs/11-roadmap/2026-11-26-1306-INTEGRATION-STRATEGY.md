# #1306 Definitive Integration Strategy

- **Date:** 2026-11-26
- **Candidate:** `release-candidate/1306-20261125`, preserved as tag `rc/1306-20261126` → `5f4d173d`
- **Base:** `main` @ `298a8c7de48dec957dc4b9c1d769d571b351eb3c`
- **Status:** recommendation for Control Room acceptance — nothing here is executed by this document

## 1. Why a single integration branch is the correct strategy

The branches are **stacked, not independent**. Measured file overlap against `main`
(`git diff --name-only origin/main...origin/<branch>`):

| Pair | Shared files |
| --- | --- |
| #1314 grading scales × #1312 approval | 1 |
| #1312 approval × #1317 reapproval | **9** |
| #1317 reapproval × #1318 term applicability | **12** |
| #1318 term applicability × #1330 provenance | **21** |
| #1323 intake × #1325/#1327 | 3 |
| #1305 booklists × #1321 unlendable | 2 |
| #1329 guardian × #1331 progression | 0 |

The grading chain shares up to 21 files because each PR edits the same approval
workspace, the same `src/app/assessment/page.tsx` action bar, and the same E2E/fixture
files. Merging those five individually into `main` would require resolving substantially
the same conflicts five times, and each intermediate merge would produce a `main` state
that **no gate ever tested**.

The candidate avoids that by resolving each conflict **once** and re-running the full
gate suite on the combined result. The conflict resolutions are already committed and
proven green; re-deriving them through five sequential merges would discard that
evidence and reintroduce risk.

**Recommendation: merge the candidate as one integration merge into `main`.** Do not
replay the individual branches.

## 2. Merge order — proven dependency sequence

The candidate already merged in this order (first-parent history, oldest first). It is
the order to preserve if any replay is ever required:

1. `#1323` admissions intake academic-year — **first**, because it shares
   `src/app/school/admissions/page.tsx`, `src/features/admissions/server/queries.ts` and
   `tests/admissions-document-intake.test.mjs` with #1325/#1327.
2. `#1325` + `#1327` admissions decision notes and accepted enrolment — merged together;
   #1325 is already an ancestor of #1327.
3. `#1314` grading scales.
4. `#1312` official-result approval workspace.
5. `#1317` corrected-result reapproval.
6. `#1318` term applicability.
7. `#1330` grading-definition provenance.
8. `#1305` library booklists.
9. `#1321` library unlendable condition (after #1305 — shared library files).
10. `#1308` staff leave type editor.
11. `fix/e2e-destructive-guard-hydration-20261125` (flake fix).
12. `#1329` guardian absence notice completion.
13. `#1331` year-end progression workspace.

Two corrections to the earlier recommended sequence:

- **#1323 was omitted.** It must be included and it must go **first** among the
  admissions work; the earlier sequence listed it nowhere.
- **#1332 should not be merged into the candidate or replayed.** It is a
  documentation-only Control Room record (`docs/11-roadmap/2026-11-25-CONTROL-ROOM-STATUS.md`,
  `docs/11-roadmap/IMPLEMENTATION-STATUS.md`) and is **not** an ancestor of the candidate.
  Its intent is superseded by the handback and ADR added to the candidate. Merging it
  would only create a docs conflict.

## 3. Migration ordering

Ten migrations, no duplicate timestamps, lexicographic order satisfies dependencies:

```
20261122160000_library_grade_booklists
20261122204600_school_grading_scale_governed_configuration
20261123163000_official_result_reapproval_verification_guard
20261123171000_official_result_term_grading_scale_applicability
20261124011000_library_issue_unlendable_condition_guard
20261124043000_admission_same_status_decision_note_revision
20261125120000_guardian_absence_evidence_reviewer_authority
20261125121000_guardian_absence_notice_review_integrity
20261125130000_official_result_grading_definition_provenance
20261125140000_guardian_absence_notice_guardian_control
```

No published migration is renamed or edited; all ten are additive. Ordering is proven by
Database CI running a full `supabase db reset` plus all 521 pgTAP files (6365 tests) on
the candidate.

## 4. What "preserve the tested behaviour" means concretely

The following conflict resolutions and behaviours exist **only** on the candidate and
must not be lost if history is ever rebased or replayed:

- `src/app/school/admissions/page.tsx` — academic-year label (#1323) **plus** decision
  provenance, row test id, corrected conflict baseline and the school-admin enrolment
  action.
- `tests/admissions-document-intake.test.mjs` — all four suites retained.
- `src/app/assessment/page.tsx` — one action bar (Quality, Marks, Grading scales,
  Approve official results, Configure schemes) with role gates derived from the
  deterministic **primary** school role.
- `src/components/shell/navigation.tsx` — additive `/school/progression` entry only.
- Progression receipts read from the append-only publication table and scoped by the
  **source** grade; restricted-label fallback preserved.
- Guardian notice history names the guardian's own child from the canonical family
  overview; inner join on `learners` must never be reintroduced.
- Grading approval reuses the superseded result's recorded definition/fingerprint and
  fails closed on legacy rows without provenance.

## 5. Execution recommendation

1. Control Room accepts the candidate and the two policy decisions in `ADR-0008`.
2. Merge `release-candidate/1306-20261125` into `main` with a merge commit (no squash, no
   rebase) so the per-branch provenance and the resolved-conflict history remain intact.
3. Immediately re-run all three workflows on `main` after the merge, because `main` has
   never held this exact tree.
4. Tag the merged `main` commit as the release candidate for deployment.
5. Production migration execution is a separate, explicitly approved step — see the
   production migration impact assessment.

## 6. Guardrails

- Do **not** merge QA-only #1310, #1315 or #1328. Verified they are not ancestors of the
  candidate.
- Do **not** replay individual branches into `main`; it re-creates the stacked conflicts
  and loses the tested combined state.
- Do **not** rename or edit any of the ten migrations after this point.
- Do **not** implement `ADR-0008` policy variants before owner acceptance.
