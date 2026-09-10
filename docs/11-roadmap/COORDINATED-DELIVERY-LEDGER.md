# Coordinated delivery ledger

Baseline: `01dec838a0dfc3cb93dd5a4b3a3720203e8cded0` (`main`, 10 September 2026), including merged PRs #400 and #401.

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
- PR #399 — docs-only canonical reconciliation for the 10 September Absence/LTSM/UI directive.
- PR #402 — active implementation of the Absence Reviews operational workspace gap.
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
- PR #400 — Academic Setup/Conduct alignment and transparent brand-colour route-loader correction, merged as `870a4ef8d4830ebe8ffdf923102f48ae2a90cca2`.
- PR #401 — `/library` operational Library / Textbooks workspace over the canonical LTSM backend/domain, merged as `01dec838a0dfc3cb93dd5a4b3a3720203e8cded0`; no migration added.

PR #371 was closed unmerged and is not source evidence.

T08/T09 learner-photo behavior predates this reconciliation and remains integrated/source-evidenced in current-main ancestry; do not create duplicate work merely because live provider/browser acceptance remains.

## Runtime/security deployment reconciliation

The production reconciliation completed after PR #394 confirmed connected-production migration parity through the runtime/security wave:

- `20260909153000_subject_attendance_cycle_day_resolution.sql`
- `20260909170000_retire_legacy_official_result_comparison.sql`
- `20260909201500_conduct_late_arrival_enrolment_period_hardening.sql`
- `20260910032000_enrolment_progression_school_local_authority.sql`
- `20260910050000_library_circulation_school_local_date_hardening.sql`

These migrations are **no longer DEPLOYMENT-GATED solely for parity through #394**. The completed reconciliation proves migration parity, not live browser/device/real-data acceptance. Do not replay already-applied DDL because historical ledger timestamps/names differ. PR #401 added no migration.

| PR | Area | Source state | Production migration state | Live acceptance state |
|---|---|---|---|---|
| #388 | Subject attendance | COMPLETE / SOURCE-VERIFIED | PARITY RECONCILED | LIVE-QA-GATED where browser/device/real-data attendance scenarios remain unexercised |
| #391 | Official-result comparison | COMPLETE / SOURCE-VERIFIED | PARITY RECONCILED | LIVE-QA-GATED for unexercised application/external-interface scenarios |
| #392 | Conduct/late arrival | COMPLETE / SOURCE-VERIFIED | PARITY RECONCILED | LIVE-QA-GATED where browser/device/real-data conduct scenarios remain unexercised |
| #393 | Admissions/transfers/progression | COMPLETE / SOURCE-VERIFIED | PARITY RECONCILED | LIVE-QA-GATED where browser/device/real-data workflow scenarios remain unexercised |
| #394 | Library circulation backend | COMPLETE / SOURCE-VERIFIED | PARITY RECONCILED | LIVE-QA-GATED where populated browser/device/real-data circulation scenarios remain unexercised |
| #401 | Library / Textbooks operational UI | COMPLETE / INTEGRATED | NO MIGRATION | LIVE-QA-GATED where browser/device/populated-real-data scenarios remain unexercised |

## 10 September product directive

Canonical directive: `docs/11-roadmap/2026-09-10-ABSENCE-LTSM-UI-DIRECTIVE.md`.

### Absence Reviews

`/school/absence-reviews` becomes the school absenteeism operational workspace. PR #402 is the active implementation lane.

- Official daily/register absences must be visible with or without a parent notice.
- Subject-period absences must also be visible.
- Daily/register and subject-period attendance remain separate authoritative datasets with separate counts/views.
- Subject-period absence never inflates official daily/statutory absence.
- Parent notices primarily contextualize official daily/register absences and do not silently rewrite attendance.
- Subject-period records remain lesson-level evidence.
- Late-arrival/detention remains a third separate operational domain.

Authorization remains bounded:

- school leadership/review roles may manage guardian notice reviews according to existing authority;
- teachers/class teachers receive only appropriate absenteeism awareness within existing learner/class scope;
- subject teachers receive subject-period visibility only within existing subject/timetable authority;
- Absence Reviews must not infer new school-wide learner access or new correction/approval authority.

Classification: **ACTUAL IMPLEMENTATION GAP — ACTIVE PR #402** until merged source implements the approved workspace.

### LTSM / Library

The backend/domain foundation remains canonical. PRs #379 and #394 remain authoritative for subject integrity, loan-return finality, school-local circulation authority and Namibia-local lifecycle/effective-date semantics.

PR #401 is merged. `/library` is now **COMPLETE / INTEGRATED** as the canonical operational Library / Textbooks route. No duplicate `/ltsm` or `/textbooks` route is required. PR #401 added no migration. Live browser/device/populated-real-data acceptance remains **LIVE-QA-GATED** where not exercised.

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
| Absence Reviews | ACTUAL IMPLEMENTATION GAP — ACTIVE PR #402 | Approved school absenteeism workspace expansion defined by the 10 September directive. |
| Conduct/late arrival | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | #392 source and production parity complete; live acceptance remains where unexercised. |
| Admissions/transfers/progression | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | #393 source and production parity complete; live workflow acceptance remains. |
| LTSM/library backend | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | #379/#394 backend/domain integrity integrated and #394 migration parity reconciled. |
| Library / Textbooks operational UI | COMPLETE / INTEGRATED; LIVE-QA-GATED | PR #401 merged `/library` over the canonical backend; no duplicate route or migration; live browser/device/populated-real-data acceptance remains where unexercised. |
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

The approved 10 September directive leaves one confirmed current source gap:

1. **Absence Reviews operational expansion — active PR #402**, including separately counted/viewed official daily/register and subject-period absenteeism while preserving distinct authoritative datasets and existing authorization boundaries.

Library / Textbooks is no longer an implementation gap: PR #401 is merged and `/library` is COMPLETE / INTEGRATED. PR #400 is also merged and is not an implementation gap. N06 remains SOURCE-GATED. N11 and T12 remain REQUIREMENTS-GATED.

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