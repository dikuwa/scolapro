# ScolaPro Implementation Status

> **Living handoff document.** Update this file whenever a meaningful implementation slice is completed or materially changes. Any developer or AI taking over ScolaPro should read this file, `ARCHITECTURE-ROADMAP.md`, the domain documents and the design-system documents before proposing new architecture or starting duplicate work.

Last updated: **6 September 2026**

## How to use this document

Statuses:

- **DONE** — implemented and integrated into the current codebase.
- **IN PROGRESS** — architecture exists and implementation is actively advancing.
- **NEXT** — approved next implementation target.
- **PLANNED** — architecture/design defined but implementation has not reached the operational slice yet.
- **VERIFY** — implemented but still needs broader role/device/real-data QA.

## Current implementation mode

ScolaPro remains in a **backend/domain bulk implementation pass**. Functional UI is added where needed to prove an operational workflow, while broad visual polish and consolidated information-architecture refinement remain deferred until the operational foundations are stable.

## Foundation

| Area | Status | Notes |
|---|---|---|
| Product/domain architecture | DONE | Namibia-first multi-school model, source-of-truth map, role model and core architecture documented. |
| PostgreSQL/Supabase baseline | DONE | Supabase-backed PostgreSQL, source-controlled migrations and RLS baseline established. |
| Authentication | DONE | Authenticated user context includes school/platform memberships and guardian links. |
| Tenant isolation | DONE / VERIFY | RLS plus role-aware authorization and cross-domain scope triggers protect major operational chains. |
| RLS performance hardening | DONE CURRENT PASS / VERIFY | Direct `auth.uid()` init-plan hotspots and overlapping manage/read policies were hardened without broadening access. |
| Physical indexes | DONE CURRENT PASS / VERIFY | Public-schema FK coverage is complete for current domains; latest advisor pass reports no unindexed-FK findings. |
| Platform administration | DONE FOUNDATION / VERIFY | Tenant/school onboarding, invitations, feature entitlements, school settings and lifecycle history. |
| Design system | DONE / EVOLVING | UI foundation is stable and shared controls/tokens are used for operational slices. |
| Notifications | DONE FOUNDATION | User-scoped inbox; invitations and published reports create durable notifications. |
| Account profile | DONE FOUNDATION / VERIFY | Avatar, password workspace and account menu implemented. |
| Calendar | DONE FOUNDATION / VERIFY | Academic year/term and expected-school-day overrides exist. |

## Learner, staff, timetable and attendance

| Area | Status | Notes |
|---|---|---|
| Learner identity / enrolment | DONE FOUNDATION | Long-lived learner identity, stable admission number and effective-dated enrolment. |
| Learner operational profile | DONE CURRENT PASS / VERIFY | Preferred name/photo editing is available while official identity/enrolment corrections preserve governance/history. |
| Academic structure | DONE / VERIFY | Configurable grades/classes/subjects with safe correction semantics. |
| Subject maintenance | DONE CURRENT PASS / VERIFY | Existing subjects can be corrected; referenced subjects are protected from destructive deletion and can be archived. |
| Staff identity | DONE FOUNDATION / VERIFY | Tenant-wide staff identity remains separate from Auth accounts. |
| Single staff creation | DONE CURRENT PASS / VERIFY | School administrators can create/assign operational staff without requiring a login account, using governed identity/placement rules. |
| Staff school assignments | DONE FOUNDATION / VERIFY | Effective-dated placements allow staff to exist operationally before an account invitation; overlapping same-school placements are blocked. |
| Staff directory | DONE CURRENT PASS / VERIFY | Directory merges effective school placement with account-role membership rather than hiding staff without login accounts. |
| Timetable | DONE FOUNDATION / VERIFY | Offerings, allocations, periods, rooms and conflict-safe slots. Teacher selectors include actively assigned staff even before account onboarding. |
| Timetable → lesson attendance | DONE FOUNDATION / VERIFY | Teaching slots link to the separate subject-period attendance workflow. |
| Daily / weekly register | DONE FOUNDATION / VERIFY | Exception-first daily and Monday-Friday weekly capture; mobile capture operational. |
| Attendance evidence | DONE FOUNDATION / VERIFY | Private JPG/PNG/WebP/PDF evidence with mobile camera capture. |
| Subject-period attendance | DONE FOUNDATION / VERIFY | Physically separate from official morning/Ministry attendance. |
| Late arrival | DONE FOUNDATION / VERIFY | Delegated late-arrival capture remains separate from official attendance statistics. |
| Detention sessions | DONE FOUNDATION / VERIFY | Detention obligations can be scheduled, supervised and completed with cross-school integrity enforcement. |
| Expected school days | DONE FOUNDATION / VERIFY | Monday-Friday default plus closure/special-day overrides; report snapshots distinguish expected from recorded days. |

