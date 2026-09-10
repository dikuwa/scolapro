# Coordinated delivery ledger

Baseline: `41b4ad634c0a8f91a2e1d110aa3ecca73728d86f` (`main`, 10 September 2026), including merged PRs #402 and #404.

This ledger is governed with `docs/11-roadmap/CONTROL-ROOM.md`. Current source, approved directives and connected-environment evidence override stale chat/roadmap status.

## Classification model

- **COMPLETE / INTEGRATED** — required source foundation is merged.
- **SOURCE-VERIFIED** — repository tests/CI or bounded audit verified the stated behavior.
- **DEPLOYMENT-GATED** — required source exists but is absent/unreconciled in the connected deployment.
- **SOURCE-GATED** — implementation waits for verified authoritative source material.
- **REQUIREMENTS-GATED** — implementation waits for authoritative requirements.
- **LIVE-QA-GATED** — source/deployment exist but provider/browser/device/real-data acceptance is unverified.
- **ACTUAL IMPLEMENTATION GAP** — documented required behavior is absent from merged source and is not blocked by another gate.

## Current ownership

- Control Room / Integration — roadmap, merge order and shared-file coordination.
- N06 — SOURCE-GATED.
- N11 — REQUIREMENTS-GATED.
- T12 — REQUIREMENTS-GATED.
- N22/N23 document QA — bounded visual/print QA only when explicitly assigned.

## Integrated sequence

Integrated source through the current baseline includes the previously recorded N02–N25 foundations and later hardening/UI waves. Relevant recent checkpoints:

- PR #378 — guardian claim current-relationship hardening.
- PR #379 — LTSM/library canonical subject integrity and loan-return finality.
- PR #380 — finance invoice enrolment/terminal lifecycle hardening.
- PR #381 — platform onboarding and invitation finality/idempotence hardening.
- PR #382 — UI consistency package.
- PR #384 — T07 avatar handling/diagnostics.
- PR #385 — T06 guardian-background visual correction.
- PR #386 — N22/N23 shared browser-print pagination correction.
- PR #388 — subject-attendance runtime/date/schema/error correction.
- PR #391 — obsolete six-argument official-result comparison RPC retirement.
- PR #392 — conduct/late-arrival enrolment-period hardening.
- PR #393 — admissions/transfers/progression school-local authority hardening.
- PR #394 — library circulation school-local authority + Namibia-date hardening.
- PR #400 — Academic Setup/Conduct alignment and transparent brand-colour route-loader correction.
- PR #401 — `/library` operational Library / Textbooks workspace over the canonical LTSM backend/domain; no migration added.
- PR #402 — `/school/absence-reviews` operational absenteeism workspace plus governed attendance-scope resolver. Daily/register and subject-period absences remain separate views/counts and separate authoritative datasets; guardian explanations do not rewrite attendance; late-arrival/detention remains separate.
- PR #404 — Library live-QA source corrections: render copy `location_label` and include valid active assignment-only staff in borrower search. No migration added; Application CI #2028 passed.

PR #371 was closed unmerged and is not source evidence.

T08/T09 learner-photo behavior predates this reconciliation and remains integrated/source-evidenced in current-main ancestry; do not create duplicate work merely because live provider/browser acceptance remains.

## Runtime/security deployment reconciliation

Connected-production migration parity is **COMPLETE / RECONCILED through PR #402** on project `jhgumnvhoxmapmgotchu`.

Previously reconciled runtime/security migrations through PR #394 remain confirmed:

- `20260909153000_subject_attendance_cycle_day_resolution.sql`
- `20260909170000_retire_legacy_official_result_comparison.sql`
- `20260909201500_conduct_late_arrival_enrolment_period_hardening.sql`
- `20260910032000_enrolment_progression_school_local_authority.sql`
- `20260910050000_library_circulation_school_local_date_hardening.sql`

PR #402 added `20260910123000_absence_review_scope_authorization.sql`. The migration is present in the live ledger; `public.resolve_absence_review_scope(uuid,date,date)` is present; EXECUTE is granted to `authenticated` and denied to `anon` and `public`. The resolver is therefore no longer DEPLOYMENT-GATED. This proves migration/source parity, not browser/device/real-data acceptance. Do not replay already-applied DDL because historical ledger timestamps/names differ. PRs #401 and #404 added no migration.

