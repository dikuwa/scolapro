# ScolaPro Implementation Status

> **Living handoff document.** Update this file whenever a meaningful implementation slice is completed or materially changes. Any developer or AI taking over ScolaPro should read this file, `ARCHITECTURE-ROADMAP.md`, the domain documents and the design-system documents before proposing new architecture or starting duplicate work.

Last updated: **29 August 2026**

## How to use this document

Statuses:

- **DONE** — implemented and integrated into the current codebase.
- **IN PROGRESS** — architecture exists and implementation is actively advancing.
- **NEXT** — approved next implementation target.
- **PLANNED** — architecture/design defined but implementation has not reached the operational slice yet.
- **VERIFY** — implemented but still needs broader role/device/real-data QA.

## Current implementation mode

ScolaPro remains in a **backend/domain bulk implementation pass**. Functional UI may be added when required to prove an operational workflow, but visual polish and consolidated information-architecture refinement remain deferred until the operational foundations are stable.

## Foundation

| Area | Status | Notes |
|---|---|---|
| Product/domain architecture | DONE | Namibia-first multi-school model, source-of-truth map, role model and core architecture documented. |
| PostgreSQL/Supabase baseline | DONE | Supabase-backed PostgreSQL, source-controlled migrations and RLS baseline established. |
| Authentication | DONE | Authenticated user context includes school/platform memberships and guardian links. |
| Tenant isolation | DONE / VERIFY | RLS plus role-aware authorization and cross-domain scope triggers protect major operational chains. |
| RLS performance hardening | DONE CURRENT PASS / VERIFY | Direct `auth.uid()` init-plan hotspots and overlapping manage/read policies were hardened without broadening access. |
| Physical indexes | DONE CURRENT PASS / VERIFY | Public-schema FK coverage and recent-domain indexes were completed; duplicate render-job indexes were removed. |
| Platform administration | DONE FOUNDATION / VERIFY | Tenant/school onboarding, invitations, feature entitlements, school settings and lifecycle history. |
| Design system | DONE / EVOLVING | UI foundation is intentionally stable except where operational implementation requires controls. |
| Notifications | DONE FOUNDATION | User-scoped inbox; invitations and published reports create durable notifications. |
| Account profile | DONE FOUNDATION / VERIFY | Avatar, password workspace and account menu implemented. |
| Calendar | DONE FOUNDATION / VERIFY | Academic year/term and expected-school-day overrides exist. |

## Learner, timetable and attendance

| Area | Status | Notes |
|---|---|---|
| Learner identity / enrolment | DONE FOUNDATION | Long-lived learner identity, stable admission number and effective-dated enrolment. |
| Academic structure | DONE / VERIFY | Configurable grades/classes/subjects with safe correction semantics. |
| Staff | DONE FOUNDATION | Staff identities, memberships and scoped data access. |
| Timetable | DONE FOUNDATION / VERIFY | Offerings, allocations, periods, rooms and conflict-safe slots. |
| Timetable → lesson attendance | DONE FOUNDATION / VERIFY | Teaching slots link to the separate subject-period attendance workflow. |
| Daily / weekly register | DONE FOUNDATION / VERIFY | Exception-first daily and Monday-Friday weekly capture; mobile capture operational. |
| Attendance evidence | DONE FOUNDATION / VERIFY | Private JPG/PNG/WebP/PDF evidence with mobile camera capture. |
| Subject-period attendance | DONE FOUNDATION / VERIFY | Physically separate from official morning/Ministry attendance. |
| Late arrival | DONE FOUNDATION / VERIFY | Delegated late-arrival capture remains separate from official attendance statistics. |
| Detention sessions | DONE FOUNDATION / VERIFY | Detention obligations can be scheduled into sessions, supervised under an explicit `detention_supervisor` duty, recorded and completed with cross-school integrity enforcement. |
| Expected school days | DONE FOUNDATION / VERIFY | Monday-Friday default plus closure/special-day overrides; report snapshots now distinguish expected from recorded days. |

## Guardians, parents and onboarding

| Area | Status | Notes |
|---|---|---|
| Guardian identities | DONE FOUNDATION / VERIFY | Reusable tenant person identity rather than repeated learner fields. |
| Learner guardian relationships | DONE FOUNDATION / VERIFY | Effective-dated legal/emergency/pickup relationships plus contact/address history. |
| Sibling guardian reuse | DONE FOUNDATION / VERIFY | Existing guardian identities can be linked to multiple learners without duplicate person records. |
| Parent account claim | DONE FOUNDATION / VERIFY | Authenticated account may claim a guardian profile only when its Auth email exactly matches an active guardian email contact. |
| Parent portal | DONE FOUNDATION / VERIFY | `/parent` supports exact-email claim, child switching, published official results, frozen report attendance and version history. Guardian-only accounts resolve to the `parent` shell role. |
| Learner CSV import | DONE FOUNDATION / VERIFY | Staging, validation, review and atomic canonical create/skip commit. |
| Import reconciliation | DONE FOUNDATION / VERIFY | Stable identifiers only; names never silently merge and conflicting identifiers block the row. |
| XLSX / broader imports | PLANNED | Add only with deliberate dependency and the same staging/reconciliation rules. |

