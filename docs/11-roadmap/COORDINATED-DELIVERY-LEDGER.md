# Coordinated delivery ledger

Baseline: `5d6958dce25f160b0a6b58567386521066d713a7` (`main`, 8 September 2026).

This ledger is governed together with `docs/11-roadmap/CONTROL-ROOM.md`. Current `main` plus repository documents are authoritative over stale chat context. Statuses distinguish source integration from source verification, live/deployment verification and still-unverified acceptance.

## Current ownership and merge order

- **Control Room / Integration** — roadmap, ownership, shared-file coordination, PR review, merge order and integrated `main`.
- **Governance reconciliation** — docs-only bounded lane for the three roadmap governance files.
- **Deployment reconciliation** — verify later source-controlled migrations and runtime objects in production/shared environments; deployed state must not be inferred from source integration.
- **UI/runtime consistency** — active draft PR #375 (`chatgpt/ui-runtime-consistency-fixes`); separate bounded lane, not part of this governance PR.
- **N06** — SOURCE-GATED pending verified Ministry form/mapping material.
- **N11** — REQUIREMENTS-GATED pending authoritative coursework/moderation requirements.
- **Operational/live QA** — only acceptance dimensions not already source-verified or deployment-verified; preserve exact verification labels.
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
- **PR #370** — N24 canonical metric registry and initial network-safe aggregate foundation integrated.
- **PR #373** — N24 canonical network metric registry expanded across staffing establishment/occupancy/vacancy, hostel capacity/occupancy, feeding service/beneficiary metrics and examination-centre count without creating a parallel fact store.
- **PR #374** — N25 bounded circuit/regional operational analytics read model integrated; aggregate-only composition across authoritative operational domains with explicit non-leakage tests.
- **PR #376** — historical network-authority hardening integrated; authorization is current-membership based while historical fact selection remains `p_as_of` effective-dated.

N06 remains intentionally absent because authoritative Ministry mappings are not yet available. N11 remains intentionally absent because requirements are not yet authoritative.

## Verification classification

- **SOURCE-INTEGRATED** — merged in `main`.
- **SOURCE-VERIFIED** — repository tests/CI or bounded source audit verified the stated behavior.
- **LIVE/DEPLOYMENT VERIFIED** — exercised in a connected deployed environment against the deployed schema/runtime/provider configuration.
- **UNVERIFIED** — not actually exercised; do not infer acceptance from source integration.

Current notable QA/deployment facts:
- N24/N25 network aggregate authorization, reconciliation and non-leakage are source-verified through their merged pgTAP/CI coverage.
- PR #376 source-verifies the corrected rule that historical `p_as_of` reads cannot revive expired network membership.
- Communications/notifications readiness is source-verified for recipient-specific notification RLS, authoritative recipient resolution, retry/attempt/receipt lifecycle, cross-school delivery integrity and secret-free provider routing.
- The connected ScolaPro Supabase project was live-inspected on 8 September 2026; it is active and contains a substantial migration history, but the observed deployed migration list did not include later 7–8 September network/roadmap migrations present in current `main`. Those slices remain unverified in that deployed environment until migration reconciliation confirms them.
- Real communications provider delivery is still unverified: the connected DB inspection found no configured provider routes and no outbox/receipt history suitable for an end-to-end provider acceptance/webhook test. No provider delivery success is claimed.

## Roadmap requirements