## Guardians, parents and onboarding

| Area | Status | Notes |
|---|---|---|
| Guardian identities | DONE FOUNDATION / VERIFY | Reusable tenant person identity rather than repeated learner fields. |
| Learner guardian relationships | DONE FOUNDATION / VERIFY | Effective-dated legal/emergency/pickup relationships plus contact/address history. |
| Sibling guardian reuse | DONE FOUNDATION / VERIFY | Existing guardian identities can be linked to multiple learners without duplicate person records. |
| Guardian import reconciliation | DONE CURRENT PASS / VERIFY | Existing learner-linked guardians can be reused safely by exact relationship context; identity/name conflicts still require review and names are never used as a global merge key. |
| Authoritative guardian contact/address enrichment | DONE / VERIFY | Production workbook completed on 30 Aug 2026: 1,429/1,429 relationship rows mapped uniquely to existing relationships; guardian profiles remained 1,377 and active relationships 1,429; 2,697 deduplicated contacts and 2,814 deduplicated addresses were added with zero active duplicate or placeholder records in the post-load audit. |
| Parent account claim | DONE FOUNDATION / VERIFY | Account may claim a guardian profile only when Auth email exactly matches an active guardian email contact. |
| Parent portal | DONE FOUNDATION / VERIFY | `/parent` supports exact-email claim, child switching, published official results, frozen report attendance, secure report artifacts, child finance summaries and directly delivered account messages. |
| Parent messages | DONE CURRENT PASS / VERIFY | Only canonical communications explicitly delivered to the signed-in `user_id` are exposed. |
| Parent finance | DONE CURRENT PASS / VERIFY | Linked-child invoices and payment history are exposed through a governed RPC without broadening base finance-table RLS. |
| Learner import | DONE FOUNDATION / VERIFY | CSV/XLSX source parsing feeds the same source-preserving staging/reconciliation architecture. |
| Staff import | DONE CURRENT PASS / VERIFY | Employee-number-based deterministic reconciliation supports create/link/skip and effective placements independently of Auth accounts. |
| Guardian import | DONE CURRENT PASS / VERIFY | Learners resolve by school admission number; guardian matching preserves identity and explicit conflict review. |
| Academic-structure import | DONE CURRENT PASS / VERIFY | Grades/classes/subjects reconcile by stable school/year codes and commit through existing academic RPCs. |
| Import mutation boundary | DONE CURRENT PASS / VERIFY | Authenticated clients have read-only staging tables; mutation is RPC-only and covered by privilege tests. |
| XLSX import | DONE CURRENT PASS / VERIFY | XLSX parser dependency is integrated and uses the same governed staging/reconciliation rules as CSV. |

## Learner conduct, support and LTSM

| Area | Status | Notes |
|---|---|---|
| Conduct / achievement | DONE CURRENT PASS / VERIFY | Combined Conduct workspace now records and reads policy-driven incidents and achievements, supports atomic single/group capture, grade/class/learner history filters, archived-category history and learner-profile entry points. School policy management is principal/admin governed; legacy free-text codes remain compatible pending explicit reconciliation. |
| Learner support | DONE FOUNDATION / VERIFY | Restricted/highly-restricted cases and append-oriented interventions. |
| Resource catalog / copies | DONE FOUNDATION / VERIFY | Shared textbook/library/resource/device model with barcode/asset, condition and location. |
| Loans / issue / return | DONE FOUNDATION / VERIFY | Governed transactions with one-open-loan-per-copy protection. |

## Sports & houses

| Area | Status | Notes |
|---|---|---|
| Sports / house foundation | DONE CURRENT PASS / VERIFY | Configurable houses, colors/codes, annual sports settings, non-overlapping age groups, learner/staff house assignments and one leader per year. |
| Sports mutation boundary | DONE CURRENT PASS / VERIFY | Authenticated users have read access only to base sports tables; management changes use governed security-definer RPCs. |

## Communications

