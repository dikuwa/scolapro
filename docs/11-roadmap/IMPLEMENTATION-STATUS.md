# ScolaPro Implementation Status

> **Living handoff document.** Update this file whenever a meaningful implementation slice is completed or materially changes. Read this file together with `ARCHITECTURE-ROADMAP.md`, `CONTROL-ROOM.md`, the coordinated delivery ledger, domain documents and design-system documents before proposing new architecture or duplicate work.

Last updated: **8 September 2026**

Current reconciled `main`: `2de793a6ef901b48d67a5cacc197d5393deb90e7`.

## Status meanings

- **DONE / INTEGRATED** — implemented and merged into current source `main`.
- **VERIFY** — implemented but broader role/device/live-data/deployment verification remains.
- **SOURCE-GATED** — implementation must wait for verified authoritative source material.
- **REQUIREMENTS-GATED** — implementation must wait for authoritative functional requirements.
- **DEPLOYMENT WORK** — source implementation exists; production/shared environment still requires migration/configuration/runtime verification.

## Current implementation mode

The major N-roadmap backend/domain foundation pass is integrated through N21 plus the canonical metric registry/network-safe aggregate foundation. Remaining work is now primarily deployment reconciliation, bounded UI/runtime consistency, operational QA, source/requirements-gated gaps, and careful extension of network analytics through the canonical metric architecture.

## Current roadmap status

| ID | Status | Integrated evidence / remaining constraint |
|---|---|---|
| N01 | STANDING ARCHITECTURE | Capture once; derive everywhere; no parallel authoritative fact stores. |
| N02 | DONE / INTEGRATED | Education authority/region/circuit/optional cluster hierarchy via PR #355. |
| N03 | DONE / INTEGRATED | Versioned/effective-dated external school identifiers and registry links via PR #355. |
| N04 | DONE / INTEGRATED | Circuit/regional network membership and scoped school visibility via PR #355. |
| N05 | DONE / INTEGRATED / VERIFY | Statutory cycle/readiness/snapshot/certification lifecycle and network review workspace via PR #357. |
| N06 | SOURCE-GATED | Fifteenth School Day/AEC/Ministry mappings require verified current official forms/rules. Do not invent fields/codes/definitions. |
| N07 | DONE / INTEGRATED / VERIFY | Operational statutory extensions via PR #369; reuses canonical staffing, hostel/feeding, education-network and school-identifier sources while preserving frozen/reference-date semantics. |
| N08 | DONE / INTEGRATED / VERIFY | DNEA candidate readiness/review via PR #358; authorization/freshness hardening via PR #367. |
| N09 | DONE / INTEGRATED / VERIFY | Examination-centre identity/status/assignments separate from school via PR #365. |
| N10 | DONE / INTEGRATED / VERIFY | Restricted examination-access arrangements with source/status history and non-leakage boundaries via PR #366. |
| N11 | REQUIREMENTS-GATED | Coursework/moderation evidence waits for authoritative subject/assessment requirements. |
| N12 | DONE / INTEGRATED / VERIFY | Frozen/versioned examination registration submission plus governed external-result ingest into canonical `official_results` via PR #368. |
| N13 | DONE / INTEGRATED / VERIFY | Staffing establishment/vacancy foundation via PR #359; vacancy is derived from authoritative effective occupancy. |
| N14 | DONE / INTEGRATED / VERIFY | Staffing establishment operational reconciliation/aggregate summary via PR #360. |
| N15 | DONE / INTEGRATED / VERIFY | Lean hostel/feeding operational foundation and aggregates via PR #363. |
| N16 | DONE / INTEGRATED / VERIFY | Privacy-preserving inclusion/SEN aggregate reporting via PR #364; no support-case identity/note leakage. |
| N17 | DONE / INTEGRATED / VERIFY | Calendar teaching-impact semantics via PR #354. |
| N18 | DONE / INTEGRATED / VERIFY | Effective-dated seasonal/day-specific bell schedules via PR #354. |
| N19 | DONE / INTEGRATED / VERIFY | Bell-schedule fixture/test coverage via PR #354; fixtures are not universal school policy. |
| N20 | DONE / INTEGRATED / VERIFY | Versioned control templates/cycles/evidence/audit foundation via PR #362. |
| N21 | DONE / INTEGRATED / VERIFY | Official-result symbol distribution and bounded exam-series comparison read models via PR #361; canonical `official_results` only, no mark re-entry. |
| N22 | DONE FOUNDATION / VERIFY | Shared school identity/document print chrome integrated; continue only in bounded document lane. |
| N23 | DONE ASSET BASELINE / VERIFY | Official ScolaPro and school-brand assets integrated where committed; do not fabricate missing assets. |
| N24 | DONE FOUNDATION / INTEGRATED / VERIFY | Canonical metric registry and first network-safe aggregate slice integrated via PR #370. New metrics must extend this registry/read model. |
| N25 | IN PROGRESS FOUNDATION | Purpose-built network read models now have a canonical metric/network-safe aggregate foundation; extend only with explicit disclosure policy and authoritative source facts. |
| N26 | CLOSED | Previously missing directive content reconciled. |