## Learner conduct, support and LTSM

| Area | Status | Notes |
|---|---|---|
| Conduct / achievement | DONE FOUNDATION / VERIFY | Separate longitudinal conduct and positive achievement histories. |
| Learner support | DONE FOUNDATION / VERIFY | Restricted/highly-restricted cases and append-oriented interventions. |
| Resource catalog / copies | DONE FOUNDATION / VERIFY | Shared textbook/library/resource/device model with barcode/asset, condition and location. |
| Loans / issue / return | DONE FOUNDATION / VERIFY | Governed transactions with one-open-loan-per-copy protection. |

## Communications

| Area | Status | Notes |
|---|---|---|
| Canonical message / recipients | DONE FOUNDATION / VERIFY | Provider-independent app/email/SMS/WhatsApp/letter intent and recipient state. |
| Delivery outbox | DONE FOUNDATION / VERIFY | Recipient jobs support claim, retry, dead-letter and service-role worker boundaries. |
| Provider routing | DONE FOUNDATION / VERIFY | Effective tenant/school channel routing metadata exists; provider credentials are deliberately excluded from PostgreSQL domain records. |
| Delivery attempt history | DONE FOUNDATION / VERIFY | Append-oriented provider attempt history supports reconciliation and diagnostics. |
| Worker recovery | DONE FOUNDATION / VERIFY | Stale claimed communication jobs can be safely returned to retry/dead states by service-role recovery. |
| Actual vendor transports | NEXT | Implement configured Namibia SMS/email/WhatsApp provider adapters outside the canonical database. Do not mark delivery successful without a real provider result. |

## Admissions, examinations, finance and progression

| Area | Status | Notes |
|---|---|---|
| Admission applications | DONE FOUNDATION / VERIFY | Pre-enrolment workflow separate from authoritative learner identity. |
| Transfers | DONE FOUNDATION / VERIFY | Source provenance preserved and source enrolment closes rather than being rewritten. |
| Promotion rule sets/evaluation | DONE FOUNDATION / VERIFY | Versioned deterministic rules; no guessed Namibia rule hard-coding. |
| Year-end progression | DONE FOUNDATION / VERIFY | Reviewed/approved/locked lifecycle with rule provenance. |
| DNEA cycle/candidate/subjects/readiness | DONE FOUNDATION / VERIFY | Candidate identity uses authoritative learner/enrolment; official codes preserved. |
| Finance basics | DONE FOUNDATION / VERIFY | Charge types, invoices, payments and governed allocation; intentionally not a full ERP. |

## Academic assessment and report cards

| Area | Status | Notes |
|---|---|---|
| Assessment schemes/components | DONE FOUNDATION / VERIFY | Versioned schemes support detailed and final-result capture. |
| Working marks | DONE FOUNDATION / VERIFY | Append-only revisions; absent/exempt/incomplete/withheld remain distinct from zero. |
| Moderation / lock | DONE FOUNDATION / VERIFY | Complete-class submission and HOD/leader return/verify lifecycle. |
| Deterministic calculation | DONE FOUNDATION / VERIFY | Weighted calculation preserves inputs and versioned rule/scheme provenance. |
| Official results | DONE FOUNDATION / VERIFY | Approved immutable results require verified contributing evidence. |
| Report-card snapshots | DONE FOUNDATION / VERIFY | Generated only from approved official results and preserve learner, guardian, result, rule, template and attendance provenance. |
| Final-term semantics | DONE CURRENT PASS / VERIFY | Year-end progression is included only on the configured final academic term, not by assuming `term >= 3`. |
| Attendance semantics | DONE CURRENT PASS / VERIFY | Snapshots store expected school days, recorded days and register coverage instead of treating recorded rows as expected days. |
| Certification / publication | DONE FOUNDATION / VERIFY | Exact snapshot versions are certified/published; linked guardians read only published snapshots. |
| Report-card document metadata | DONE FOUNDATION / VERIFY | Rendered artifacts are registered against immutable certified/published snapshots with hash/template/storage metadata. |
| Private artifact storage | DONE FOUNDATION / VERIFY | `report-card-artifacts` is private; no direct authenticated storage-object policy grants were added. |
| HTML renderer / render outbox | DONE FOUNDATION / VERIFY | Deterministic HTML renderer, format-scoped claim, retry/dead lifecycle, stale-lock recovery and internal worker endpoint exist. Staff report workspace queues the supported HTML render format after certification. |
| Automatic render scheduling | NEXT | The internal render worker still needs an authorized scheduler/worker trigger in deployment infrastructure. |
| PDF renderer | NEXT | Add an actual PDF renderer using the immutable snapshot/document layer. Do not fake PDF completion with HTML bytes. |
| Secure artifact opening/download | NEXT | Authorize via user-scoped report-document RLS first, then mint a short-lived server-side signed storage URL. |

## Curriculum and teaching planning

