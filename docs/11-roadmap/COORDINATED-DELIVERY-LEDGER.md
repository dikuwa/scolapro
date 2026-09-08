# Coordinated delivery ledger

Baseline: `2de793a6ef901b48d67a5cacc197d5393deb90e7` (`main`, 8 September 2026).

This ledger is governed together with `docs/11-roadmap/CONTROL-ROOM.md`. Current `main` plus repository documents are authoritative over stale chat context. Statuses distinguish source implementation from verified delivery; no production-browser/live-data acceptance is implied by source integration alone.

## Current ownership and merge order

- **Control Room / Integration** — roadmap, ownership, shared-file coordination, PR review, merge order and integrated `main`.
- **Governance reconciliation** — docs-only bounded lane for the three roadmap governance files.
- **Deployment reconciliation** — production/shared database migration drift is unresolved environment work, not missing source feature work.
- **UI/runtime consistency** — bounded external lane when/if represented by a PR; branch `fix/ui-consistency-avatar-and-pickers` exists at reconciliation time, but no matching open PR was found.
- **N06** — SOURCE-GATED pending verified Ministry form/mapping material.
- **N11** — REQUIREMENTS-GATED pending authoritative coursework/moderation requirements.
- **Operational QA / live verification** — remaining role/device/real-data acceptance across integrated domains.
- **Paused document lane** — report cards, official documents, renderers/artifacts and branding; preserve integrated work unless explicitly reassigned.

## Integrated roadmap log

- **PR #353** — runtime stability audit/fix integrated; production drift identified for School Settings, CRC Custody and Academic Setup.
- **PR #354** — N17/N18/N19 + T04/T05 bell/calendar foundation integrated.
- **PR #355** — N02/N03/N04 education-network hierarchy, external identifiers and scoped network roles integrated.
- **PR #357** — N05 statutory lifecycle workspace integrated.
- **PR #358** — N08 DNEA candidate readiness/review integrated.
- **PR #359** — N13 staffing establishment/vacancy foundation integrated.
- **PR #360** — N14 staffing establishment operational reconciliation integrated.
- **PR #361** — N21 official-result symbol distributions and exam-series comparisons integrated.
- **PR #362** — N20 versioned control forms foundation integrated.
- **PR #363** — N15 lean hostel/feeding foundation integrated.
- **PR #364** — N16 privacy-preserving inclusion/SEN aggregate reporting integrated.
- **PR #365** — N09 examination-centre model integrated.
- **PR #366** — N10 restricted examination-access arrangements integrated.
- **PR #367** — N08 readiness authorization/freshness hardening integrated.
- **PR #368** — N12 frozen examination registration submission and governed results ingest integrated.
- **PR #369** — N07 operational statutory snapshot extensions integrated.
- **PR #370** — canonical metric registry and first network-safe aggregate foundation integrated.

N06 remains intentionally absent because authoritative Ministry mappings are not yet available. N11 remains intentionally absent because requirements are not yet authoritative.

## Roadmap requirements