## Foundation

| Area | Status | Notes |
|---|---|---|
| Product/domain architecture | DONE | Namibia-first multi-school model, source-of-truth map, role model and core architecture documented. |
| PostgreSQL/Supabase baseline | DONE / VERIFY | Source-controlled migrations, RLS and governed RPC architecture established. |
| Authentication | DONE | Authenticated context supports school/platform/network membership models. |
| Tenant isolation | DONE / VERIFY | RLS plus domain integrity and authorization boundaries protect major operational chains. |
| Education network | DONE / INTEGRATED / VERIFY | Shared hierarchy, effective-dated school placement, external identifiers and network-scoped school visibility are integrated. |
| Canonical metric registry | DONE FOUNDATION / INTEGRATED / VERIFY | PR #370 establishes canonical metric definitions and network-safe aggregate evaluation. |
| Design system | DONE / EVOLVING | Shared controls/tokens remain the UI baseline. |
| Notifications | DONE FOUNDATION | User-scoped notification architecture exists. |
| Account profile | DONE FOUNDATION / VERIFY | Avatar/password/account-menu foundation exists; bounded UI/runtime QA remains. |

## Learner, staff, timetable and attendance

| Area | Status | Notes |
|---|---|---|
| Learner identity/enrolment | DONE FOUNDATION / VERIFY | Long-lived learner identity and effective-dated enrolment. |
| Learner operational profile | DONE / VERIFY | Preferred/photo editing separated from governed official identity corrections. |
| Academic structure | DONE / VERIFY | Grades/classes/subjects with correction-safe semantics. |
| Staff identity | DONE FOUNDATION / VERIFY | Tenant-wide staff identity remains separate from Auth accounts. |
| Staff school assignments | DONE FOUNDATION / VERIFY | Effective-dated operational placements. |
| Staffing establishment | DONE / INTEGRATED / VERIFY | N13/N14 establishment, occupancy, vacancy and reconciliation foundation integrated. |
| Timetable | DONE FOUNDATION / VERIFY | Offerings, allocations, periods, rooms and conflict-safe slots. |
| Bell/calendar integration | DONE / INTEGRATED / VERIFY | N17/N18/N19 + T04/T05 integrated via PR #354. |
| Daily/weekly register | DONE FOUNDATION / VERIFY | Exception-first official register workflow. |
| Subject-period attendance | DONE FOUNDATION / VERIFY | Separate from official morning attendance. |
| Expected school days | DONE FOUNDATION / VERIFY | Closure/special-day semantics preserved. |

## Guardians, parents and onboarding

| Area | Status | Notes |
|---|---|---|
| Guardian identities/relationships | DONE FOUNDATION / VERIFY | Reusable identities and effective-dated relationships. |
| Parent account claim | DONE FOUNDATION / VERIFY | Exact active guardian-email claim boundary. |
| Parent portal | DONE FOUNDATION / VERIFY | Published results, reports, finance and directly delivered messages. |
| Learner/staff/guardian/academic imports | DONE FOUNDATION / VERIFY | Source-preserving governed staging/reconciliation architecture. |
| Import mutation boundary | DONE / VERIFY | Authenticated staging mutation is RPC-governed rather than direct table writes. |