| ID | Requirement | Current state | Acceptance / remaining work |
|---|---|---|---|
| T01 | Per-school weekday / rotating cycles, lengths 1–10 | INTEGRATED / VERIFY | Defaults unchanged; invalid lengths/shrinking past used days rejected |
| T02 | Dynamic day picker/grid and maintenance labels | INTEGRATED / VERIFY | 10-day display and weekday labels agree throughout |
| T03 | Calendar resolution for rotating days | INTEGRATED / VERIFY | Closure days and anchors resolve consistently |
| T04 | Numbered setup steps 1/2/3; Teaching periods “Anytime” | INTEGRATED via PR #354 | UI/device verification only |
| T05 | Configured subjects collapsed by default | INTEGRATED via PR #354 | UI/device verification only |
| T06 | Continuous expanded guardian background | BACKLOG / VERIFY | Visual consistency in both themes |
| T07 | Avatar error diagnosis and JPG/WebP upload | ACTIVE PR #375 | Keep within separate UI/runtime lane |
| T08 | Learner photo immediate preview and pending overlay | ACTIVE PR #375 / VERIFY | Pending/error/format behavior remains UI/runtime scope |
| T09 | Learner photo link/upload diagnostics | ACTIVE PR #375 / VERIFY | Privacy-safe diagnostics only |
| T10 | Cumulative-record route error/query diagnostics | DEPLOYMENT FOLLOW-UP | Verify required CRC RPC migrations are actually deployed |
| T11 | Official identity fields read-only | INTEGRATED / VERIFY | No direct identity write path |
| T12 | Optional administrator correction auto-approval | DEFERRED | Preserve audit if adopted |
| C01–C12 | Conduct domain/workflow | INTEGRATED / VERIFY; UI lane active | Source domain integrated; PR #375 owns current UI/runtime consistency work |
| N01 | Capture once; reuse authoritative backend | STANDING RULE | No parallel authoritative records |
| N02 | Normalized authority/region/circuit/cluster hierarchy | INTEGRATED via PR #355 | Valid nested/effective-dated relationships |
| N03 | Versioned external school identifiers/registries | INTEGRATED via PR #355 | Preserve source/version/effective dating; no invented identifiers |
| N04 | Circuit/regional permission tier | INTEGRATED + HARDENED via PRs #355/#376 | Current membership authorizes; historical `p_as_of` cannot revive expired authority |
| N05 | Statutory cycle/readiness/snapshot/certification UI | INTEGRATED via PR #357 | Deployment/live role QA only where not already exercised |
| N06 | Fifteenth School Day form then AEC | SOURCE-GATED | Verify current Ministry source before publishing mappings/validation/export |
| N07 | Operational statutory snapshot coverage | INTEGRATED via PR #369 | Reuses canonical staffing, hostel/feeding, network and identifier facts; no duplicate store |
| N08 | DNEA candidate readiness/review | INTEGRATED via PRs #358/#367/#376 | Historical network authorization hardening integrated; deployment/live QA remains environment-specific |
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
| N24 | Canonical metric registry/restrained charts | INTEGRATED via PRs #370/#373 | Registry/network-safe metric foundation plus bounded expansion are integrated; future metrics require authoritative source semantics and disclosure policy |
| N25 | Circuit/regional/Ministry read models | INTEGRATED BOUNDED FOUNDATION via PR #374; hardened by #376 | Circuit/regional aggregate operational read model exists; no learner/staff/school identity drill-down; further Ministry/dashboard expansion remains requirement/disclosure driven |
| N26 | Previously missing original directive content | CLOSED | Requirements available |

## Immediate dependency gates

### Gate A — Core network/domain foundations
**SATISFIED / INTEGRATED.** N02–N05, N07–N10 and N12–N21 listed above are source-integrated in current `main`.

### Gate B — Canonical metric/network aggregate foundation
**SATISFIED / INTEGRATED.** PRs #370/#373 establish and expand N24; PR #374 establishes the bounded N25 circuit/regional operational aggregate read model; PR #376 hardens the shared network authorization boundary. New dashboards/analytics must extend these architectures rather than define local metric semantics or parallel aggregate stores.

### Gate C — N06 statutory mappings
**BLOCKED ON SOURCE.** No implementation until current official Ministry material is verified. Do not invent field names, codes, mappings or validation rules.

### Gate D — N11 coursework/moderation
**BLOCKED ON REQUIREMENTS.** Do not infer or generalize coursework/moderation obligations without authoritative requirements.

### Deployment/runtime reconciliation gate
**OPEN DEPLOYMENT WORK.** Connected-environment inspection confirms source/deployment can still diverge. Verify/apply later migrations in repository order and retest affected deployed routes/RPCs. Do not recreate source features or hide drift with UI fallbacks.

### UI/runtime consistency gate
**ACTIVE SEPARATE LANE.** PR #375 is open/draft. Keep its shell/Button/Conduct/late-arrival-detention/absence/calendar work isolated from this roadmap reconciliation.

## Next roadmap sequence

1. Reconcile deployed environments through current source migrations and verify affected runtime routes/RPCs.
2. Complete/review PR #375 independently; rebase and exact-head verify it before merge without absorbing domain roadmap work.
3. Run targeted live/provider/device/browser QA only for acceptance dimensions still unverified; communications real-provider send/receipt verification is explicitly outstanding.
4. Extend N24/N25 only for authoritative metrics/read models with explicit safe-disclosure semantics; no generic “more dashboards” work without a defined source and audience.
5. Implement N06 only after verified Ministry source material is available.
6. Implement N11 only after authoritative coursework/moderation requirements are confirmed.
7. Resume consolidated UI/IA and document-lane polish under explicit ownership after deployment and bounded QA stabilize.

## Integration checklist

- Read `AGENTS.md` and `CONTROL-ROOM.md` before starting a branch.
- Preserve another active stream's owned files.
- Do not reopen integrated roadmap items as “missing” without repository evidence and Control Room assignment.
- Review migration timestamps against latest `main`; never rename a deployed migration.
- Require Database CI green for migration-owning PRs.
- Require exact-head required CI before declaring merge-ready.
- Apply shared-environment migrations only through the designated integration/deployment workflow.
- Record source-integrated, source-verified, live/deployment-verified and unverified acceptance separately.
- Use the mandatory handback template from `CONTROL-ROOM.md`.
