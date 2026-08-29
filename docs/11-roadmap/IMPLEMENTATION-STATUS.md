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
| RLS performance hardening | DONE CURRENT PASS / VERIFY | Direct `auth.uid()` init-plan hotspots and overlapping manage/read policies were hardened without broadening access. Internal finance recalculation is no longer client-executable. |
| Physical indexes | DONE CURRENT PASS / VERIFY | Public-schema FK coverage is complete for current domains; latest advisor pass reports no unindexed-FK findings. Duplicate render-job indexes were removed. |
| Platform administration | DONE FOUNDATION / VERIFY | Tenant/school onboarding, invitations, feature entitlements, school settings and lifecycle history. |
| Design system | DONE / EVOLVING | UI foundation is intentionally stable except where operational implementation requires controls. |
| Notifications | DONE FOUNDATION | User-scoped inbox; invitations and published reports create durable notifications. |
| Account profile | DONE FOUNDATION / VERIFY | Avatar, password workspace and account menu implemented. |
| Calendar | DONE FOUNDATION / VERIFY | Academic year/term and expected-school-day overrides exist. |

## Learner, staff, timetable and attendance

| Area | Status | Notes |
|---|---|---|
| Learner identity / enrolment | DONE FOUNDATION | Long-lived learner identity, stable admission number and effective-dated enrolment. |
| Academic structure | DONE / VERIFY | Configurable grades/classes/subjects with safe correction semantics. |
| Staff identity | DONE FOUNDATION / VERIFY | Tenant-wide staff identity remains separate from Auth accounts. |
| Staff school assignments | DONE FOUNDATION / VERIFY | Effective-dated school placements allow imported staff to exist operationally before an account invitation; writes are governed through audited RPCs and overlapping same-school placements are blocked. |
| Staff directory | DONE CURRENT PASS / VERIFY | Directory merges effective school placement with account-role membership rather than hiding staff who do not yet have login accounts. |
| Timetable | DONE FOUNDATION / VERIFY | Offerings, allocations, periods, rooms and conflict-safe slots. Teacher selectors include actively assigned staff even before user-account onboarding. |
| Timetable → lesson attendance | DONE FOUNDATION / VERIFY | Teaching slots link to the separate subject-period attendance workflow. |
| Daily / weekly register | DONE FOUNDATION / VERIFY | Exception-first daily and Monday-Friday weekly capture; mobile capture operational. |
| Attendance evidence | DONE FOUNDATION / VERIFY | Private JPG/PNG/WebP/PDF evidence with mobile camera capture. |
| Subject-period attendance | DONE FOUNDATION / VERIFY | Physically separate from official morning/Ministry attendance. |
| Late arrival | DONE FOUNDATION / VERIFY | Delegated late-arrival capture remains separate from official attendance statistics. |
| Detention sessions | DONE FOUNDATION / VERIFY | Detention obligations can be scheduled into sessions, supervised under an explicit `detention_supervisor` duty, recorded and completed with cross-school integrity enforcement. |
| Expected school days | DONE FOUNDATION / VERIFY | Monday-Friday default plus closure/special-day overrides; report snapshots distinguish expected from recorded days. |

## Guardians, parents and onboarding

| Area | Status | Notes |
|---|---|---|
| Guardian identities | DONE FOUNDATION / VERIFY | Reusable tenant person identity rather than repeated learner fields. |
| Learner guardian relationships | DONE FOUNDATION / VERIFY | Effective-dated legal/emergency/pickup relationships plus contact/address history. |
| Sibling guardian reuse | DONE FOUNDATION / VERIFY | Existing guardian identities can be linked to multiple learners without duplicate person records. |
| Parent account claim | DONE FOUNDATION / VERIFY | Authenticated account may claim a guardian profile only when its Auth email exactly matches an active guardian email contact. |
| Parent portal | DONE FOUNDATION / VERIFY | `/parent` supports exact-email claim, child switching, published official results, frozen report attendance, secure report artifacts, child finance summaries and directly delivered account messages. Guardian-only accounts resolve to the `parent` shell role. |
| Parent messages | DONE CURRENT PASS / VERIFY | Only canonical communications explicitly delivered to the signed-in `user_id` are exposed; learner/class/school audiences are never inferred into guardian access. |
| Parent finance | DONE CURRENT PASS / VERIFY | Linked-child issued invoices and payment history are exposed through a governed RPC without broadening base finance-table RLS. |
| Learner CSV import | DONE FOUNDATION / VERIFY | Staging, validation, review and atomic canonical create/skip commit. |
| Learner import reconciliation | DONE FOUNDATION / VERIFY | Stable identifiers only; names never silently merge and conflicting identifiers block the row. |
| Staff CSV import | DONE CURRENT PASS / VERIFY | Employee-number-based deterministic reconciliation supports create/link/skip and creates effective school placements independently of Auth accounts. Duplicate employee numbers in one staged batch are blocked. |
| Guardian CSV import | DONE CURRENT PASS / VERIFY | Learners resolve by school admission number and guardians by tenant identity number. Exact identity/name disagreements require explicit human confirmation before linking; names never act as match keys. |
| Academic-structure CSV import | DONE CURRENT PASS / VERIFY | Grades/classes/subjects reconcile by stable school/year codes and commit through existing academic RPCs; class dependencies resolve against staged grades. |
| Import mutation boundary | DONE CURRENT PASS / VERIFY | Authenticated clients have read-only staging tables. Batch/row/result mutations are RPC-only and covered by privilege tests. |
| XLSX import | PLANNED | Add only with a deliberate parser dependency and the same source-preserving staging/reconciliation rules. |

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
| Parent message read model | DONE CURRENT PASS / VERIFY | Directly delivered signed-in-user messages can be read without granting parent accounts general communication-table access. |
| Actual vendor transports | NEXT | Implement configured Namibia SMS/email/WhatsApp provider adapters outside the canonical database. Do not mark delivery successful without a real provider result. |