## Learner conduct, support, inclusion and LTSM

| Area | Status | Notes |
|---|---|---|
| Conduct / achievement | DONE / INTEGRATED / VERIFY | Combined governed incident/achievement workflow; legacy-category reconciliation remains QA. |
| Learner support | DONE FOUNDATION / VERIFY | Restricted/highly-restricted support cases remain separate from aggregate reporting. |
| Inclusion/SEN aggregate reporting | DONE / INTEGRATED / VERIFY | N16 exposes aggregate-only school/network views without case identities/notes. |
| Resource catalog / loans | DONE FOUNDATION / VERIFY | Shared resource-copy and governed loan model. |

## Admissions, examinations, finance and progression

| Area | Status | Notes |
|---|---|---|
| Admissions / transfers | DONE FOUNDATION / VERIFY | Pre-enrolment workflow and source-preserving transfers. |
| Promotion / progression | DONE FOUNDATION / VERIFY | Versioned deterministic rules and governed year-end progression. |
| DNEA readiness | DONE / INTEGRATED / VERIFY | N08 integrated and hardened. |
| Examination centres | DONE / INTEGRATED / VERIFY | N09 integrated; centre identity is not assumed to equal school identity. |
| Examination access arrangements | DONE / INTEGRATED / VERIFY | N10 integrated with individual-data restrictions. |
| Examination registration/results ingest | DONE / INTEGRATED / VERIFY | N12 integrated with frozen submission history and governed promotion to canonical results. |
| Official result comparisons | DONE / INTEGRATED / VERIFY | N21 distributions/comparisons integrated from canonical approved results. |
| Finance basics | DONE FOUNDATION / VERIFY | Charges, invoices, payments and allocations; intentionally not a full ERP. |

## Academic assessment and report cards

| Area | Status | Notes |
|---|---|---|
| Assessment schemes/components | DONE FOUNDATION / VERIFY | Versioned scheme architecture. |
| Working marks / moderation | DONE FOUNDATION / VERIFY | Append-only revisions and governed moderation/lock lifecycle. |
| Official results | DONE FOUNDATION / VERIFY | Approved immutable result provenance. |
| Report-card snapshots | DONE FOUNDATION / VERIFY | Immutable approved-result-based snapshots with attendance/rule/template provenance. |
| Certification/publication | DONE FOUNDATION / VERIFY | Exact snapshot versions certified/published. |
| Durable bulk report workflow | DONE / VERIFY | Durable generation/certify/publish/PDF pipeline remains integrated. |
| PDF/HTML artifacts | DONE FOUNDATION / VERIFY | Private deterministic artifacts, outbox/retry and combined-PDF support. |

## Statutory / EMIS

| Area | Status | Notes |
|---|---|---|
| Form registry / cycles | DONE FOUNDATION / VERIFY | Effective-dated definitions, versions and reporting cycles. |
| N05 lifecycle workspace | DONE / INTEGRATED / VERIFY | Readiness, snapshots, mapping runs, certification and network review integrated. |
| Operational snapshots | DONE / INTEGRATED / VERIFY | Existing fixed-date operational snapshot generator plus N07 canonical operational extensions. |
| Generic mapping compiler | DONE FOUNDATION / VERIFY | Declarative source→target compiler; no invented Ministry fields. |
| Authoritative EMIS/AEC mappings | SOURCE-GATED | Wait for verified current Ministry source material. |

## Structural operations

| Area | Status | Notes |
|---|---|---|
| Staffing establishment/vacancies | DONE / INTEGRATED / VERIFY | N13/N14. |
| Hostel/feeding | DONE / INTEGRATED / VERIFY | N15. |
| Inclusion aggregate | DONE / INTEGRATED / VERIFY | N16. |
| Control forms | DONE / INTEGRATED / VERIFY | N20. |
| Canonical metrics/network aggregates | DONE FOUNDATION / INTEGRATED / VERIFY | PR #370. |