| PR | Area | Source state | Production migration state | Live acceptance state |
|---|---|---|---|---|
| #388 | Subject attendance | COMPLETE / SOURCE-VERIFIED | PARITY RECONCILED | LIVE-QA-GATED where browser/device/real-data attendance scenarios remain unexercised |
| #391 | Official-result comparison | COMPLETE / SOURCE-VERIFIED | PARITY RECONCILED | LIVE-QA-GATED for unexercised application/external-interface scenarios |
| #392 | Conduct/late arrival | COMPLETE / SOURCE-VERIFIED | PARITY RECONCILED | LIVE-QA-GATED where browser/device/real-data conduct scenarios remain unexercised |
| #393 | Admissions/transfers/progression | COMPLETE / SOURCE-VERIFIED | PARITY RECONCILED | LIVE-QA-GATED where browser/device/real-data workflow scenarios remain unexercised |
| #394 | Library circulation backend | COMPLETE / SOURCE-VERIFIED | PARITY RECONCILED | LIVE-QA-GATED where populated browser/device/real-data circulation scenarios remain unexercised |
| #401 | Library / Textbooks operational UI | COMPLETE / INTEGRATED | NO MIGRATION | LIVE-QA-GATED where browser/device/populated-real-data scenarios remain unexercised |
| #402 | Absence Reviews operational workspace | COMPLETE / INTEGRATED; SOURCE-VERIFIED | PARITY RECONCILED | LIVE-QA-GATED; no browser/device/live-data acceptance claimed |
| #404 | Library live-QA source corrections | COMPLETE / INTEGRATED; SOURCE-VERIFIED | NO MIGRATION | LIVE-QA-GATED — connected production has no learning-resource titles/copies/loans; issue/return/lost/damaged and non-admin LTSM-role browser acceptance remain unverified |

## 10 September product directive

Canonical directive: `docs/11-roadmap/2026-09-10-ABSENCE-LTSM-UI-DIRECTIVE.md`.

### Absence Reviews

`/school/absence-reviews` is **COMPLETE / INTEGRATED** in source via PR #402, and its resolver migration is **PARITY RECONCILED** in connected production.

- Official daily/register absences are visible with or without a parent notice.
- Subject-period absences are visible in a separate view.
- Daily/register and subject-period attendance remain separate authoritative datasets with separate counts/views.
- Subject-period absence never inflates official daily/statutory absence.
- Parent notices contextualize attendance and do not silently rewrite the official register.
- Late-arrival/detention remains a third separate operational domain.

Authorization is bounded by the merged governed resolver:

- `school_admin`, `principal`, `deputy_principal` — school-wide attendance awareness according to existing authority;
- `class_teacher` — assigned register-class daily scope;
- `teacher` — explicit subject/timetable allocation scope only;
- `hod` — explicit teaching allocation scope only; no invented school-wide/department-wide scope;
- counsellor guardian-notice review authority does not imply attendance scope;
- cross-school attendance scope is denied;
- evidence/correction authority remains separate.

Do not reopen this source implementation without new repository evidence of a defect.

### LTSM / Library

The backend/domain foundation remains canonical. PRs #379 and #394 remain authoritative for subject integrity, loan-return finality, school-local circulation authority and Namibia-local lifecycle/effective-date semantics.

PR #401 merged `/library` as the canonical operational Library / Textbooks route. PR #404 then corrected two live-QA-discovered source defects: copy location labels are rendered, and borrower search now includes active staff reachable through effective `staff_school_assignments` as well as effective `school_memberships`. No duplicate `/ltsm` or `/textbooks` route is required. Neither #401 nor #404 added a migration.

Library source is **COMPLETE / INTEGRATED** after #404. Live circulation acceptance remains **LIVE-QA-GATED**: connected production currently has no learning-resource titles/copies/loans, so issue/return/lost/damaged behavior was not exercised against operational records. Principal/deputy/librarian/ltsm browser-role acceptance remains unverified where no test memberships/credentials were available.

### Live UI

PR #400 is merged. Academic Setup form alignment, Conduct filter-row alignment and the transparent primary/brand-colour route loader are **COMPLETE / INTEGRATED** in source. Live browser/device acceptance remains **LIVE-QA-GATED** where those scenarios were not re-tested.

## T/C roadmap reconciliation

| ID | Classification | Remaining constraint |
|---|---|---|
| T01 | COMPLETE / INTEGRATED; LIVE-QA-GATED | Weekday/rotating cycle foundation exists; runtime/device acceptance may remain. |
| T02 | COMPLETE / INTEGRATED; LIVE-QA-GATED | Dynamic day/grid behavior exists; UI acceptance may remain. |
| T03 | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | Calendar resolution/anchors integrated. |
| T04 | COMPLETE / INTEGRATED | Numbered setup steps and “Anytime” teaching periods integrated. |
| T05 | COMPLETE / INTEGRATED | Configured subjects collapsed by default. |
| T06–T09 | COMPLETE / INTEGRATED; SOURCE-VERIFIED; LIVE-QA-GATED | Source-integrated/evidenced; provider/browser/device acceptance remains where not exercised. |
| T10 | LIVE-QA-GATED | CRC source/deployment exists; route/browser acceptance remains. |
| T11 | COMPLETE / INTEGRATED; LIVE-QA-GATED | Official identity write boundaries integrated. |
| T12 | REQUIREMENTS-GATED | Optional administrator correction auto-approval remains a deferred product decision. |
| C01–C12 | COMPLETE / INTEGRATED; SOURCE-VERIFIED; LIVE-QA-GATED | Conduct domain/workflow integrated; PR #392 migration parity is reconciled; remaining live acceptance stays separate. |