## Admissions, examinations, finance and progression

| Area | Status | Notes |
|---|---|---|
| Admission applications | DONE FOUNDATION / VERIFY | Pre-enrolment workflow separate from authoritative learner identity. |
| Transfers | DONE FOUNDATION / VERIFY | Source provenance preserved and source enrolment closes rather than being rewritten. |
| Promotion rule sets/evaluation | DONE FOUNDATION / VERIFY | Versioned deterministic rules; no guessed Namibia rule hard-coding. |
| Year-end progression | DONE FOUNDATION / VERIFY | Reviewed/approved/locked lifecycle with rule provenance. |
| DNEA cycle/candidate/subjects/readiness | DONE FOUNDATION / VERIFY | Candidate identity uses authoritative learner/enrolment; official codes preserved. |
| Finance basics | DONE FOUNDATION / VERIFY | Charge types, invoices, payments and governed allocation; intentionally not a full ERP. Internal invoice recalculation is a helper rather than a direct client endpoint. |

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
| HTML renderer / render outbox | DONE FOUNDATION / VERIFY | Deterministic HTML renderer, format-scoped claim, retry/dead lifecycle, stale-lock recovery and internal worker endpoint exist. Worker invocation performs stale-job recovery before claiming work. |
| Scheduler-ready worker endpoint | DONE CURRENT PASS / VERIFY | Internal POST uses `INTERNAL_JOB_RUNNER_SECRET`; scheduler GET uses `CRON_SECRET`. No live deployment scheduler is claimed until hosting is connected/configured. |
| Automatic render scheduling | NEXT | Connect a real deployment scheduler to the authorized worker endpoint. |
| PDF renderer | NEXT | Add an actual PDF renderer using the immutable snapshot/document layer. Do not fake PDF completion with HTML bytes. |
| Secure artifact opening/download | DONE CURRENT PASS / VERIFY | Server endpoint first performs user-scoped report-document RLS authorization and only then mints a short-lived signed URL to the private artifact. |

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

Staff: `tenant staff identity → effective school placement → optional account invitation/membership → timetable/role use → effective-dated end without deleting history`

Assessment: `versioned scheme → assessment instance → append-only marks → submit → HOD/leader review → deterministic result → grading band → immutable official result`

Report cards: `approved official results → immutable snapshot → certify exact version → optional HTML render → publish exact version → guardian access/notification → private immutable artifact`

Progression: `locked official results + active versioned promotion rules → explainable evaluation → reviewed progression → governed approval/lock`

Curriculum: `verified NIED source → curriculum version → units/objectives/competencies → school overlay → pacing → class schedule → lesson prep → actual teaching/coverage`

Statutory: `versioned authoritative form → cycle/reference date → operational snapshot → generic mapping/readiness → certification → form-specific export once authoritative mapping exists`

Imports: `CSV → source-preserving RPC-only staging → structural validation → stable-identifier/code reconciliation → explicit human conflict review → ready batch → atomic governed commit → audit`

Communications: `canonical message → recipients → outbox → provider route → service worker attempt → delivered/retry/dead → stale-lock recovery`

## Approved next implementation sequence

1. **CI/database closure for each bulk**: resolve every current typecheck/pgTAP/fresh-migration failure before treating a slice as stable.
2. **Behavioral integrity tests**: deepen guardian identity-mismatch decisions, parent/child isolation, staff-assignment overlap/import idempotency, final-term/report attendance, promotion calculation and cross-school invalid-write fixtures.
3. **Report-card rendering**: connect a real scheduler when deployment is available, then implement a genuine PDF renderer without weakening immutable-snapshot provenance.
4. **Communication adapters**: integrate real configured SMS/email/WhatsApp transports with provider credentials outside PostgreSQL and truthful delivery callbacks.
5. **Authoritative statutory mappings**: add actual EMIS/AEC mappings only when current Ministry forms/rules are verified.
6. **Import format expansion**: XLSX only through a deliberate parser dependency and the same governed staging/reconciliation architecture.
7. **Parent/role operational QA**: exercise real guardian claim, report artifact, finance, messaging, guardian-import and staff-without-account workflows with seeded non-sensitive fixtures.
8. **Consolidated UI/IA and responsive QA** after remaining operational slices stabilize.

## Security / advisor notes

- `get_school_invitation_preview(text)` intentionally permits anonymous execution for the public invitation-preview flow.
- Many authenticated `SECURITY DEFINER` RPC warnings are intentional because these functions are the self-authorizing signed-in API boundary. Audit each function individually; do not blindly revoke application RPC execution.
- Worker-only claim/complete/fail/recovery functions remain service-role only and are covered by pgTAP privilege checks.
- Import staging tables are read-only to authenticated clients; source rows, resolutions and commit results can only be mutated through self-authorizing import RPCs.
- `recalculate_finance_invoice(uuid)` is intentionally no longer executable by authenticated clients; governed allocation workflows invoke it internally.
- Latest performance-advisor pass has no unindexed-FK warnings. `unused_index` entries are expected during an early/low-data system and are not grounds for premature index deletion.
- Supabase leaked-password protection is still disabled at the project configuration level and should be enabled before production onboarding when the platform setting is available.

## Takeover rule

Before beginning work, inspect the repository and this document. Do not recreate completed schema, replace established token systems, hard-code tenant modes, guess Namibia policy/form fields, bypass authorization architecture, merge learner/staff/guardian identities by name, expose provider secrets in domain tables, or recompute certified historical documents from later live data. Continue from the first **IN PROGRESS** or **NEXT** item that matches the requested feature.
