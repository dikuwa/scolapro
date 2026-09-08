# ScolaPro Implementation Status

> **Living handoff document.** Update this file whenever a meaningful implementation slice is completed or materially changes. Read this file together with `ARCHITECTURE-ROADMAP.md`, `CONTROL-ROOM.md`, the coordinated delivery ledger, domain documents and design-system documents before proposing new architecture or duplicate work.

Last updated: **8 September 2026**

Current reconciled `main`: `5d6958dce25f160b0a6b58567386521066d713a7`.

## Status meanings

- **DONE / INTEGRATED** — implemented and merged into current source `main`.
- **SOURCE-VERIFIED** — repository tests/CI or bounded source audit verified the stated behavior.
- **LIVE/DEPLOYMENT VERIFIED** — exercised in a connected deployed environment against deployed schema/runtime/provider configuration.
- **VERIFY** — implemented, but a broader role/device/live-data/deployment acceptance dimension remains.
- **SOURCE-GATED** — implementation must wait for verified authoritative source material.
- **REQUIREMENTS-GATED** — implementation must wait for authoritative functional requirements.
- **DEPLOYMENT WORK** — source implementation exists; production/shared environment still requires migration/configuration/runtime verification.

## Current implementation mode

The major N-roadmap backend/domain foundation pass is integrated through N21. N24 canonical metrics are now integrated beyond the initial registry via PR #373, and N25 has a bounded circuit/regional operational read-model foundation via PR #374 with historical network-authority hardening via PR #376. Remaining work is primarily deployment reconciliation, the separate PR #375 UI/runtime lane, targeted live/provider/device QA, source/requirements-gated gaps, and carefully justified N24/N25 extensions.

## Current roadmap status

| ID | Status | Integrated evidence / remaining constraint |
|---|---|---|
| N01 | STANDING ARCHITECTURE | Capture once; derive everywhere; no parallel authoritative fact stores. |
| N02 | DONE / INTEGRATED | Education authority/region/circuit/optional cluster hierarchy via PR #355. |
| N03 | DONE / INTEGRATED | Versioned/effective-dated external school identifiers and registry links via PR #355. |
| N04 | DONE / INTEGRATED / SOURCE-VERIFIED | Circuit/regional network membership and scoped school visibility via PR #355; PR #376 hardens historical access so expired membership cannot be revived by `p_as_of`. |
| N05 | DONE / INTEGRATED / VERIFY | Statutory cycle/readiness/snapshot/certification lifecycle and network review workspace via PR #357. |
| N06 | SOURCE-GATED | Fifteenth School Day/AEC/Ministry mappings require verified current official forms/rules. Do not invent fields/codes/definitions. |
| N07 | DONE / INTEGRATED / VERIFY | Operational statutory extensions via PR #369; reuses canonical staffing, hostel/feeding, education-network and school-identifier sources while preserving frozen/reference-date semantics. |
| N08 | DONE / INTEGRATED / SOURCE-VERIFIED / VERIFY | DNEA candidate readiness/review via PR #358; authorization/freshness hardening via PR #367 and shared historical network-authority hardening via PR #376. Deployment/live acceptance remains environment-specific. |
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
| N21 | DONE / INTEGRATED / SOURCE-VERIFIED | Official-result symbol distribution and bounded exam-series comparison read models via PR #361; canonical `official_results` only, no mark re-entry. |
| N22 | DONE FOUNDATION / VERIFY | Shared school identity/document print chrome integrated; continue only in bounded document lane. |
| N23 | DONE ASSET BASELINE / VERIFY | Official ScolaPro and school-brand assets integrated where committed; do not fabricate missing assets. |
| N24 | DONE / INTEGRATED / SOURCE-VERIFIED | PR #370 established the canonical metric registry/network-safe aggregate boundary; PR #373 expanded canonical network-safe metrics across staffing, hostel/feeding and examination-centre sources without a parallel fact store. |
| N25 | DONE BOUNDED FOUNDATION / INTEGRATED / SOURCE-VERIFIED | PR #374 provides coarse circuit/regional operational summaries over authoritative sources with explicit non-leakage; PR #376 hardens shared historical network authorization. Further Ministry/dashboard expansion remains purpose/disclosure driven. |
| N26 | CLOSED | Previously missing directive content reconciled. |

