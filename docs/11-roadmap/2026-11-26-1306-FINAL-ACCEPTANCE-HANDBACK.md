# #1306 Final Acceptance — Combined Release Candidate Handback

Reconciled: **26 November 2026**
Authoritative `main` at reconciliation: `298a8c7de48dec957dc4b9c1d769d571b351eb3c`

This document records exact-HEAD acceptance evidence for the combined #1306 release
candidate. It does not merge, deploy or migrate anything. QA-only branches #1315 and
#1328 are deliberately excluded.

## Combined release candidate

| Item | Value |
| --- | --- |
| Branch | `release-candidate/1306-20261125` |
| PR | #1333 — https://github.com/dikuwa/scolapro/pull/1333 |
| Head SHA | `5f62fcc3` (code head `9f5c1d48` + this handback document) |
| Commits ahead of `main` | 310 |
| Diff vs `main` | 83 files, +9284 / −136 |
| Migrations added | 10 |
| Contains `main` | yes (`298a8c7d` is an ancestor) |
| Contains #1315 (`7afaeccc`) | **no** — QA-only, excluded by design |
| Contains #1328 (`fe79f46c`) | **no** — QA-only, evidence-only, excluded by design |

### Included workstreams

- Admissions: #1323, #1325, #1327
- Assessment/grading: #1312, #1314, #1317, #1318, #1330 (grading-definition provenance hardening)
- Guardian absence notices: #1329
- Year-end progression: #1331
- Library: #1305, #1321
- Staff leave: #1308
- Control room execution record: #1332

### Migration ordering

Checked on the combined candidate: no duplicate versions, lexicographic timestamp
order is valid, and dependency order holds — `#1318` term-applicability precedes the
grading-definition provenance migration, and the guardian control migration lands
after its prerequisites. Database CI (`supabase db reset` + full pgTAP) passes on the
combined candidate, which is the authoritative ordering proof.

## Gate results (combined candidate)

Exact accepted HEAD: `5f62fcc3`. Gates below were run at `9f5c1d48` and again at
`5f62fcc3`, whose only change is this documentation file; both runs are green.

| Gate | Result | Run |
| --- | --- | --- |
| Application tests (`node --test`) | pass — 1806 tests (1805 pass, 0 fail, 1 pre-existing skip) | CI `45764017153`, `45765789308` |
| Typecheck / lint / UI regression | pass | CI `45764017153`, `45765789308` |
| Database (`db reset` + pgTAP) | pass — 521 files / 6365 tests | Database `45764017137`, `45765789414` |
| Authenticated E2E | pass — **102 tests**, 0 failed, 0 flaky | E2E `45764017180`, `45765789472` |

`destructive-confirmation-replay` passes on first attempt (1.5 s) on the candidate; the
fix lives on this branch and the previously observed 16.4 s first-attempt failure is
no longer reproducible.

## Real defects found and fixed during acceptance

Each was reproduced from populated synthetic browser evidence or exact-HEAD
inspection, not inferred.

### Guardian absence notices (#1329)

1. **Notice silently dropped for its own submitter.** The parent query used an inner
   join on `learners`; when the learner row is not independently readable the notice
   vanished despite a 200. Changed to a left join with a neutral label so a notice can
   never disappear from its own list.
2. **Successive review actions used a stale baseline.** Review actions did not
   revalidate the server-rendered page, so the next transition submitted the
   pre-transition state. Review actions now refresh.
3. **Guardian's own child shown as a generic label.** The join cannot read the learner
   row for this role, so every history card fell back to a placeholder even though the
   canonical family overview already supplies the child's name. The history now uses
   that authoritative name.
4. **Review-queue refresh race in acceptance.** Not a product defect — the spec now
   waits on the re-rendered control and scopes assertions to the notice's own card.

### Year-end progression (#1331)

1. **Publish confirmation never submitted.** The form never carried the `confirmation`
   token the governed action requires, so every rollover was rejected and the refusal
   was never rendered. The checkbox now drives the submitted token and refusals render
   inline.
2. **Workspace never refreshed after a decision.** Each transition changes the row and
   unlocks the next step, but the client did not re-read the server component.
3. **Override could not be saved for a destination-grade-only change.** Save stayed
   disabled whenever the outcome matched, though the canonical override accepts that
   change. Now compared against the captured grade baseline.
4. **Published rollover disappeared.** Publishing closes the source enrolment, and a
   closed enrolment is not readable by every actor, so the row and receipt vanished.
   Receipts are now read from the append-only publication table and shown in a
   dedicated section, scoped by the progression's **source** grade.
5. **Restricted receipt label never applied.** `formatLearnerName` defaults to
   `"Learner"`, which is truthy, so the neutral label was silently discarded.
6. **One bad rule set blanked the whole workspace.** Bulk readiness is now non-fatal
   per grade/rule set.
7. **Publication query referenced a non-existent column** (`destination_grade_code`);
   publications only carry `destination_grade_id`.

### Acceptance-harness corrections (not product defects)

- Section-level `scrollWidth` cannot see shell-induced overflow; both guardian and
  progression responsive tests now measure the **document** and name the offending
  elements.
- Element screenshots of `main` are clipped by sticky top/bottom chrome and cannot
  evidence layout. Progression evidence now uses full-page captures at 390/768/1440 in
  both themes.
