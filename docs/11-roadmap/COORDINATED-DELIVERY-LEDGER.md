# Coordinated delivery ledger

Baseline: `3bce93817d4d827e7403df960a92aca474a9ae1d` (`main`, 7 September 2026).

This ledger is governed together with `docs/11-roadmap/CONTROL-ROOM.md`. The control-room document defines parallel-thread ownership, branch discipline, merge order and the mandatory completion handback. Current `main` plus repository documents are authoritative over stale chat context.

Statuses distinguish source implementation from verified delivery. No live-data or production-browser acceptance is implied by source inspection alone.

## Current ownership and merge order

- **Control Room / Integration** — roadmap, ownership, shared-file coordination, PR review, merge order, ledger updates and integrated `main`.
- **Stream A — Bell/calendar foundation** — N17/N18/N19 + T04/T05. This is the first active foundation merge.
- **Stream B — Education network foundation** — N02/N03/N04. May develop in parallel, but follows the bell/calendar foundation in coordinated merge order.
- **Stream C — Runtime stability** — broken-page/runtime/database-drift root causes outside another stream's owned files.
- **Stream D — Governance/QA docs** — ledger, dependencies, acceptance evidence and handbacks.
- **Paused document lane** — report cards, official documents, renderers/artifacts and branding. Preserve completed work; do not modify from unrelated streams without reassignment.

## Integration log

- **6 Sep 2026 — Conduct merged.** PR #340 merged into `main` at `535cdfab426d9fd9930b63daea81addc3f22528c`. Application and Database CI were green at exact head. Conduct remains complete except explicitly listed follow-up verification/reconciliation items.
- **6–7 Sep 2026 — Official document framework advanced.** PRs #341–346 landed shared class-list/report document header/footer/print infrastructure. N22 is no longer an active-framework gap.
- **6 Sep 2026 — Official brand assets landed.** PR #347 added official ScolaPro assets and Namib High crest/full logo, wired to shell/login/manifest and document HTML support. N23's prior “real asset missing” wording is obsolete.
- **6 Sep 2026 — Report-card fidelity advanced.** PRs #348–349 aligned HTML and native PDF layout with the approved progress-report reference and advanced the renderer revision.
- **6–7 Sep 2026 — Report-card export hardening merged.** PR #350 merged into `main` at `3bce93817d4d827e7403df960a92aca474a9ae1d`, synchronizing renderer V9 combined-export readiness and preserving explicit failed-export retry semantics.
- **6 Sep 2026 — Shell/login branding corrected.** Official ScolaPro branding is now used in the application shell/login path; do not reintroduce the legacy constructed wordmark.
- **7 Sep 2026 — Roadmap sequencing reconciled.** Bell/calendar remains first. Education-network hierarchy and role tier move ahead of DNEA/statutory UI so regional review is implemented against real scope rather than fake platform-admin stand-ins. N26 is closed because the previously missing K/M/N/O/Q/R/S/T/U directive content has now been supplied and reconciled.

