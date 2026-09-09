# ScolaPro Implementation Status

> Living handoff document. Read with `ARCHITECTURE-ROADMAP.md`, `CONTROL-ROOM.md`, the coordinated delivery ledger and relevant domain/design documents before proposing new architecture or duplicate work.

Last updated: **9 September 2026**

Current reconciled `main`: `186fd1cde778ff3ab872361b4a83cb42d03221bf` (through PR #381).

## Status meanings

- **COMPLETE / INTEGRATED** — implemented and merged in source.
- **SOURCE-VERIFIED** — repository tests/CI or bounded source audit verified the stated behavior.
- **DEPLOYMENT-GATED** — required source exists but connected deployment parity is not reconciled.
- **SOURCE-GATED** — implementation waits for verified authoritative source material.
- **REQUIREMENTS-GATED** — implementation waits for authoritative functional requirements.
- **LIVE-QA-GATED** — source/deployment exist; provider/browser/device/real-data acceptance remains.
- **ACTUAL IMPLEMENTATION GAP** — required documented behavior is absent from source and not blocked by another gate.

## Current implementation mode

The major backend/domain foundation pass is integrated through PR #381. Current source includes N02–N05, N07–N10, N12–N25 bounded foundations plus post-roadmap security/integrity hardening for guardian claims, LTSM/library, finance/contributions and platform onboarding.

The connected `scolapro` Supabase migration ledger was re-read on 9 September 2026 and contains the late integrated source slices through `20260909002000 platform_onboarding_invitation_hardening`. No current-main migration through PR #381 is presently classified DEPLOYMENT-GATED solely from migration parity.

Remaining work is primarily LIVE-QA-GATED, SOURCE-GATED, REQUIREMENTS-GATED, or explicit bounded extension work. No ungated roadmap-domain ACTUAL IMPLEMENTATION GAP was confirmed in this reconciliation.

## Roadmap status

| ID | Classification | Evidence / remaining constraint |
|---|---|---|
| N01 | COMPLETE / STANDING ARCHITECTURE | Capture once; derive everywhere. |
| N02 | COMPLETE / INTEGRATED | Education authority/region/circuit/cluster hierarchy. |
| N03 | COMPLETE / INTEGRATED | Versioned/effective-dated external school identifiers. |
| N04 | COMPLETE / SOURCE-VERIFIED | Network membership/scope integrated; historical authorization hardened by PR #376. |
| N05 | COMPLETE / INTEGRATED; LIVE-QA-GATED | Statutory lifecycle/readiness/snapshot/certification/network review. |
| N06 | SOURCE-GATED | Verified current Fifteenth School Day/AEC/Ministry form mappings/rules are still absent. |
| N07 | COMPLETE / INTEGRATED | Operational statutory snapshots reuse canonical facts. |
| N08 | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | DNEA readiness/review/hardening integrated. |
| N09 | COMPLETE / INTEGRATED | Examination-centre model independent from school. |
| N10 | COMPLETE / INTEGRATED | Restricted examination-access arrangements. |
| N11 | REQUIREMENTS-GATED | Authoritative subject/coursework/moderation requirements remain absent. |
| N12 | COMPLETE / INTEGRATED; LIVE-QA-GATED | Frozen exam registration/results ingest integrated; external production contract not claimed. |
| N13 | COMPLETE / INTEGRATED | Staffing establishment/vacancy. |
| N14 | COMPLETE / INTEGRATED | Staffing reconciliation/aggregates. |
| N15 | COMPLETE / INTEGRATED | Lean hostel/feeding foundation. |
| N16 | COMPLETE / SOURCE-VERIFIED | Inclusion/SEN aggregate reporting with non-leakage. |
| N17 | COMPLETE / INTEGRATED; LIVE-QA-GATED | Calendar teaching-impact semantics. |
| N18 | COMPLETE / INTEGRATED; LIVE-QA-GATED | Effective-dated seasonal/day-specific bell schedules. |
| N19 | COMPLETE / SOURCE-VERIFIED | Bell fixtures/tests. |
| N20 | COMPLETE / INTEGRATED | Versioned control templates/cycles/evidence/audit. |
| N21 | COMPLETE / SOURCE-VERIFIED | Official-result symbol distribution and compatible comparison read models. |
| N22 | COMPLETE FOUNDATION; LIVE-QA-GATED | Shared school identity/document print chrome exists; bounded document QA/polish remains. |
| N23 | COMPLETE ASSET BASELINE; LIVE-QA-GATED | Official committed ScolaPro/school assets exist; no fabricated replacements. |
| N24 | COMPLETE / SOURCE-VERIFIED | Canonical metric registry/network-safe aggregate foundation and bounded expansion. |
| N25 | COMPLETE BOUNDED FOUNDATION / SOURCE-VERIFIED | Circuit/regional aggregate read model integrated; further expansion requires explicit purpose/disclosure requirements. |
| N26 | COMPLETE / CLOSED | Previously missing directive content reconciled. |

## Foundation / tenancy / onboarding

| Area | Classification | Notes |
|---|---|---|
| PostgreSQL/Supabase baseline | COMPLETE / INTEGRATED | Source-controlled migrations/RLS/RPC architecture established. |
| Tenant isolation | SOURCE-VERIFIED; LIVE-QA-GATED | RLS/integrity boundaries exist; scenario-specific live acceptance may remain. |
| Platform tenant/school onboarding | SOURCE-VERIFIED | PR #381 preserves platform/school admin boundaries and canonical provisioning semantics. |
| School invitations | SOURCE-VERIFIED | PR #381 makes consumed same-user replay idempotent and freezes accepted grant identity/role; revoked/expired/cross-identity paths remain denied. |
| Education network | COMPLETE / SOURCE-VERIFIED | N02–N04 plus PR #376. |
| Canonical metric registry | COMPLETE / SOURCE-VERIFIED | N24 via PRs #370/#373. |
| Network operational analytics | COMPLETE BOUNDED FOUNDATION / SOURCE-VERIFIED | N25 via PR #374 plus PR #376. |
| Notifications | SOURCE-VERIFIED | Recipient-specific authorization and relationship integrity. |
| Communications delivery | SOURCE-VERIFIED; LIVE-QA-GATED | Durable outbox/retry/attempt/receipt and secret-free route metadata; real provider path not yet claimed. |

## Learner, staff, timetable and attendance

| Area | Classification | Notes |
|---|---|---|
| Learner identity/enrolment | COMPLETE FOUNDATION; LIVE-QA-GATED | Long-lived identity/effective enrolment. |
| Learner operational profile | COMPLETE; LIVE-QA-GATED | Governed identity correction separated from profile editing. |
| Academic structure | COMPLETE FOUNDATION; LIVE-QA-GATED | Grades/classes/subjects and correction-safe semantics. |
| Staff identity/placements | COMPLETE FOUNDATION | Tenant-wide identity plus effective school placements. |
| Staffing establishment | COMPLETE / INTEGRATED | N13/N14. |
| Timetable | COMPLETE FOUNDATION; LIVE-QA-GATED | Offerings, allocations, rooms, conflicts and cycle/calendar architecture. |
| Bell/calendar integration | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | N17–N19 + T04/T05; PR #375 runtime consistency is merged. |
| Daily/weekly/subject attendance | COMPLETE FOUNDATION; LIVE-QA-GATED | Separate official daily and subject-period semantics retained. |

## Guardians, parents and communications

| Area | Classification | Notes |
|---|---|---|
| Guardian identities/relationships | COMPLETE FOUNDATION | Reusable identities/effective relationships. |
| Parent account claim | SOURCE-VERIFIED | PR #378 requires a current effective matching guardian email and learner relationship. |
| Parent portal | COMPLETE FOUNDATION; LIVE-QA-GATED | Published results/reports/finance/direct messages. |
| Communication recipient resolution | SOURCE-VERIFIED | Parent/app recipients resolve through authoritative guardian-user and current enrolment relationships. |
| Guardian/import reconciliation | COMPLETE FOUNDATION; LIVE-QA-GATED | Source-preserving staging/reconciliation architecture. |

## Learner conduct, support, inclusion and LTSM

| Area | Classification | Notes |
|---|---|---|
| Conduct/achievement | COMPLETE / INTEGRATED; LIVE-QA-GATED | Governed incident/achievement workflow; PR #375 consistency fixes merged. |
| Learner support | COMPLETE FOUNDATION; LIVE-QA-GATED | Restricted/highly restricted support data remains separate from aggregates. |
| Inclusion/SEN aggregates | COMPLETE / SOURCE-VERIFIED | N16 aggregate-only/non-leakage model. |
| LTSM resource catalog/loans | SOURCE-VERIFIED | PR #379 binds subject-linked titles to canonical subjects and makes completed return/lost lifecycle final/idempotent. |

## Admissions, examinations, finance and progression

| Area | Classification | Notes |
|---|---|---|
| Admissions/transfers | COMPLETE FOUNDATION; LIVE-QA-GATED | Source-preserving pre-enrolment/transfer workflow. |
| Promotion/progression | COMPLETE FOUNDATION; LIVE-QA-GATED | Versioned deterministic rules and governed year-end progression. |
| DNEA readiness | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | N08 integrated/hardened. |
| Examination centres | COMPLETE / SOURCE-VERIFIED | N09 integrated; centre is not assumed to equal school. |
| Examination access arrangements | COMPLETE / INTEGRATED; LIVE-QA-GATED | N10 restricted individual-data scope. |
| Exam registration/results ingest | COMPLETE / INTEGRATED; LIVE-QA-GATED | N12 frozen submission + governed canonical result ingest. |
| Official result comparisons | COMPLETE / SOURCE-VERIFIED | N21 plus later authorization correction present in connected ledger. |
| Finance/contributions | SOURCE-VERIFIED | PR #380 hardens enrolment validity, issued-invoice identity and governed terminal transitions; existing payment/allocation/reversal remains authoritative. |

## Academic assessment and report cards

| Area | Classification | Notes |
|---|---|---|
| Assessment schemes/components | COMPLETE FOUNDATION; LIVE-QA-GATED | Versioned scheme architecture. |
| Working marks/moderation engine | COMPLETE FOUNDATION; LIVE-QA-GATED | Append-only revisions and governed moderation/lock lifecycle. This does not satisfy N11's missing authoritative coursework/moderation requirements. |
| Official results | COMPLETE FOUNDATION | Approved immutable provenance. |
| Report-card snapshots | COMPLETE FOUNDATION; LIVE-QA-GATED | Immutable approved-result/attendance/rule/template provenance. |
| Certification/publication | COMPLETE FOUNDATION; LIVE-QA-GATED | Exact snapshot versions certified/published. |
| Durable bulk reports/artifacts | COMPLETE FOUNDATION; LIVE-QA-GATED | Durable generation/certify/publish/PDF/HTML artifact pipeline exists. |
| N22/N23 document identity/assets | COMPLETE FOUNDATION / ASSET BASELINE; LIVE-QA-GATED | Further visual/print/browser QA belongs to bounded document lane. |

## Statutory / EMIS / structural operations

| Area | Classification | Notes |
|---|---|---|
| Form registry/cycles | COMPLETE FOUNDATION | Effective-dated definitions/versions/reporting cycles. |
| Generic mapping compiler | COMPLETE FOUNDATION | Declarative source→target compiler; no invented Ministry fields. |
| Authoritative Fifteenth School Day/AEC mappings | SOURCE-GATED | N06 gate remains unresolved. |
| Staffing establishment/vacancies | COMPLETE / INTEGRATED | N13/N14. |
| Hostel/feeding | COMPLETE / INTEGRATED | N15. |
| Inclusion aggregates | COMPLETE / SOURCE-VERIFIED | N16. |
| Control forms | COMPLETE / INTEGRATED | N20. |
| Canonical metrics/network aggregates | COMPLETE / SOURCE-VERIFIED | N24/N25. |

## Deployment and live-QA state

Connected `scolapro` Supabase migration evidence on 9 September 2026 includes late roadmap/security migrations through PR #381. Earlier governance text claiming the later 7–8 September roadmap slices were absent is stale.

**DEPLOYMENT-GATED ITEMS: none confirmed through current main migration parity.**

This does not make every workflow live-verified. Remaining LIVE-QA-GATED areas include:

- real communications provider onboarding/send/webhook receipt;
- browser/device/real-data acceptance for parent/guardian, timetable/calendar, attendance, statutory/DNEA and report/document workflows where not already exercised;
- external Ministry/DNEA production-interface acceptance where no production contract has been tested;
- document/report visual/print/browser acceptance when the document lane resumes.

## N06 decision

**KEEP SOURCE-GATED.** Later source work supplies canonical operational facts, fixed-date snapshots and a generic mapping compiler but not verified current Ministry form field definitions, codes, validation rules or official export layout. That external source gate remains unsatisfied.

## N11 decision

**KEEP REQUIREMENTS-GATED.** The repository has generic assessment and moderation mechanics, but no authoritative subject/coursework requirement matrix, evidence obligations, moderation stages/thresholds or official output contract from which N11 can be implemented without inference.

## Remaining-source conclusion

No ungated roadmap-domain ACTUAL IMPLEMENTATION GAP was found after re-enumerating source through PR #381.

Priority remaining work:

1. LIVE-QA-GATED communications provider E2E verification.
2. LIVE-QA-GATED browser/device/real-data verification for integrated workflows.
3. Bounded document/report visual/print QA under explicit ownership.
4. N24/N25 extension only when an authoritative metric/read-model need and disclosure policy are defined.
5. N06/N11 implementation only after their respective external gates are satisfied.

## Active parallel work

PR #375 is merged. The current separate UI package is draft PR #382 (`chatgpt/ui-consistency-package-c`). Do not absorb that UI scope into roadmap/domain governance work.

## Takeover rule

Before starting implementation, inspect current `main` and these governance documents. Do not recreate integrated N02–N05, N07–N10, N12–N25 foundations; do not duplicate authoritative learner/staff/support/exam/statutory facts; do not infer N06 mappings or N11 coursework requirements; and do not confuse live/deployment verification with missing source implementation.