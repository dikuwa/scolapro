# ScolaPro Control Room

This document is the coordination contract for parallel development in ScolaPro. Current `main` and repository documents are authoritative over stale chat context.

## 1. Authority and reading order

Before changing code, read:

1. `AGENTS.md`
2. `docs/11-roadmap/CONTROL-ROOM.md`
3. `docs/11-roadmap/COORDINATED-DELIVERY-LEDGER.md`
4. `docs/11-roadmap/IMPLEMENTATION-STATUS.md`
5. relevant domain/architecture/design documents referenced by `AGENTS.md`
6. `docs/11-roadmap/2026-09-10-ABSENCE-LTSM-UI-DIRECTIVE.md` when working on absenteeism or LTSM/library operational UI.

Current reconciled source baseline: `01dec838a0dfc3cb93dd5a4b3a3720203e8cded0` (10 September 2026), including merged PRs #400 and #401.

## 2. Product principle

> Capture once → use everywhere.

ScolaPro maintains authoritative operational records from which school, circuit, regional and national information is derived. Do not create parallel authoritative stores merely to satisfy forms, dashboards or reports. Digital-first workflows must still support clean printable evidence where required.

## 3. Integrated roadmap state

The following foundations are integrated and must not be reopened as missing without new repository evidence:

- N02/N03/N04 — education-network hierarchy, effective-dated placement, external identifiers and scoped network roles.
- N05/N07 — statutory lifecycle and operational statutory snapshots.
- N08/N09/N10/N12 — DNEA readiness, examination centres, restricted access arrangements, frozen registration and governed results ingest.
- N13/N14 — staffing establishment, occupancy, vacancies and reconciliation.
- N15 — lean hostel/feeding.
- N16 — privacy-preserving inclusion/SEN aggregates.
- N17/N18/N19 + T04/T05 — calendar teaching impact, effective-dated bell schedules, fixtures and timetable setup refinements.
- N20 — versioned control forms.
- N21 — official-result distributions/comparisons.
- N22/N23 — shared document identity/print foundation and committed brand assets; PR #386 corrects shared browser-print pagination and continuation table headers. Unexercised browser/PDF/device scenarios remain LIVE-QA-GATED.
- N24/N25 — canonical metric registry and bounded circuit/regional operational aggregate read models.
- Guardian/parent claim hardening — PR #378 requires a current effective matching guardian relationship.
- LTSM/library backend integrity — PR #379 binds subject-linked resources to canonical subjects and makes completed loan returns idempotent/final; PR #394 adds school-local circulation authority and Namibia-local lifecycle/effective-date semantics.
- Library / Textbooks operational UI — PR #401 is source-merged at `01dec838a0dfc3cb93dd5a4b3a3720203e8cded0`; `/library` is the canonical operational route over the existing LTSM backend/domain. No duplicate `/ltsm` or `/textbooks` route is required. PR #401 added no migration. Live browser/device/populated-real-data acceptance remains LIVE-QA-GATED where not exercised.
- Finance/contributions lifecycle hardening — PR #380.
- Platform tenant/school onboarding and invitation finality — PR #381.
- T06–T09 — integrated/source-evidenced; remaining provider/browser/device acceptance stays LIVE-QA-GATED where not exercised.
- Academic subject-attendance runtime — PR #388.
- Examination comparison contract — PR #391 retires only the obsolete six-argument RPC.
- Conduct/late-arrival effective enrolment — PR #392.
- Admissions/transfers/progression school-local authority — PR #393.
- Live UI alignment/loader correction — PR #400 is source-merged at `870a4ef8d4830ebe8ffdf923102f48ae2a90cca2`; Academic Setup and Conduct filter alignment plus the transparent brand-colour route loader are source-integrated. Live browser/device acceptance remains separate where not re-tested.

The production migration reconciliation for the runtime/security wave through PR #394 has already been completed and confirmed connected-production migration parity. Do not continue to classify PRs #388/#391/#392/#393/#394 as DEPLOYMENT-GATED merely because older governance text predates that reconciliation. This does not prove browser/device/real-data acceptance.

## 4. Confirmed active implementation gap

### Absence Reviews operational expansion — PR #402

`/school/absence-reviews` is the canonical school absenteeism operational workspace. PR #402 is the active implementation lane.

Required behavior is defined in `docs/11-roadmap/2026-09-10-ABSENCE-LTSM-UI-DIRECTIVE.md`:

- official daily/register absences are visible even when no guardian notice exists;
- subject-period absences are also visible, but in a separately labelled/countable view;
- daily/register attendance and subject-period attendance remain separate authoritative datasets;
- subject-period absence must never inflate official daily/statutory absence;
- guardian notices primarily contextualize official daily/register absences and never silently rewrite attendance;
- subject-period records remain lesson-level evidence;
- late-arrival/detention remains a third separate operational domain.

Authorization must preserve existing boundaries: school leadership/review roles may manage guardian notice reviews according to existing authority; teachers/class teachers receive only appropriate absenteeism awareness; subject teachers see subject-period records only inside existing subject/timetable authority; no new school-wide learner access may be inferred from this workspace.

Classification: **ACTUAL IMPLEMENTATION GAP — ACTIVE PR #402** until merged source implements this directive.