| ID | Requirement | Existing evidence / remaining work | Owner / phase | Acceptance |
|---|---|---|---|---|
| T01 | Per-school weekday / rotating cycles, lengths 1–10 (weekday ≤7) | Existing cycle settings/day labels/migrations; verify rather than recreate | Stream A / verify | Defaults unchanged; invalid length/shrinking past used days rejected |
| T02 | Dynamic day picker/grid and maintenance labels | Existing timetable workspace uses cycle labels | Stream A / verify | 10-day display and weekday labels agree throughout |
| T03 | Calendar resolution for rotating days | Existing anchor/resolver and Namibia-time fixes are foundations | Stream A / verify | Closure days and anchors resolve consistently |
| T04 | Numbered setup steps 1/2/3; Teaching periods marked “Anytime” | Not yet completed | Stream A / ACTIVE | Setup sequence clear without numbering independent periods |
| T05 | Configured subjects collapsed by default | Not yet completed | Stream A / ACTIVE | Closed initially; edit/archive after expansion |
| T06 | Continuous expanded guardian background | Existing directory; visual verification remains | Backlog / verify | Expanded row/panel share surface in both themes |
| T07 | Avatar error diagnosis and JPG/WebP upload | Diagnostics exist; live original failure/success not fully reproduced | Backlog / verify | Sanitized failure evidence + authenticated successful uploads |
| T08 | Learner photo immediate preview and pending overlay | Local preview exists; pending/format verification remains | Backlog / verify | Preview before save; failed upload retains input; JPG/WebP succeed |
| T09 | Learner photo link/upload diagnostics | Existing diagnostics; privacy review before more logging | Backlog / verify | Failure stage identified without sensitive payloads |
| T10 | Cumulative-record route error/query diagnostics | Route error boundary exists; server failure-stage verification remains | Backlog / verify | Recoverable error + sanitized failing-query identity |
| T11 | Official identity fields read-only | Existing correction-request flow | Backlog / verify | No direct identity write path |
| T12 | Optional administrator correction auto-approval | Conditional idea, not required | Deferred | Preserve audit if adopted |
| C01 | School conduct policy categories | Implemented via additive Conduct schema/workflow | DONE / verify | Cross-school writes denied; policy validation |
| C02 | Event category references/grouping | Implemented with legacy compatibility | DONE / verify | New events require governed category; history readable |
| C03 | Non-null category after reconciliation | Deliberately deferred | Follow-up | Zero unreconciled legacy rows before tightening |
| C04 | Manage/edit/archive categories | Implemented | DONE / verify | Admin/principal governed; no destructive delete |
| C05 | Atomic single/group conduct recording | Implemented | DONE / verify | Dedup/rollback/date/tenant/recorder tests |
| C06 | Combined Conduct page/sidebar | Implemented | DONE / verify | Appropriate roles access both record types |
| C07 | Conduct roster/history filters | Implemented | DONE / verify | No unauthorized group-member disclosure |
| C08 | Incident modal/category-driven direction | Implemented | DONE / verify | Single/group + validation behavior |
| C09 | Achievement fields/levels | Implemented | DONE / verify | Allowed levels/roles enforced |
| C10 | Archived category remains readable historically | Implemented | DONE / verify | Rename/archive does not rewrite history |
| C11 | Learner longitudinal Conduct history | Implemented | DONE / verify | Authorized cross-class history; no support-note leakage |
| C12 | Conduct migration/route/diff evidence | Implemented and merged | DONE / verify | Role/device acceptance remains honest |
| N01 | Capture once; reuse authoritative backend | Standing architecture rule | All streams | No parallel authoritative records |
| N02 | Normalized authority/region/circuit/optional cluster hierarchy | Ready draft supplied; requires hardening/CI | Stream B / NEXT after A | Valid nested relationships; nullable official codes |
| N03 | Versioned external school identifiers/official registries | Ready draft supplied; preserve bare EMIS compatibility | Stream B / NEXT after A | Source/version/effective dating; no invented identifiers |
| N04 | Circuit/regional permission tier | Ready draft supplied; requires scoping/non-leakage hardening | Stream B / NEXT after A | Assigned network scope without automatic sensitive learner access |
| N05 | Statutory cycle/readiness/snapshot/certify UI | Backend foundation exists; UI incomplete | Later wave after B | Canonical lifecycle; immutable certified history; real network review |
| N06 | Fifteenth School Day form then AEC | Authoritative mappings still source-gated | Later wave after B | Current official source reviewed before publishing mappings |
| N07 | Extend operational statutory snapshot coverage | Extend existing generator only as authoritative domains exist | Later waves | Counts derive from effective operational records |
| N08 | DNEA candidate readiness UI | Existing backend foundation; UI incomplete | Later wave after B | Exceptions visible; real network scoping available |
| N09 | Examination centre separate from school | Structural gap | DNEA wave | External/designated centre supported |
| N10 | Access arrangements/special considerations | Restricted workflow gap | DNEA wave | School → regional → DNEA workflow; aggregate excludes notes |
| N11 | Coursework/moderation evidence | Requirement-dependent future feature | Backlog | Verify official subject requirements first |
| N12 | Frozen exam registration export/submission + results import | Missing | Backlog / document coordination | Immutable submitted version; source-preserving import |
| N13 | Staffing establishment/vacancies | Structural gap | Structural wave | Approved/filled/vacant reconcile without duplicate staff |
| N14 | Staff qualifications/specialisation/attrition | Progressive restricted extension | Structural wave | Authorized capture + safe aggregates |
| N15 | Lean hostel/feeding | Missing | Structural wave | Minimum operational records generate aggregates |
| N16 | Inclusion/SEN aggregate classification | Restricted support cases exist; aggregate layer missing | Structural wave | Aggregate never exposes case notes |
| N17 | Calendar teaching-impact semantics | Existing school calendar foundation; add NORMAL/NO_TEACHING/PARTIAL_DAY/ALTERED_TIMETABLE/EXAM_TIMETABLE and schedule override semantics | Stream A / ACTIVE | Attendance history preserved; altered/exam day resolves deliberately |
| N18 | Seasonal/day-specific bell schedules | Ready SQL draft supplied; harden/CI/UI integration required | Stream A / ACTIVE | Date/day resolution; unchanged lesson/period identity |
| N19 | Visual bell references/test fixtures | Summer/winter × Mon–Thu/Friday examples supplied | Stream A / ACTIVE | Fixtures only; never seeded as universal school policy |
| N20 | Control templates/cycles | Missing | Structural wave | Configurable checklist; authoritative sources reused |
| N21 | Symbol distribution and exam-series comparisons | Missing UI/read models | Structural wave | Canonical official results; no mark re-entry |
| N22 | Shared school identity header and print chrome | Shared HTML/PDF header/footer and official document framework landed through PRs #341–346; report cards migrated to it | Paused document lane / DONE FOUNDATION | Continue renderer/artifact checks only when lane resumes |
| N23 | Official logo/watermark artwork | Official ScolaPro SVG family and Namib High crest/logo-full are committed and wired; large Namib High A4 backdrop is still not committed and must not be referenced as if present | Paused document lane / DONE ASSET BASELINE | Use approved committed assets; do not fabricate missing backdrop |
| N24 | Canonical metric registry/restrained charts | Requirement now fully supplied; intentionally deferred until structural data exists | Later analytics specification | One authoritative definition per metric before charts |
| N25 | Circuit/regional/Ministry read models | Purpose-built aggregates required, not enlarged school dashboards | Final analytics/network wave | Scope isolation; learner-level drill-down separately permissioned |
| N26 | Previously missing original K/M/N/O/Q/R/S/T/U directive content | Content now supplied in master handback and reconciled into roadmap/control-room rules | CLOSED | Requirements available; no longer source-blocked |

## Immediate dependency gates

### Gate A — Bell/calendar foundation
Must complete N17/N18/N19 + T04/T05 with application/database CI and explicit acceptance evidence before being called DONE.

### Gate B — Education network foundation
May be implemented in parallel, but must be hardened for hierarchy integrity, effective dating, network-role scoping and sensitive-data non-leakage. No circuit/region dashboards in this phase.

### Gate C — DNEA/statutory UI
Do not start regional-review UI on fake role semantics. Build after the network role/scoping foundation is real and merge-ready/integrated.

## Integration checklist

- Read `AGENTS.md` and `CONTROL-ROOM.md` before starting a branch.
- Preserve another active stream's owned files.
- Review migration timestamps against latest `main`; never rename a deployed migration.
- Require Database CI green for migration-owning PRs.
- Require exact-head required CI before declaring merge-ready.
- Apply shared-environment migrations only through the designated integration/deployment workflow.
- Record tests, unverified scenarios, dependencies and merge SHA honestly.
- Use the mandatory DONE / IN PROGRESS / BLOCKED handback template from `CONTROL-ROOM.md`.