## N-roadmap classification

| ID | Classification | Remaining constraint |
|---|---|---|
| N01 | COMPLETE / STANDING RULE | Capture once; no parallel authoritative facts. |
| N02–N05 | COMPLETE / INTEGRATED | Network hierarchy/identifiers/roles/statutory lifecycle foundations integrated. |
| N06 | SOURCE-GATED | Verified current Ministry Fifteenth School Day/AEC forms/mappings/rules absent. |
| N07–N10 | COMPLETE / INTEGRATED | Statutory snapshots, DNEA readiness, examination centres and restricted access arrangements integrated. |
| N11 | REQUIREMENTS-GATED | Authoritative subject/coursework/moderation requirements absent. |
| N12–N20 | COMPLETE / INTEGRATED | Frozen exam registration/results, staffing, hostel/feeding, inclusion, calendar/bell, control-form foundations integrated. |
| N21 | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | Canonical official-result comparisons integrated; PR #391 migration parity reconciled; unexercised external/live acceptance remains. |
| N22/N23 | COMPLETE FOUNDATION / ASSET BASELINE; SOURCE-VERIFIED; LIVE-QA-GATED | Shared document identity/assets and pagination correction integrated; bounded live print/PDF/device QA remains. |
| N24/N25 | COMPLETE / SOURCE-VERIFIED | Canonical metrics and bounded network operational analytics integrated. |
| N26 | COMPLETE / CLOSED | Requirement reconciliation complete. |

## Cross-domain classification

| Area | Classification | Evidence / remaining work |
|---|---|---|
| Subject attendance | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | #388 source and production parity complete; live browser/device/real-data acceptance remains where unexercised. |
| Absence Reviews | COMPLETE / INTEGRATED; SOURCE-VERIFIED; LIVE-QA-GATED | #402 source and production migration parity complete; browser/device/live-data acceptance not claimed. |
| Conduct/late arrival | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | #392 source and production parity complete; live acceptance remains where unexercised. |
| Admissions/transfers/progression | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | #393 source and production parity complete; live workflow acceptance remains. |
| LTSM/library backend | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | #379/#394 backend/domain integrity integrated and #394 migration parity reconciled. |
| Library / Textbooks operational UI | COMPLETE / INTEGRATED; SOURCE-VERIFIED; LIVE-QA-GATED | #401 merged the canonical `/library` UI; #404 corrected location rendering and assignment-only staff borrower discovery. No migration. Live circulation and non-admin role browser acceptance remain unverified under current production data/test-role constraints. |
| Timetable/Academic Setup UI | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | PR #400 source-integrates alignment correction; live browser/device retest remains separate. |
| Conduct filter UI | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | PR #400 source-integrates filter alignment correction; live browser/device retest remains separate. |
| Route loader visual | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | PR #400 integrates transparent brand-colour loader; live visual acceptance remains separate where not re-tested. |
| Report cards/documents | COMPLETE FOUNDATION; SOURCE-VERIFIED; LIVE-QA-GATED | N22/N23 baseline plus PR #386 integrated; unexercised live print/PDF/device scenarios remain QA gates. |

## Gates

### N06
**KEEP SOURCE-GATED.** Do not invent Ministry fields, codes, rules, mappings or layouts.

### N11
**KEEP REQUIREMENTS-GATED.** Existing generic assessment/moderation infrastructure does not establish authoritative coursework obligations or official outputs.

### T12
**KEEP REQUIREMENTS-GATED.** Optional administrator correction auto-approval remains a deferred product decision.

## Remaining source-gap conclusion

No Absence Reviews source implementation or deployment-parity gap remains after merged PR #402 and the confirmed connected-production reconciliation. Reopen only if new source evidence proves a defect.

Library / Textbooks is also not an implementation gap. PR #401 is merged and PR #404 has corrected the two subsequent live-QA source defects without a migration. Current remaining Library work is live acceptance constrained by connected-production data and available role credentials, not a known source gap.

N06 remains SOURCE-GATED. N11 and T12 remain REQUIREMENTS-GATED.

Remaining work is explicitly assigned live browser/device/real-data QA and gated roadmap work; migration parity is reconciled through PR #402.

## Integration checklist

- Preserve daily/register, subject-period and late-arrival/detention as separate authoritative domains.
- Never let subject-period absence inflate official/statutory daily absence.
- Never let guardian notices silently rewrite attendance.
- Never widen learner visibility merely because Absence Reviews aggregates operational awareness.
- Reuse the canonical LTSM/library backend; do not create a second inventory/circulation model or duplicate `/ltsm`/`/textbooks` route.
- Preserve source/deployment/live-QA distinctions.
- Never recreate source features to compensate for missing live QA.
- Never replay applied DDL solely because migration ledger timestamps differ.
- Require Database CI for migration-owning PRs and exact-head required CI before merge-ready status.
- Preserve one-owner rules for shared/high-conflict files.
- Use the mandatory Control Room handback template.