## 5. Verification classifications

- **COMPLETE / INTEGRATED** — merged source exists.
- **SOURCE-VERIFIED** — repository tests/CI or bounded source audit verified the claimed behavior.
- **DEPLOYMENT-GATED** — source exists but connected deployment parity/runtime still requires verification.
- **SOURCE-GATED** — implementation requires verified authoritative source material.
- **REQUIREMENTS-GATED** — implementation requires authoritative functional requirements.
- **LIVE-QA-GATED** — source exists but browser/device/provider/real-data acceptance remains.
- **ACTUAL IMPLEMENTATION GAP** — documented required behavior is absent from merged source and is not blocked by another gate.

Deployment parity, source completeness and live acceptance are separate claims. Never infer browser/device/real-data acceptance from CI or migration parity.

## 6. Remaining hard gates

### N06 — SOURCE-GATED

Verified current Fifteenth School Day/AEC/Ministry mappings, field definitions, codes, validation rules and official layouts remain absent. Do not invent them.

Recommendation: **KEEP SOURCE-GATED**.

### N11 — REQUIREMENTS-GATED

Authoritative subject/coursework/moderation requirements remain absent. Generic assessment/moderation infrastructure does not define required evidence, stages, thresholds or official outputs.

Recommendation: **KEEP REQUIREMENTS-GATED**.

### T12 — REQUIREMENTS-GATED

Optional administrator correction auto-approval remains a deferred product decision.

Recommendation: **KEEP REQUIREMENTS-GATED**.

## 7. Remaining coordinated work

Confirmed ungated source work now exists and must be sequenced explicitly:

1. PR #402 — Absence Reviews operational expansion and subject-period absenteeism visibility per the 10 September directive, preserving the three authoritative attendance/late-arrival domains and existing authorization boundaries.
2. Targeted live browser/device/real-data QA for source-integrated features where acceptance was not explicitly re-tested, including PR #400 UI changes and PR #401 Library / Textbooks operational UI.
3. N22/N23 bounded document QA only under explicit ownership.
4. N24/N25 extensions only from authoritative source facts and explicit disclosure semantics.
5. N06 only after verified Ministry source material exists.
6. N11 only after authoritative coursework/moderation requirements are confirmed.

## 8. Active ownership

- **Control Room / Integration** — merge order, roadmap, shared-file coordination and integrated-main status.
- **PR #399 governance reconciliation** — directive plus the three canonical roadmap files; docs only.
- **PR #402 Absence Reviews** — active implementation owner for the approved absenteeism workspace gap.
- **Deployment reconciliation** — parity through PR #394 is confirmed complete; only later migrations require a new deployment reconciliation assignment. PR #401 added no migration.
- **Document QA** — N22/N23 bounded visual/print QA only when explicitly assigned.

High-conflict files such as central navigation, generated DB types, global middleware, global role registries, renderers and governance documents require explicit ownership.

## 9. Branch, migration and security rules

- Start branches from latest agreed `main`.
- Never rename a migration that may have been deployed.
- Database CI must be green for migration-owning PRs.
- Shared-environment migration execution is deployment work, not an automatic consequence of source merge.
- School, network and platform scope are distinct.
- Circuit/regional roles do not imply unrestricted learner/staff access.
- Historical `p_as_of` controls fact date, not current authorization.
- Sensitive learner support, welfare, examination-access and HR-sensitive staff information require stronger authorization than aggregates.
- Official codes/identifiers/mappings must not be invented.
- Every governed mutation domain requires audit provenance.
- Permission-sensitive read models require explicit non-leakage tests.
- Canonical metrics must reuse N24/N25 architecture.

## 10. Completion contract

Use exactly:

```text
STATUS: DONE | IN PROGRESS | BLOCKED
WORKSTREAM: <name>
BRANCH: <branch>
BASE MAIN: <sha>
HEAD SHA: <sha>
PR: <number/url or NOT OPENED>
CI: <application/db/test status>
MIGRATIONS: <paths or NONE>
FILES/AREAS TOUCHED: <summary>
ACCEPTANCE VERIFIED: <what was actually verified>
NOT VERIFIED: <live/browser/device/data scenarios not actually checked>
DEPENDENCIES: <satisfied/outstanding>
CONFLICT CHECK: <overlap with other active streams>
SAFE TO MERGE: YES | NO
NEXT UNLOCKED WORK: <next dependency/slice>
```

Do not report DONE while required CI is running/failed or while required dependencies remain unresolved.

## 11. Local sync

```bash
git checkout main
git pull --ff-only origin main
```

## 12. Standing guardrails

Do not rebuild integrated architecture, collapse daily/register and subject-period attendance into one authoritative record, convert lesson-level absences into statutory absence, let guardian notices silently rewrite attendance, model late-arrival/detention as attendance, infer school-wide learner access from Absence Reviews, duplicate the canonical library model or operational route, model circuits/regions as unrestricted school tenants, expose learner-level national data by default, hardcode administrative names/codes, duplicate canonical learner/staff/subject facts in forms, hardcode pass/promotion rules, assume one bell schedule for a year, assume examination centre equals school, create a second metric registry, or remove print/PDF workflows in favour of digital-only.