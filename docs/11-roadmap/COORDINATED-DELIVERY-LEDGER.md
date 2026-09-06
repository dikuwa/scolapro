# Coordinated delivery ledger

Baseline: `f4f2fdc1` (main, PR #331), inspected 6 September 2026.

Ownership: Codex owns Conduct and bell/calendar work. Remote GPT owns report cards, official document contracts/renderers and artifacts (handoff: PR #332, head `8f2125b`). That PR's database failure is reported by its owner, not independently cleared here. Preserve school identity snapshots and unrelated local work. Separate worktrees/branches; integrate tested slices sequentially. Shared database deployment has one integration owner and is not part of this local implementation.

Statuses distinguish code from verified delivery. No live-data or production-browser acceptance is implied by source inspection. Phase 1 is the executable slice; later phases require their own implementation specifications and source checks.
Statuses distinguish code from verified delivery. No live-data or production-browser acceptance is implied by source inspection. Phase 1 is the executable slice; later phases require their own implementation specifications and source checks.

## Integration log

- **6 Sep 2026 — Conduct merged.** PR #340 (`codex/conduct`, head `99c1d762`, additive migration `20260906120000_conduct_policy_workflow.sql`) merged into `main` at `535cdfab426d9fd9930b63daea81addc3f22528c`. Application CI (`quality`) and Database CI (`validate`) were green at head; head unchanged at merge; migration timestamp unique vs `main` (`20260906063000_timetable_rotating_calendar_anchor.sql` was newest prior). No overlapping open PRs. Referral-write table grants preserved (the regression was reverted; revocation confined to the new group RPCs). Use merge SHA `535cdfa` as the baseline for the bell/calendar phase below.

| ID | Attachment requirement | Existing evidence / remaining work | Owner / phase | Acceptance |
|---|---|---|---|---|
| T01 | Per-school weekday / rotating cycles, lengths 1–10 (weekday ≤7) | Existing cycle settings, day-labels and `20260906043000_timetable_cycle_modes.sql`; verify rather than recreate | Codex / verify | Defaults unchanged; invalid length and shrinking past used days rejected |
| T02 | Dynamic day picker/grid and maintenance labels | Existing timetable workspace, current maintenance and plan management use cycle labels | Codex / verify | 10-day display and weekday labels agree throughout |
| T03 | Calendar resolution for rotating days | Existing anchor/resolver migrations and Namibia-time today fix (#330/#331) | Codex / phase 2 | Closure days and anchors resolve consistently |
| T04 | Numbered steps 1/2/3; periods marked Anytime | No StepBadge/Anytime implementation found in workspace on baseline | Codex / phase 2 | Clear setup sequence without numbering independent periods |
| T05 | Configured subjects collapsed by default | Existing maintenance list needs requested collapse check/update | Codex / phase 2 | Closed initially; edit/archive work after expansion |
| T06 | Continuous expanded guardian background | Guardian directory exists; visually verify seam | Codex / verification backlog | Expanded row/panel share surface in both themes |
| T07 | Avatar error diagnosis and JPG/WebP upload | Profile server actions contain error-specific diagnostics; live original failure and upload success not reproduced | Codex / verification backlog | Record actual sanitized failure evidence and authenticated successful uploads |
| T08 | Learner photo immediate preview and pending overlay | Learner profile editor has local preview; verify pending/format handling | Codex / verification backlog | Preview before save; failed upload retains input; JPG/WebP succeed |
| T09 | Learner photo link/upload diagnostics | Existing learner/profile server diagnostics; review privacy before adding logs | Codex / verification backlog | Identify failure stage without sensitive payloads |
| T10 | Cumulative-record route error boundary and query diagnostics | Route error.tsx already exists; inspect server failure-stage diagnostics | Codex / verification backlog | Recoverable route error and sanitized failing-query identity |
| T11 | Official identity fields read-only | Existing correction-request flow and restricted profile editor | Codex / verify | No direct identity write path introduced |
| T12 | Optional administrator correction auto-approval | Conditional suggestion, not required feature; preserve existing governed requests | Codex / deferred decision | If later adopted, retain request/approval audit |
| C01 | School policy categories, direction, optional severity/points/order | Added additive category migration with school-root integrity and read RLS | Codex / phase 1 | Cross-school writes denied; policy values validated |
| C02 | Event category references and grouping | Added nullable legacy-compatible FK, snapshots and group IDs | Codex / phase 1 | All new UI/RPC events require category; old codes remain readable |
| C03 | Non-null category references after reconciliation | Deferred constraint tightening: legacy direction/label policy must be reviewed, never inferred | Codex / rollout follow-up | Zero unreconciled rows before NOT NULL; no historical recategorization |
| C04 | Manage/edit/archive categories | Governed RPCs and Academic setup section | Codex / phase 1 | Admin/principal only; no deletion; configured list initially collapsed |
| C05 | Atomic single/group recording | Shared private implementation; scoped public incident/achievement RPCs | Codex / phase 1 | Deduplication, rollback, date, tenant and recorder tests |
| C06 | Combined Conduct page and sidebar | `/conduct`, two record types, role-aware navigation | Codex / phase 1 | Both types accessible to appropriate roles |
| C07 | Grade/class filters and grouped recent history | Scoped roster RPC; RLS history RPC pages whole visible groups | Codex / phase 1 | Filters, pagination, no unauthorized group-member disclosure |
| C08 | Incident modal fields and category-driven direction | Shared controls and modal; editable negative severity | Codex / phase 1 | Single/group, positive/negative and validation behavior |
| C09 | Achievement fields and allowed levels | Shared form uses existing schema levels | Codex / phase 1 | Valid levels accepted; counsellor creation denied |
| C10 | Archived category readable in history | Frozen event snapshot with legacy-code fallback | Codex / phase 1 | Archive/rename does not change prior meaning |
| C11 | Learner longitudinal history link | Profile link to learner-filtered Conduct | Codex / phase 1 | Cross-class history within authorized school; no support notes |
| C12 | Migration/route/diff evidence and quality checks | Migration, new feature files and regression suite committed per phase | Codex / phase 1 | Tests plus role/device acceptance recorded honestly |
| N01 | Capture once; existing backend reuse | Reuse conduct, statutory, DNEA, promotion and operational snapshots | Both / all | No parallel authoritative records |
| N02 | Normalized region/circuit/optional cluster hierarchy | Not found in baseline migrations | Codex / phase 4 | Effective school relationships, nullable official codes |
| N03 | Versioned external school identifiers / official registries | Existing bare school EMIS; preserve compatibility with frozen document identity | Codex + GPT contract / phase 4 | No invented codes; source/version recorded |
| N04 | Circuit/regional permission tier | New scoped access required; avoid blanket school-role widening | Codex / phase 4 | Assigned network scope, sensitive-data isolation tests |
| N05 | Statutory cycle/readiness/snapshot/certify UI | Foundation/generator exist; UI absent | Codex / phase 3 | Lifecycle uses canonical engine; certified history immutable |
| N06 | Fifteenth School Day form then AEC | Official definitions/mappings not supplied | Codex / source-gated phase 3 | Current official source reviewed before mappings published |
| N07 | Extend operational snapshot field coverage | Extend existing generator only as authoritative staff/programme data exists | Codex / phases 3–5 | Counts derive from effective operational records |
| N08 | DNEA candidate readiness UI | Existing cycles/candidates/subjects/readiness RPCs | Codex / phase 3 | Missing identity/subjects/codes shown as exceptions |
| N09 | Examination centre separate from school | Genuine structural gap | Codex / phase 4 | Candidates can attend designated external centre |
| N10 | Access arrangements/special considerations | Restricted evidence/recommendation/status workflow needed | Codex / phase 4 | Restricted access; approved aggregate excludes notes |
| N11 | Coursework/moderation evidence | Requirement-dependent future feature | Codex / backlog | Verify actual requirements before schema/UI |
| N12 | Frozen exam registration export/submission, results import | Missing; official export depends on GPT document contract | Codex + GPT / backlog | Immutable submitted version; source-preserving import |
| N13 | Staffing establishment and vacancies | Staff identity/placements exist; establishment gap | Codex / phase 4 | Approved/filled/vacant counts reconcile without duplicated staff |
| N14 | Staff qualifications, specialization, attrition | Progressive extension with restricted particulars | Codex / phase 4 | Authorized capture and safe aggregates |
| N15 | Lean hostel and feeding | Not found in baseline | Codex / phase 5 | Minimum operational records generate aggregates |
| N16 | Inclusion/SEN aggregate classification | Restricted cases exist; approved aggregate layer missing | Codex / phases 4–5 | No case-note exposure through aggregate access |
| N17 | Ministry calendar + school overlay and teaching impact | Existing school calendar/expected days; source/impact extension needed | Codex / ACTIVE (next, post-Conduct `535cdfa`) | Explicit no-teaching/partial/altered/exam semantics; preserve attendance history |
| N18 | Seasonal/day-specific bell schedules | New versioned layer alongside existing periods; the current `20260906063000_timetable_rotating_calendar_anchor.sql` and cycle modes are the foundation, not to be rebuilt | Codex / ACTIVE (next, post-Conduct `535cdfa`) | Date/weekday resolution; unchanged lesson identity/history |
| N19 | Visual bell references | Four examples: summer/winter × Mon–Thu/Friday, 8 lessons, first bell, assembly/register/break | Codex / ACTIVE — fixtures for N18 | Reproduce examples as test fixtures, never universal seeded policy |
| N20 | Control templates/cycles | New departmental/prep/class/written-work control workflows | Codex / phase 5 | Configurable checklist; authoritative sources reused |
| N21 | Symbol distribution and series/year comparisons | Aggregate canonical official results used by report cards | Codex / phase 5 | Version-aware comparisons; no mark re-entry |
| N22 | Shared school identity header and print chrome | GPT owns active #332 and later A4 framework | GPT / active | Renderer/artifact checks green before integration |
| N23 | Watermark/logo artwork | Real asset missing per GPT; do not fabricate replacement | GPT / source-gated | Supplied approved artwork used |
| N24 | Canonical metric registry and restrained charts | Mentioned in unavailable original sections | Codex / later specification | Define metrics from authoritative data before charts |
| N25 | Circuit/regional portals | Purpose-built aggregate views after school truth and scoped hierarchy | Codex / phase 5 | Scope/isolation and sensitivity tests |
| N26 | Referenced original K/M/N/O/Q/R/S/T/U, citations, non-goals/checklist | Full original directive is not supplied; cannot treat missing details as implemented specifications | Unresolved source | Obtain original sections or explicit replacement requirements before closing |

## Integration checklist

- Preserve original worktree changes to dependencies, Trigger.dev and branding.
- No edits to GPT-owned report-card rendering, shared document contracts or school identity semantics.
- Review migration timestamps against current main before each merge; never rename a deployed migration.
- Require database CI green; local PostgreSQL checks alone are not a substitute for Supabase CI.
- Shared environment migrations are applied only by the designated integration/deployment workflow.
- Keep each phase's commit, tests, unverified scenarios and remaining work in implementation status.