| Area | Status | Notes |
|---|---|---|
| Canonical message / recipients | DONE FOUNDATION / VERIFY | Provider-independent app/email/SMS/WhatsApp/letter intent and recipient state. |
| Delivery outbox | DONE FOUNDATION / VERIFY | Recipient jobs support claim, retry, dead-letter and service-role worker boundaries. Provider acceptance is `submitted`, not falsely treated as final delivery. |
| Provider routing | DONE CURRENT PASS / VERIFY | Effective tenant/school channel routing metadata exists; provider credentials are excluded from PostgreSQL domain records and provider-route reads are leadership/platform scoped. |
| Delivery attempt / receipt history | DONE CURRENT PASS / VERIFY | Append-oriented attempts plus signed provider receipts distinguish accepted submission from final delivered/failed truth and are privacy-scoped to the governed message ledger. |
| Worker recovery | DONE FOUNDATION / VERIFY | Stale claimed communication jobs can be safely returned to retry/dead states by service-role recovery. |
| Parent message read model | DONE CURRENT PASS / VERIFY | Directly delivered signed-in-user messages can be read without granting parent accounts general communication-table access. |
| Governed communication templates | DONE CURRENT PASS / VERIFY | School templates use approved language/version records, declared variables and secret-free provider bindings; WhatsApp fails closed without an active approved template/binding for the resolved provider. |
| Actual vendor transports | DONE CURRENT PASS / VERIFY LIVE | Resend email, Bird SMS and governed Bird WhatsApp adapters are implemented with server-only credentials, provider idempotency and signed terminal delivery webhooks. Production remains VERIFY until real credentials, Namibia sender/destination/template onboarding and live provider send/receipt tests are completed. |
| Communication read isolation | DONE CURRENT PASS / VERIFY | Real `authenticated`-role pgTAP covers message, recipient, job, attempt, receipt and provider-route visibility for leadership, authors, peer teachers and legitimate other-school administrators. |

## Admissions, examinations, finance and progression

| Area | Status | Notes |
|---|---|---|
| Admission applications | DONE FOUNDATION / VERIFY | Pre-enrolment workflow separate from authoritative learner identity. |
| Transfers | DONE FOUNDATION / VERIFY | Source provenance preserved and source enrolment closes rather than being rewritten. |
| Promotion rule sets/evaluation | DONE FOUNDATION / VERIFY | Versioned deterministic rules; no guessed Namibia rule hard-coding. |
| Promotion attendance readiness | DONE CURRENT PASS / VERIFY | Promotion attendance is enrolment-period-clamped and missing register days do not silently count as present. |
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
| Final-term semantics | DONE CURRENT PASS / VERIFY | Year-end progression is included only on the configured final academic term. |
| Attendance semantics | DONE CURRENT PASS / VERIFY | Snapshots store expected school days, recorded days and register coverage rather than treating recorded rows as expected days. |
| Postal correspondence rule | DONE CURRENT PASS / VERIFY | Report-card guardian correspondence uses postal address only; residential address is not silently substituted. |
| Certification / publication | DONE FOUNDATION / VERIFY | Exact snapshot versions are certified/published; linked guardians read only published snapshots. |
| Durable bulk report workflow | DONE CURRENT PASS / VERIFY | Bulk is the primary management flow with Whole School / Grade / Class / Custom scopes, one selected term, durable per-learner jobs, explicit skipped/failed reasons and refresh-safe progress. |
| Bulk publication | DONE CURRENT PASS / VERIFY | Generate → Certify → Publish → Prepare PDFs is supported in durable batches. Publish delegates to the canonical per-snapshot RPC so supersession, guardian notifications and audit provenance remain unchanged. |
| Report-card document metadata | DONE FOUNDATION / VERIFY | Rendered artifacts are registered against immutable certified/published snapshots with hash/template/storage metadata. |
| Private artifact storage | DONE FOUNDATION / VERIFY | `report-card-artifacts` is private; document opening is authorized before short-lived signed URLs are issued. |
| HTML renderer / render outbox | DONE FOUNDATION / VERIFY | Deterministic HTML renderer, format-scoped claim, retry/dead lifecycle, stale-lock recovery and internal worker endpoint exist. |
| Automatic worker invocation | DONE CURRENT PASS / VERIFY | Report actions kick the durable worker immediately; the authorized scheduler endpoint remains available for recovery. Hobby-compatible daily Vercel cron is the deployment fallback when configured. |
| PDF renderer | DONE CURRENT PASS / VERIFY | Genuine `application/pdf` artifacts are rendered from immutable snapshots with real page counts, SHA-256 hashes, private storage and separate HTML/PDF jobs. |
| Combined bulk PDF | DONE CURRENT PASS / VERIFY | PDF batches can produce one durable combined printable PDF while retaining individual immutable report PDFs as canonical artifacts. |
| Secure artifact opening/download | DONE CURRENT PASS / VERIFY | User-scoped report-document/batch authorization occurs before a short-lived private-storage URL is minted. |

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
| Generic mapping compiler | DONE FOUNDATION / VERIFY | Declarative `source_path → target_path` compiler validates required values/types and deliberately does not invent Ministry fields. |
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