## Production/shared environment status

Production/shared DB migration drift is **UNRESOLVED DEPLOYMENT WORK**, not missing source implementation.

Known runtime audit findings established by PR #353 include environments missing source-controlled objects used by:
- School Settings (`get_report_card_school_settings`),
- CRC Custody (`get_my_crc_custody_records` and related RPCs),
- Academic Setup (`schools.timetable_cycle_mode`, `schools.timetable_cycle_length`, `timetable_cycle_anchors`).

The correct remediation is to apply and verify source-controlled migrations in repository order through the designated deployment process, then retest affected routes. Do not recreate already-integrated features or add page-local fallbacks that conceal schema drift.

## UI/runtime consistency lane

UI/runtime consistency work is external/bounded relative to the integrated roadmap foundations. Repository inspection at this reconciliation point found branch `fix/ui-consistency-avatar-and-pickers`, but no matching open PR. If a PR is opened, track it as bounded consistency/QA work and keep it isolated from integrated N-roadmap architecture unless Control Room explicitly expands scope.

## Current core workflow summaries

Attendance: `day/week → class scope → expected school day → default present → exceptions/evidence → auditable confirmation/revision`

Staffing: `staff identity → effective school placement → establishment post → effective occupancy → derived vacancy/reconciliation`

Assessment: `versioned scheme → assessment instance → append-only marks → submit → review → deterministic calculation → immutable official result`

Examinations: `cycle/candidate/subject readiness → centre/access-arrangement checks → frozen registration submission → source-provenanced result staging → governed promotion to canonical official result`

Statutory: `versioned form → cycle/reference date → frozen operational snapshot → generic mapping/readiness → certification → source-gated form-specific export`

Controls: `versioned template → frozen cycle → evidence/provenance → governed completion/audit`

Metrics: `canonical metric definition → authoritative source read model → disclosure policy → school/network-safe aggregate output`

## Approved next implementation sequence

1. **Production/shared database migration reconciliation** — apply and verify all required source-controlled migrations in order; retest affected runtime routes.
2. **Bounded UI/runtime consistency QA** — avatar/picker/route/responsive consistency fixes on isolated PRs without reopening integrated domain architecture.
3. **Operational role/device/live-data QA** — statutory, DNEA, staffing, hostel/feeding, inclusion, controls, exam comparisons, metric/network aggregates, parent and report workflows.
4. **Canonical metric/network read-model expansion** — only for metrics backed by authoritative operational facts and explicit safe-disclosure policy.
5. **N06 authoritative statutory mappings** — only after verified current Ministry forms/rules are available.
6. **N11 coursework/moderation evidence** — only after authoritative requirements are confirmed.
7. **Live communication provider verification** — production secrets/onboarding/webhooks/test sends and signed terminal receipts.
8. **Consolidated UI/IA and document-lane polish** after deployment consistency and operational QA stabilize.

## Security / advisor notes

- Network membership does not imply learner/staff/support/examination-detail access.
- Aggregation must not become a permission bypass.
- Inclusion/support network outputs remain coarse and identity-free.
- N12 individual examination registration/access detail remains stricter than generic network scope.
- New network analytics must reuse the canonical metric registry/network-safe aggregate architecture.
- `SECURITY DEFINER` RPCs are self-authorizing boundaries and must be reviewed individually rather than blindly revoked.
- Worker-only claim/complete/fail/recovery functions remain service-role only.
- Import staging tables remain read-only to authenticated clients outside governed RPCs.
- Official/Ministry identifiers and mappings must never be guessed.

## Takeover rule

Before beginning work, inspect current `main`, this document, `CONTROL-ROOM.md` and the coordinated ledger. Do not recreate integrated N02–N05, N07–N10, N12–N21 or canonical metric foundations; do not duplicate authoritative learner/staff/support/exam/statutory facts; do not invent Ministry mappings or coursework requirements; and do not confuse unresolved deployment drift with missing source implementation. Continue only from the first current deployment, QA, source-gated, requirements-gated or explicitly assigned extension item.