## Foundation

| Area | Status | Notes |
|---|---|---|
| Product/domain architecture | DONE | Namibia-first multi-school model, source-of-truth map, role model and core architecture documented. |
| PostgreSQL/Supabase baseline | DONE / VERIFY | Source-controlled migrations, RLS and governed RPC architecture established; deployed migration level must be checked per environment. |
| Authentication | DONE | Authenticated context supports school/platform/network membership models. |
| Tenant isolation | DONE / SOURCE-VERIFIED / VERIFY | RLS plus domain integrity and authorization boundaries protect major operational chains; live environment acceptance remains scenario-specific. |
| Education network | DONE / INTEGRATED / SOURCE-VERIFIED | Shared hierarchy, effective-dated school placement, external identifiers and current-membership network-scoped visibility are integrated and historical authorization is hardened. |
| Canonical metric registry | DONE / INTEGRATED / SOURCE-VERIFIED | PRs #370/#373 establish and expand canonical metric definitions/network-safe evaluation. |
| Network operational analytics | DONE BOUNDED FOUNDATION / INTEGRATED / SOURCE-VERIFIED | PR #374 aggregate-only circuit/regional summary; no learner/staff/school identity output; PR #376 hardens authorization. |
| Design system | DONE / EVOLVING | Shared controls/tokens remain the UI baseline; PR #375 is the active separate runtime/UI consistency lane. |
| Notifications | DONE FOUNDATION / SOURCE-VERIFIED | User-scoped notification authorization and recipient relationship integrity are source-verified; no tenant-wide default read. |
| Communications delivery | DONE FOUNDATION / SOURCE-VERIFIED / LIVE PROVIDER UNVERIFIED | Recipient scope, outbox/retry/attempt/receipt semantics and secret-free provider routing are source-verified. Real provider send/webhook receipt is not live-verified. |
| Account profile | DONE FOUNDATION / VERIFY | Avatar/password/account-menu foundation exists; PR #375 owns current bounded UI/runtime QA. |

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
| Bell/calendar integration | DONE / INTEGRATED / VERIFY | N17/N18/N19 + T04/T05 integrated via PR #354; PR #375 owns current UI/runtime consistency work touching calendar/attendance surfaces. |
| Daily/weekly register | DONE FOUNDATION / VERIFY | Exception-first official register workflow. |
| Subject-period attendance | DONE FOUNDATION / VERIFY | Separate from official morning attendance. |
| Expected school days | DONE FOUNDATION / VERIFY | Closure/special-day semantics preserved. |

## Guardians, parents and onboarding

| Area | Status | Notes |
|---|---|---|
| Guardian identities/relationships | DONE FOUNDATION / VERIFY | Reusable identities and effective-dated relationships. |
| Parent account claim | DONE FOUNDATION / VERIFY | Exact active guardian-email claim boundary. |
| Parent portal | DONE FOUNDATION / VERIFY | Published results, reports, finance and directly delivered messages. |
| Communication recipient resolution | DONE FOUNDATION / SOURCE-VERIFIED | Parent/guardian app recipients must resolve through authoritative guardian-user link, effective guardian relationship and current school enrolment; arbitrary cross-school user substitution is rejected. |
| Learner/staff/guardian/academic imports | DONE FOUNDATION / VERIFY | Source-preserving governed staging/reconciliation architecture. |
| Import mutation boundary | DONE / VERIFY | Authenticated staging mutation is RPC-governed rather than direct table writes. |

## Learner conduct, support, inclusion and LTSM