| ID | Requirement | Current state | Acceptance / remaining work |
|---|---|---|---|
| T01 | Per-school weekday / rotating cycles, lengths 1–10 | INTEGRATED / VERIFY | Defaults unchanged; invalid lengths/shrinking past used days rejected |
| T02 | Dynamic day picker/grid and maintenance labels | INTEGRATED / VERIFY | 10-day display and weekday labels agree throughout |
| T03 | Calendar resolution for rotating days | INTEGRATED / VERIFY | Closure days and anchors resolve consistently |
| T04 | Numbered setup steps 1/2/3; Teaching periods “Anytime” | INTEGRATED via PR #354 | UI/device verification only |
| T05 | Configured subjects collapsed by default | INTEGRATED via PR #354 | UI/device verification only |
| T06 | Continuous expanded guardian background | BACKLOG / VERIFY | Visual consistency in both themes |
| T07 | Avatar error diagnosis and JPG/WebP upload | BOUNDED UI/RUNTIME QA | Live original failure/success verification remains |
| T08 | Learner photo immediate preview and pending overlay | BOUNDED UI/RUNTIME QA | Pending/error/format behavior verification remains |
| T09 | Learner photo link/upload diagnostics | BOUNDED UI/RUNTIME QA | Privacy-safe diagnostics only |
| T10 | Cumulative-record route error/query diagnostics | DEPLOYMENT FOLLOW-UP | Verify required CRC RPC migrations are actually deployed |
| T11 | Official identity fields read-only | INTEGRATED / VERIFY | No direct identity write path |
| T12 | Optional administrator correction auto-approval | DEFERRED | Preserve audit if adopted |
| C01–C12 | Conduct domain/workflow | INTEGRATED / VERIFY | Legacy-category reconciliation and role/device QA remain |
| N01 | Capture once; reuse authoritative backend | STANDING RULE | No parallel authoritative records |
| N02 | Normalized authority/region/circuit/cluster hierarchy | INTEGRATED via PR #355 | Valid nested/effective-dated relationships |
| N03 | Versioned external school identifiers/registries | INTEGRATED via PR #355 | Preserve source/version/effective dating; no invented identifiers |
| N04 | Circuit/regional permission tier | INTEGRATED via PR #355 | Network scope without automatic sensitive learner/staff access |
| N05 | Statutory cycle/readiness/snapshot/certification UI | INTEGRATED via PR #357 | Operational QA and deployment verification only |
| N06 | Fifteenth School Day form then AEC | SOURCE-GATED | Verify current Ministry source before publishing mappings/validation/export |
| N07 | Operational statutory snapshot coverage | INTEGRATED via PR #369 | Reuses canonical staffing, hostel/feeding, network and identifier facts; no duplicate store |
| N08 | DNEA candidate readiness/review | INTEGRATED via PRs #358/#367 | Operational QA; preserve aggregate-only network boundary |
| N09 | Examination centre separate from school | INTEGRATED via PR #365 | No assumption school=centre; official codes remain source-provenanced |
| N10 | Access arrangements/special considerations | INTEGRATED via PR #366 | Individual data remains school exam-management restricted |
| N11 | Coursework/moderation evidence | REQUIREMENTS-GATED | Verify official subject/coursework requirements first |
| N12 | Frozen exam registration submission + results import | INTEGRATED via PR #368 | External production DNEA/Ministry contract not claimed |
| N13 | Staffing establishment/vacancies | INTEGRATED via PR #359 | Vacancy derived from effective occupancy; no duplicate staff identity |
| N14 | Staffing establishment operational reconciliation | INTEGRATED via PR #360 | School-level aggregate reconciliation implemented |
| N15 | Lean hostel/feeding | INTEGRATED via PR #363 | Minimum operational records and safe aggregates implemented |
| N16 | Inclusion/SEN aggregate classification | INTEGRATED via PR #364 | Aggregate-only; no case notes/identity leakage |
| N17 | Calendar teaching-impact semantics | INTEGRATED via PR #354 | Operational/device verification remains |
| N18 | Seasonal/day-specific bell schedules | INTEGRATED via PR #354 | Effective-dated/day-aware resolution implemented |
| N19 | Bell schedule fixture coverage | INTEGRATED via PR #354 | Fixtures only; not universal policy |
| N20 | Control templates/cycles | INTEGRATED via PR #362 | Versioned/frozen/audited foundation implemented |
| N21 | Symbol distribution and exam-series comparisons | INTEGRATED via PR #361 | Canonical `official_results` only; no mark re-entry |
| N22 | Shared school identity header and print chrome | INTEGRATED FOUNDATION | Document-lane QA only when resumed |
| N23 | Official logo/watermark artwork | INTEGRATED ASSET BASELINE | Do not fabricate missing assets |
| N24 | Canonical metric registry/restrained charts | INTEGRATED FOUNDATION via PR #370 | Extend only through canonical registry/network-safe aggregate model |
| N25 | Circuit/regional/Ministry read models | PARTIAL FOUNDATION INTEGRATED | Extend purpose-built safe aggregates via canonical metric registry; no learner-level default drill-down |
| N26 | Previously missing original directive content | CLOSED | Requirements available |

## Immediate dependency gates

### Gate A — Core network/domain foundations
**SATISFIED / INTEGRATED.** N02–N05, N07–N10 and N12–N21 listed above are source-integrated in current `main`.

### Gate B — Canonical metric/network aggregate foundation
**SATISFIED / INTEGRATED.** PR #370 established the canonical metric registry and first network-safe aggregate path. New dashboards/analytics must extend this architecture rather than define local metric semantics or parallel aggregate stores.

### Gate C — N06 statutory mappings
**BLOCKED ON SOURCE.** No implementation until current official Ministry material is verified. Do not invent field names, codes, mappings or validation rules.

### Gate D — N11 coursework/moderation
**BLOCKED ON REQUIREMENTS.** Do not infer or generalize coursework/moderation obligations without authoritative requirements.

### Deployment/runtime drift gate
**UNRESOLVED DEPLOYMENT WORK.** PR #353 established that production/shared environments can lack source-controlled RPCs/tables/columns used by integrated routes. Apply and verify migrations in repository order through the designated deployment path. Do not recreate source features or hide drift with UI fallbacks.

### UI/runtime consistency gate
Treat current UI/runtime consistency work as a bounded external lane. At reconciliation time, `fix/ui-consistency-avatar-and-pickers` exists, but no matching open PR was found; update this ledger if/when such a PR is opened or merged.

## Next roadmap sequence

1. Resolve production/shared database migration drift and verify affected runtime routes.
2. Complete bounded UI/runtime consistency QA/fixes without reopening integrated domain architecture.
3. Perform role/device/live-data QA across integrated statutory, DNEA, staffing, hostel/feeding, inclusion, control, examination-comparison and network aggregate workflows.
4. Extend canonical metrics/network-safe read models only where authoritative domain facts and explicit disclosure policy exist.
5. Implement N06 only after verified Ministry source material is available.
6. Implement N11 only after authoritative coursework/moderation requirements are confirmed.
7. Complete live communication-provider verification and other deployment-specific operational checks.
8. Resume consolidated UI/IA and document-lane polish under explicit ownership.

## Integration checklist

- Read `AGENTS.md` and `CONTROL-ROOM.md` before starting a branch.
- Preserve another active stream's owned files.
- Do not reopen integrated roadmap items as “missing” without repository evidence and Control Room assignment.
- Review migration timestamps against latest `main`; never rename a deployed migration.
- Require Database CI green for migration-owning PRs.
- Require exact-head required CI before declaring merge-ready.
- Apply shared-environment migrations only through the designated integration/deployment workflow.
- Record tests, unverified scenarios, dependencies and merge SHA honestly.
- Use the mandatory handback template from `CONTROL-ROOM.md`.