Report cards: `scope + term → durable Generate → Certify → Publish → durable PDF preparation → combined printable PDF → guardian access/notification; individual mode remains for exceptions/reprints`

Progression: `locked official results + active versioned promotion rules → explainable evaluation → reviewed progression → governed approval/lock`

Curriculum: `verified NIED source → curriculum version → units/objectives/competencies → school overlay → pacing → class schedule → lesson prep → actual teaching/coverage`

Statutory: `versioned authoritative form → cycle/reference date → operational snapshot → generic mapping/readiness → certification → form-specific export once authoritative mapping exists`

Imports: `CSV/XLSX → source-preserving RPC-only staging → structural validation → stable-identifier/code reconciliation → explicit human conflict review → ready batch → atomic governed commit → audit`

Communications: `canonical message → recipients → governed template/binding where required → outbox → provider route → service worker submission → submitted → signed provider receipt → delivered/failed → retry/dead/stale-lock recovery`

## Approved next implementation sequence

1. **Conduct role/device QA and legacy-category reconciliation** — exercise principal, counsellor, assigned teacher and class-teacher workflows with non-sensitive fixtures; review every legacy category code with each school before tightening the new category reference to `NOT NULL`.
2. **Seasonal and weekday-specific bell schedules** — add effective-dated schedule versions alongside existing timetable periods and rotating-day resolution; use the supplied summer/winter and Friday sheets as test fixtures, not default policy.
3. **Production/role QA for completed report-card bulk workflow** — exercise management and guardian flows with non-sensitive seeded fixtures, including large scopes, skipped rows, publish notifications, PDF retries and combined export access.
4. **Behavioral integrity tests** — continue cross-school invalid-write fixtures, parent/child isolation, staff-assignment/import idempotency and remaining domain edge cases.
5. **Live communication provider verification** — provision real Resend/Bird deployment secrets outside source control, complete Namibia sender/destination/template onboarding, register production webhooks and verify test sends plus signed terminal receipts before enabling production communication traffic.
6. **Authoritative statutory mappings** — add actual EMIS/AEC mappings only when current Ministry forms/rules are verified.
7. **Parent/role operational QA** — exercise guardian claim, report artifact, finance, messaging and staff-without-account workflows using non-sensitive fixtures.
8. **Consolidated UI/IA and responsive QA** after remaining operational slices stabilize.

## Security / advisor notes

- `get_school_invitation_preview(text)` intentionally permits anonymous execution for the public invitation-preview flow.
- Many authenticated `SECURITY DEFINER` RPC warnings are intentional because these functions are the self-authorizing signed-in API boundary. Audit each function individually; do not blindly revoke application RPC execution.
- Worker-only claim/complete/fail/recovery functions remain service-role only and are covered by pgTAP privilege checks.
- Communication RLS policies must call narrow policy-safe wrappers when the underlying authorization helper is intentionally private; do not grant clients direct execution merely to make an RLS expression work.
- Import staging tables are read-only to authenticated clients; source rows, resolutions and commit results can only be mutated through governed import RPCs.
- The one-time guardian XLSX production staging helper used on 30 Aug 2026 is retired by migration `20260830230500_retire_guardian_import_loader.sql` and must not be recreated as a general ingestion API.
- `recalculate_finance_invoice(uuid)` is intentionally not executable by authenticated clients; governed allocation workflows invoke it internally.
- Latest performance-advisor pass has no unindexed-FK warnings. `unused_index` entries are expected during an early/low-data system and are not grounds for premature deletion.
- Supabase leaked-password protection is still disabled at the project configuration level and should be enabled before production onboarding when available.

## Takeover rule

Before beginning work, inspect the repository and this document. Do not recreate completed schema, replace established token systems, hard-code tenant modes, guess Namibia policy/form fields, bypass authorization architecture, merge learner/staff/guardian identities by name, expose provider secrets in domain tables, recreate retired one-time production loaders, or recompute certified historical documents from later live data. Continue from the first **IN PROGRESS** or **NEXT** item that matches the requested feature.