| Area | Status | Notes |
|---|---|---|
| Conduct / achievement | DONE / INTEGRATED / VERIFY | Combined governed incident/achievement workflow; current UI/runtime consistency adjustments remain in PR #375 rather than this roadmap lane. |
| Learner support | DONE FOUNDATION / VERIFY | Restricted/highly-restricted support cases remain separate from aggregate reporting. |
| Inclusion/SEN aggregate reporting | DONE / INTEGRATED / SOURCE-VERIFIED | N16 exposes aggregate-only school/network views without case identities/notes; N25 composes only coarse existing support aggregate semantics. |
| Resource catalog / loans | DONE FOUNDATION / VERIFY | Shared resource-copy and governed loan model. |

## Admissions, examinations, finance and progression

| Area | Status | Notes |
|---|---|---|
| Admissions / transfers | DONE FOUNDATION / VERIFY | Pre-enrolment workflow and source-preserving transfers. |
| Promotion / progression | DONE FOUNDATION / VERIFY | Versioned deterministic rules and governed year-end progression. |
| DNEA readiness | DONE / INTEGRATED / SOURCE-VERIFIED / VERIFY | N08 integrated/hardened; PR #376 closes historical network-membership revival defect. |
| Examination centres | DONE / INTEGRATED / SOURCE-VERIFIED / VERIFY | N09 integrated; centre identity is not assumed to equal school identity; N24 metric expansion includes safe centre counts. |
| Examination access arrangements | DONE / INTEGRATED / VERIFY | N10 integrated with individual-data restrictions; N25 does not expose arrangement detail. |
| Examination registration/results ingest | DONE / INTEGRATED / VERIFY | N12 integrated with frozen submission history and governed promotion to canonical results. |
| Official result comparisons | DONE / INTEGRATED / SOURCE-VERIFIED | N21 distributions/comparisons integrated from canonical approved results. |
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
| Inclusion aggregate | DONE / INTEGRATED / SOURCE-VERIFIED | N16. |
| Control forms | DONE / INTEGRATED / VERIFY | N20. |
| Canonical metrics/network aggregates | DONE / INTEGRATED / SOURCE-VERIFIED | N24 via PRs #370/#373. |
| Circuit/regional operational read model | DONE BOUNDED FOUNDATION / INTEGRATED / SOURCE-VERIFIED | N25 via PR #374, with shared historical network authority hardened by PR #376. |

## Communications / notification readiness

Source-verified on current integrated architecture:
- notification reads/updates/deletes are recipient-specific;
- school-scoped notification recipient/scope/content provenance is integrity-guarded;
- communication recipients are physically bound to their message tenant/school;
- app recipients require active school membership or current authoritative guardian relationship to a currently enrolled learner;
- delivery queue/retry/attempt state is durable and service-role controlled;
- provider API acceptance is distinct from final provider delivery receipt;
- provider event replay can be idempotently recorded;
- delivery receipt provenance is append-oriented/immutable and cross-school scope is physically guarded;
- provider route configuration is secret-free metadata and credential-bearing configuration keys are rejected.

Live/provider verification remains outstanding. Connected ScolaPro DB inspection on 8 September 2026 found `0` communication provider routes and no communication outbox/attempt/receipt history to exercise a real provider send/receipt path. No real email/SMS/WhatsApp delivery success is claimed.

## Production/shared environment status

Production/shared DB migration state must be reconciled against current source rather than described as globally complete or globally broken.

A connected ScolaPro Supabase inspection on 8 September 2026 verified:
- project `scolapro` is active/healthy;
- a substantial source migration history is deployed through the inspected environment;
- notification/communication tables and current hardened RLS policies are present.

The same inspection did **not** show the later 7–8 September network/roadmap migrations that are integrated in `main`. Therefore PRs #373/#374/#376 and other late source slices are **source-integrated/source-verified but not deployment-verified in that inspected environment** until migration reconciliation confirms their application.

