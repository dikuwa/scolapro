# ScolaPro Implementation Status

> Living handoff document. Read with `ARCHITECTURE-ROADMAP.md`, `CONTROL-ROOM.md`, the coordinated delivery ledger and relevant domain/design documents before proposing new architecture or duplicate work.

Last updated: **9 September 2026**

Current reconciled `main`: `05f55fefffce2648634dcc85824aeb02164c01a8` (through PR #386).

## Status meanings

- **COMPLETE / INTEGRATED** — implemented and merged in source.
- **SOURCE-VERIFIED** — repository tests/CI or bounded source audit verified the stated behavior.
- **DEPLOYMENT-GATED** — required source exists but connected deployment parity is not reconciled.
- **SOURCE-GATED** — implementation waits for verified authoritative source material.
- **REQUIREMENTS-GATED** — implementation waits for authoritative functional requirements.
- **LIVE-QA-GATED** — source/deployment exist; provider/browser/device/real-data acceptance remains.
- **ACTUAL IMPLEMENTATION GAP** — required documented behavior is absent from source and not blocked by another gate.

## Current implementation mode

The major backend/domain foundation pass remains integrated. Current source includes N02–N05, N07–N10, N12–N25 bounded foundations plus post-roadmap security/integrity hardening for guardian claims, LTSM/library, finance/contributions and platform onboarding.

UI/runtime reconciliation has advanced through merged PR #382, T06 via merged PR #385, and T07 via merged PR #384. T08/T09 learner-photo preview/pending and upload/link diagnostic behavior was already integrated before those PRs and is source-evidenced in the ancestry of current `main`, including commit `5e006ed7a8488ac3510c2eacefc8ab720e0ccc12`.

N22/N23 document QA advanced through merged PR #386, which corrected shared browser-print pagination and continuation table headers. That PR source/visually exercised a representative 70-row paged-media class-list fixture, but did not exercise live Chromium print, dark-theme print, app-generated PDF bytes, browser print page-number/header parity or optional backdrop rendering.

**No confirmed ungated roadmap ACTUAL IMPLEMENTATION GAP remains on current `main` through PR #386.** Remaining work is LIVE-QA-GATED, SOURCE-GATED, REQUIREMENTS-GATED, or explicit bounded extension/QA work.

## T/C roadmap status

| ID | Classification | Evidence / remaining constraint |
|---|---|---|
| T01 | COMPLETE / INTEGRATED; LIVE-QA-GATED | Weekday/rotating-cycle foundation exists; runtime/device acceptance may remain. |
| T02 | COMPLETE / INTEGRATED; LIVE-QA-GATED | Dynamic day/grid/maintenance-label behavior exists; UI acceptance remains. |
| T03 | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | Calendar resolution/anchors integrated. |
| T04 | COMPLETE / INTEGRATED | Numbered setup steps and “Anytime” teaching periods via PR #354. |
| T05 | COMPLETE / INTEGRATED | Configured subjects collapsed by default via PR #354. |
| T06 | COMPLETE / INTEGRATED; SOURCE-VERIFIED; LIVE-QA-GATED | PR #385 integrates the continuous expanded guardian-background visual correction. Source responsive/accessibility review exists; live browser/device visual acceptance was not claimed. |
| T07 | COMPLETE / INTEGRATED; SOURCE-VERIFIED; LIVE-QA-GATED | PR #384 integrates avatar JPG/JPEG/PNG/WebP handling and actionable diagnostics within the existing storage/authorization contract; live provider/browser upload acceptance may remain. |
| T08 | COMPLETE / INTEGRATED; SOURCE-VERIFIED; LIVE-QA-GATED | Existing current-main ancestry source-evidences immediate learner-photo preview plus pending overlay/disabled photo actions; browser/device acceptance remains where not exercised. |
| T09 | COMPLETE / INTEGRATED; SOURCE-VERIFIED; LIVE-QA-GATED | Existing current-main ancestry source-evidences actionable learner-photo upload/link diagnostics and failure handling; provider/real-data/browser failure scenarios remain where not exercised. |
| T10 | LIVE-QA-GATED | CRC source migrations are present in the connected ledger; route/browser acceptance remains. |
| T11 | COMPLETE / INTEGRATED; LIVE-QA-GATED | Official identity write boundaries exist; scenario acceptance may remain. |
| T12 | REQUIREMENTS-GATED | Optional administrator correction auto-approval is a deferred product decision until explicitly adopted. |
| C01–C12 | COMPLETE / INTEGRATED; LIVE-QA-GATED | Conduct source/workflow integrated; PRs #375/#382 are merged. |

## N-roadmap status

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
| N22 | COMPLETE FOUNDATION; SOURCE-VERIFIED; LIVE-QA-GATED | PR #386 corrects shared browser-print pagination and continuation table headers. Representative 70-row A4 class-list pagination was exercised; live Chromium/dark-theme print, app-generated PDF bytes and browser page-number/header parity were not. |
| N23 | COMPLETE ASSET BASELINE; SOURCE-VERIFIED; LIVE-QA-GATED | Official committed assets remain authoritative. PR #386 confirmed Namib High crest/full-logo assets but no committed/configured large A4 backdrop; optional backdrop rendering remains unverified and no artwork is to be fabricated. |
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
| Learner operational profile | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | Governed identity correction remains separate from profile editing; T08/T09 learner-photo behavior is integrated/source-evidenced. |
| Academic structure | COMPLETE FOUNDATION; LIVE-QA-GATED | Grades/classes/subjects and correction-safe semantics; PR #382 UI consistency is merged. |
| Staff identity/placements | COMPLETE FOUNDATION | Tenant-wide identity plus effective school placements. |
| Staffing establishment | COMPLETE / INTEGRATED | N13/N14. |
| Timetable | COMPLETE FOUNDATION; LIVE-QA-GATED | Offerings, allocations, rooms, conflicts and cycle/calendar architecture; PR #382 consistency changes are integrated. |
| Bell/calendar integration | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | N17–N19 + T04/T05; PRs #375/#382 runtime/UI consistency are merged. |
| Daily/weekly/subject attendance | COMPLETE FOUNDATION; LIVE-QA-GATED | Separate official daily and subject-period semantics retained. |

## Guardians, parents and communications

| Area | Classification | Notes |
|---|---|---|
| Guardian identities/relationships | COMPLETE FOUNDATION | Reusable identities/effective relationships. |
| Guardian directory presentation | COMPLETE / SOURCE-VERIFIED; LIVE-QA-GATED | PR #385 closes T06 source visual gap; live browser/device visual acceptance remains where not exercised. |
| Parent account claim | SOURCE-VERIFIED | PR #378 requires a current effective matching guardian email and learner relationship. |
| Parent portal | COMPLETE FOUNDATION; LIVE-QA-GATED | Published results/reports/finance/direct messages. |
| Communication recipient resolution | SOURCE-VERIFIED | Parent/app recipients resolve through authoritative guardian-user and current enrolment relationships. |
| Guardian/import reconciliation | COMPLETE FOUNDATION; LIVE-QA-GATED | Source-preserving staging/reconciliation architecture. |

## Learner conduct, support, inclusion and LTSM

| Area | Classification | Notes |
|---|---|---|
| Conduct/achievement | COMPLETE / INTEGRATED; LIVE-QA-GATED | Governed incident/achievement workflow; PRs #375/#382 consistency fixes merged. |
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
| N22/N23 document identity/assets | COMPLETE FOUNDATION / ASSET BASELINE; SOURCE-VERIFIED; LIVE-QA-GATED | PR #386 closes the confirmed shared browser-print pagination source defect. Remaining visual/print/browser/PDF/device scenarios are bounded QA, not a missing document foundation. |

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

The prior connected `scolapro` Supabase reconciliation confirmed migration parity through PR #381. PRs #382, #385, #384 and #386 add no database migrations, so this reconciliation introduces no new deployment-ledger migration requirement.

**DEPLOYMENT-GATED ITEMS: none newly confirmed by this docs reconciliation.**

This does not make every workflow live-verified. Remaining LIVE-QA-GATED areas include:

- real communications provider onboarding/send/webhook receipt;
- browser/device/real-data acceptance for parent/guardian, timetable/calendar, attendance, statutory/DNEA and learner-photo/avatar workflows where not already exercised;
- external Ministry/DNEA production-interface acceptance where no production contract has been tested;
- N22/N23 live Chromium/browser print, dark-theme print, actual app-generated report-card/class-list PDF bytes, browser print page numbering/repeated-header parity, and optional backdrop rendering when an authoritative configured asset exists;
- CRC route/browser verification now that its source migrations are present.

## N06 decision

**KEEP SOURCE-GATED.** Later source work supplies canonical operational facts, fixed-date snapshots and a generic mapping compiler but not verified current Ministry form field definitions, codes, validation rules or official export layout. That external source gate remains unsatisfied.

## N11 decision

**KEEP REQUIREMENTS-GATED.** The repository has generic assessment and moderation mechanics, but no authoritative subject/coursework requirement matrix, evidence obligations, moderation stages/thresholds or official output contract from which N11 can be implemented without inference.

## Remaining-source conclusion

**Confirmed current-main ACTUAL IMPLEMENTATION GAPS: NONE.**

T06 is integrated via PR #385. T07 is integrated via PR #384. T08/T09 were already integrated and are source-evidenced in current-main ancestry. PR #382 is merged. N22/N23 have an integrated bounded pagination correction via PR #386 with remaining unexercised scenarios correctly classified LIVE-QA-GATED.

Do not create replacement T06–T09 or N22/N23 foundation work solely because live browser/device/provider/PDF/data acceptance remains outstanding.

## Active parallel work

PRs #375 and #382 are merged. T06/T07 source work is merged via #385/#384. The document pagination correction is merged via #386. Remaining lanes must be explicitly assigned from the gated/bounded work described above rather than inferred from stale implementation-gap text.

## Takeover rule

Before starting implementation, inspect current `main` and these governance documents. Do not recreate integrated N02–N05, N07–N10, N12–N25 foundations or T06–T09 source behavior; do not duplicate authoritative learner/staff/support/exam/statutory facts; do not infer N06 mappings or N11 coursework requirements; and do not confuse live/deployment verification with missing source implementation.