| Area | Status | Notes |
|---|---|---|
| NIED source registry | DONE FOUNDATION / VERIFY | Source provenance, checksums/status and authority metadata. |
| Curriculum versions/content | DONE FOUNDATION / VERIFY | Versioned units/objectives/competencies/practicals with governed publication. |
| School overlays / pacing | DONE FOUNDATION / VERIFY | Operational school/year planning remains separate from official curriculum content. |
| Teaching schedule / lesson prep | DONE FOUNDATION / VERIFY | Planned dates, curriculum snapshot and teacher/AI pedagogical content remain distinct. |
| Teaching actuals / coverage | DONE FOUNDATION / VERIFY | Actual taught date, periods, coverage and reflection are separate from planning. |

## Statutory / EMIS

| Area | Status | Notes |
|---|---|---|
| Form registry / cycles | DONE FOUNDATION / VERIFY | Effective-dated definitions, form versions and school reporting cycles. |
| Operational snapshots | DONE FOUNDATION / VERIFY | Fixed-date source generator derives learner/staff/workload/attendance/LTSM source data. |
| Readiness / certification | DONE FOUNDATION / VERIFY | Blocking/warning issues and governed principal/admin certification. |
| Generic mapping compiler | DONE FOUNDATION / VERIFY | Declarative `source_path → target_path` compiler validates required values and types and emits readiness issues. It deliberately does not invent Ministry fields. |
| Authoritative EMIS/AEC mappings | NEXT | Load and review current official form definitions before publishing form-specific mappings/export logic. |

## Tenant configuration

| Area | Status | Notes |
|---|---|---|
| Tenant features | DONE FOUNDATION / VERIFY | Effective-dated feature keys/config replace hard-coded tenant modes. |
| School settings | DONE FOUNDATION / VERIFY | Operational settings stay separate from entitlements/domain data. |
| Tenant lifecycle history | DONE FOUNDATION / VERIFY | Platform lifecycle events are append-oriented. |

## Current core workflow summaries

Attendance: `day/week → class scope → expected school day → default present → exceptions/evidence → auditable confirmation/revision`

Lesson attendance: `timetable slot → allocated teacher/class roster → default present → subject-period exceptions → separate lesson record`

Assessment: `versioned scheme → assessment instance → append-only marks → submit → HOD/leader review → deterministic result → grading band → immutable official result`

Report cards: `approved official results → immutable snapshot → certify exact version → optional HTML render → publish exact version → guardian access/notification → private immutable artifact`

Progression: `locked official results + active versioned promotion rules → explainable evaluation → reviewed progression → governed approval/lock`

Curriculum: `verified NIED source → curriculum version → units/objectives/competencies → school overlay → pacing → class schedule → lesson prep → actual teaching/coverage`

Statutory: `versioned authoritative form → cycle/reference date → operational snapshot → generic mapping/readiness → certification → form-specific export once authoritative mapping exists`

Imports: `CSV → source-preserving staging → structural validation → stable-identifier reconciliation → human review → ready batch → atomic governed commit → audit`

Communications: `canonical message → recipients → outbox → provider route → service worker attempt → delivered/retry/dead → stale-lock recovery`

## Approved next implementation sequence

1. **CI/database closure for this bulk**: resolve every current typecheck/pgTAP/fresh-migration failure before adding more surface area.
2. **Report-card render operations**: automatic authorized worker scheduling, render-job/document visibility and secure short-lived artifact access; then implement actual PDF rendering.
3. **Parent portal verification and expansion**: exercise real guardian claim/child isolation and published-report access; add messages/payments only from governed domain sources.
4. **Communication adapters**: integrate real configured SMS/email/WhatsApp transports with provider credentials outside PostgreSQL and truthful delivery callbacks.
5. **Authoritative statutory mappings**: add actual EMIS/AEC mappings only when current Ministry forms/rules are verified.
6. **Behavioral integrity tests**: deepen final-term/report attendance, promotion calculation and cross-school invalid-write fixtures.
7. **Import expansion**: add staff/guardian/academic-structure imports only through deterministic staging/reconciliation patterns.
8. **Consolidated UI/IA and responsive QA** after remaining operational slices stabilize.

## Security / advisor notes

- `get_school_invitation_preview(text)` intentionally permits anonymous execution for the public invitation-preview flow.
- Many authenticated `SECURITY DEFINER` RPC warnings are intentional because these functions are the self-authorizing signed-in API boundary. Audit each function individually; do not blindly revoke application RPC execution.
- Worker-only claim/complete/fail/recovery functions remain service-role only and are covered by pgTAP privilege checks.
- Supabase leaked-password protection is still disabled at the project configuration level and should be enabled before production onboarding when the platform setting is available.
- `unused_index` advisor entries are expected during an early/low-data system and are not grounds for premature index deletion.

## Takeover rule

Before beginning work, inspect the repository and this document. Do not recreate completed schema, replace established token systems, hard-code tenant modes, guess Namibia policy/form fields, bypass authorization architecture, merge learner identities by name, expose provider secrets in domain tables, or recompute certified historical documents from later live data. Continue from the first **IN PROGRESS** or **NEXT** item that matches the requested feature.