Earlier PR #353 runtime findings remain relevant as environment checks, not evidence that source implementations are missing. The remediation pattern remains: apply/verify source-controlled migrations in order, then retest affected routes. Do not add page-local schema-drift fallbacks.

## UI/runtime consistency lane

PR #375 is open and draft on `chatgpt/ui-runtime-consistency-fixes`. It is the separate active UI/runtime consistency lane and currently covers shell/global consistency, shared Button adoption, Conduct repair, late-arrivals/detention simplification, absence visibility and calendar/attendance consistency work. Do not absorb or duplicate that scope in roadmap/domain streams.

## Current core workflow summaries

Attendance: `day/week → class scope → expected school day → default present → exceptions/evidence → auditable confirmation/revision`

Staffing: `staff identity → effective school placement → establishment post → effective occupancy → derived vacancy/reconciliation`

Assessment: `versioned scheme → assessment instance → append-only marks → submit → review → deterministic calculation → immutable official result`

Examinations: `cycle/candidate/subject readiness → centre/access-arrangement checks → frozen registration submission → source-provenanced result staging → governed promotion to canonical official result`

Statutory: `versioned form → cycle/reference date → frozen operational snapshot → generic mapping/readiness → certification → source-gated form-specific export`

Controls: `versioned template → frozen cycle → evidence/provenance → governed completion/audit`

Metrics: `canonical metric definition → authoritative source read model → disclosure policy → school/network-safe aggregate output`

Network operations: `current network membership authorization → effective-dated school scope/facts → aggregate-only operational composition → identity-free circuit/regional output`

Communications: `governed message → authoritative recipients → outbox job → provider route/attempt → accepted submission → signed provider receipt → durable terminal recipient state`

## Approved next implementation sequence

1. **Deployment reconciliation** — verify/apply source-controlled migrations through current `main` and retest affected deployed routes/RPCs; record deployment verification separately from source status.
2. **PR #375 completion/review** — keep the UI/runtime consistency lane isolated, rebase if required and run its exact-head acceptance before merge.
3. **Targeted live operational QA** — exercise only acceptance dimensions still unverified, including real communications provider onboarding/send/webhook receipt, browser/device flows and production-data cases not already tested.
4. **N24/N25 extension only by explicit need** — add metrics/read models only from authoritative operational facts with explicit disclosure policy; no duplicate fact store or generic dashboard-driven semantics.
5. **N06 authoritative statutory mappings** — only after verified current Ministry forms/rules are available.
6. **N11 coursework/moderation evidence** — only after authoritative requirements are confirmed.
7. **Consolidated UI/IA and document-lane polish** after deployment reconciliation and bounded QA stabilize.

## Security / advisor notes

- Network membership does not imply learner/staff/support/examination-detail access.
- Current network membership authorizes; historical `p_as_of` selects historical facts and must not revive expired membership.
- Aggregation must not become a permission bypass.
- Inclusion/support network outputs remain coarse and identity-free.
- N12 individual examination registration/access detail remains stricter than generic network scope.
- New network analytics must reuse the canonical metric registry/network-safe aggregate architecture.
- `SECURITY DEFINER` RPCs are self-authorizing boundaries and must be reviewed individually rather than blindly revoked.
- Worker-only claim/complete/fail/recovery functions remain service-role only.
- Provider credentials/secrets must remain server-side and out of canonical routing metadata/client output.
- Import staging tables remain read-only to authenticated clients outside governed RPCs.
- Official/Ministry identifiers and mappings must never be guessed.

## Takeover rule

Before beginning work, inspect current `main`, this document, `CONTROL-ROOM.md` and the coordinated ledger. Do not recreate integrated N02–N05, N07–N10, N12–N21, N24 or the bounded N25 foundation; do not duplicate authoritative learner/staff/support/exam/statutory facts; do not invent Ministry mappings or coursework requirements; do not absorb active PR #375 UI scope; and do not confuse unresolved deployment verification with missing source implementation. Continue only from the first current deployment, QA, source-gated, requirements-gated or explicitly assigned extension item.