- Tenant-isolation test never opened the offering `Picker`, so it passed even if
  another tenant's offerings were present. It now asserts from the opened list.

## Visual evidence

Full-page captures at **390, 768 and 1440 px** in **light and dark** are attached to
the passing E2E run (`45764017180`) for:

- progression workspace (390/768/1440 × light/dark)
- guardian absence history and staff review surfaces (390/768/1440 × light/dark)
- school grading scales, official-result approval and register surfaces

Verified from the actual captures: no horizontal overflow, no clipped content, correct
hierarchy (page/section/record), restrained radii, semantic tokens, and parity between
light and dark. The mid-page bar visible in full-page captures is a known artifact of
fixed positioning in full-page screenshots, not a layout defect; the shell provides
`pb-24` mobile clearance above the fixed bottom navigation.

## CodeRabbit reconciliation (exact HEADs)

Reconciled against current branch heads, not prior handback SHAs.

**#1325** — 5 substantive findings, all already resolved at HEAD: editor closes via a
remount key identifying the saved application; hidden expected-note baseline captured
at edit start and never refreshed from props; RPC compares expected status, note and
review timestamp; pending state disables fields and Cancel.

**#1327** — 7 substantive findings, all already resolved at HEAD: fixture uses a random
UUID so reruns cannot collide with a closed enrolment; fixed synthetic enrolment date
so the test survives year rollover; preferred name rendered only for a new identity;
per-instance `DateField` ids; Cancel disabled while pending; ScolaPro `CheckboxField`
instead of a browser checkbox.

**#1329 / #1331 / #1333** — no substantive CodeRabbit threads at their current heads.

**#1315 (QA-only — not merged)** — 18 findings reviewed read-only. The test-isolation
findings that apply to files also present on the candidate were resolved there:
global active-scale count replaced with version-specific assertions, fixture bands
created while the scale is `draft` and guarded by `not exists` before the finality
trigger, negative-fixture replay guarded the same way, and the tenant-isolation picker
assertion fixed. Remaining #1315 items are grading-policy or QA-fixture concerns on
that branch and remain untouched by design.

## Owner / Control Room decisions still required

1. **Grading-scale effective-period policy.** Whether a scale applies to a term by
   *term-end date* versus *result date* is an academic-policy decision. Current code
   enforces term-end applicability consistently in both the loader and the RPC and
   fails closed. No national/DNEA rule was invented.
2. **Retrospective activation after term end.** Whether a school may activate a scale
   for a term that has already ended is a policy choice and remains unimplemented.
3. **Merge order** (recommended): #1325 → #1327 · #1314 → #1312 → #1317 → #1318 → #1330
   · #1305 → #1321 · #1308 · #1329 · #1331 · #1332 · then the combined candidate.
   Library #1305/#1321 both touch `class-operations.tsx` and `library-workspace.tsx`;
   merge sequentially and re-verify.
4. **#1315 / #1328** must not be merged; #1328 is evidence only.

## Not verified

- No deployment, production migration or shared-environment execution was performed.
- Live guardian email delivery was not exercised; the local mail-capture preflight
  passes but no real provider send was attempted.
- Real-data UAT is out of scope; all evidence is synthetic.
- Policy items 1–2 above are deliberately unimplemented pending approval.

## Completion contract

```text
STATUS: IN PROGRESS
WORKSTREAM: #1306 combined acceptance (admissions, assessment/grading, guardian notices, progression, library, staff leave)
BRANCH: release-candidate/1306-20261125
BASE MAIN: 298a8c7de48dec957dc4b9c1d769d571b351eb3c
HEAD SHA: 5f62fcc3b65124c7dd8fe3d5949dc7bf6d6ee4f9
PR: #1333 https://github.com/dikuwa/scolapro/pull/1333
CI: application pass (1806 tests, 1805 pass, 0 fail) · database pass (pgTAP 521 files / 6365 tests) · authenticated E2E pass (102 tests, 0 flaky)
MIGRATIONS: 10 added; ordering verified by Database CI on the combined candidate
FILES/AREAS TOUCHED: src/features/{admissions,assessment,parents,progression,attendance,library}, src/app/{school,assessment,parent}, e2e/*, 10 migrations, matching pgTAP/tests
ACCEPTANCE VERIFIED: combined RC gates above; document-level overflow at 390/768/1440 light+dark; populated synthetic browser flows for admissions, grading, guardian, progression; exact-HEAD CodeRabbit reconciliation; flake verified fixed on first attempt
NOT VERIFIED: deployment, production migration, live guardian email delivery, real-data UAT
DEPENDENCIES: all functional branches merged into the candidate; owner policy decisions 1–2 outstanding
CONFLICT CHECK: only shared high-conflict files are navigation, class-operations and library-workspace; no other stream owns them now
SAFE TO MERGE: NO — awaiting Control Room acceptance and policy decisions 1–2
NEXT UNLOCKED WORK: owner decisions on grading effective-period policy; then merge-order execution per item 3
```

`STATUS: IN PROGRESS` (not `DONE`) is deliberate: required CI is green and the feature
work is complete, but Control Room acceptance and two policy decisions are still
outstanding, and the completion contract forbids reporting DONE while those remain
unresolved.
