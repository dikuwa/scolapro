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

Current reconciled source baseline: `41b4ad634c0a8f91a2e1d110aa3ecca73728d86f` (10 September 2026), including merged PRs #402 and #404.

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
- Library / Textbooks operational UI — PR #401 is source-merged; `/library` is the canonical operational route over the existing LTSM backend/domain. PR #404 subsequently corrected two source defects found by live QA: copy `location_label` is now rendered, and active assignment-only staff are included in borrower search alongside membership-linked staff. Neither #401 nor #404 added a migration. Live issue/return/lost/damaged acceptance remains LIVE-QA-GATED because connected production currently has no learning-resource titles/copies/loans; principal/deputy/librarian/ltsm browser-role acceptance also remains unverified where no test memberships/credentials were available.
- Finance/contributions lifecycle hardening — PR #380.
- Platform tenant/school onboarding and invitation finality — PR #381.
- T06–T09 — integrated/source-evidenced; remaining provider/browser/device acceptance stays LIVE-QA-GATED where not exercised.
- Academic subject-attendance runtime — PR #388.
- Examination comparison contract — PR #391 retires only the obsolete six-argument RPC.
- Conduct/late-arrival effective enrolment — PR #392.
- Admissions/transfers/progression school-local authority — PR #393.
- Live UI alignment/loader correction — PR #400 source-integrates Academic Setup and Conduct alignment plus the transparent brand-colour route loader. Live browser/device acceptance remains separate where not re-tested.
- Absence Reviews operational workspace — PR #402 is **COMPLETE / INTEGRATED** in source. `/school/absence-reviews` shows daily/register and subject-period absences as separate views with separate counts; subject-period absence does not become statutory daily absence; guardian explanations do not silently rewrite attendance; late-arrival/detention remains a separate third domain. Authorization is bounded by existing authority: school_admin/principal/deputy_principal retain school-wide attendance awareness; class_teacher receives assigned register-class daily scope; teacher receives explicit subject/timetable allocation scope only; HOD receives explicit teaching allocation scope only with no invented school-wide/department-wide authority; counsellor guardian-notice review authority does not imply attendance scope; cross-school scope is denied; evidence/correction authority remains separate.

Connected-production migration parity is now confirmed through PR #402 on project `jhgumnvhoxmapmgotchu`. The earlier runtime/security reconciliation through PR #394 remains valid, and `20260910123000_absence_review_scope_authorization` is present in the live ledger. `public.resolve_absence_review_scope(uuid,date,date)` is present with EXECUTE granted to `authenticated` and denied to `anon` and `public`. Source/live migration parity is therefore **COMPLETE / RECONCILED through PR #402**. This does not prove browser/device/real-data acceptance.

## 4. Absence Reviews source classification

`/school/absence-reviews` is the canonical school absenteeism operational workspace and is **COMPLETE / INTEGRATED** in source via PR #402, with its authorization resolver migration **PARITY RECONCILED** in connected production.

Source behavior:

- official daily/register absences are visible independently;
- subject-period absences are visible independently;
- daily/register and subject-period counts remain separate;
- subject-period absence never inflates official daily/statutory absence;
- guardian explanations provide governed context and do not silently rewrite attendance;
- late-arrival/detention remains a separate third operational domain.

Authorization:

- `school_admin`, `principal`, `deputy_principal`: school-wide attendance awareness according to existing authority;
- `class_teacher`: assigned register-class daily scope;
- `teacher`: explicit subject/timetable allocation scope only;
- `hod`: explicit teaching allocation scope only; no invented school-wide or department-wide authority;
- counsellor guardian-notice review authority does not imply attendance scope;
- cross-school attendance scope is denied;
- attendance evidence and correction authority remain governed separately.

Do not reopen this implementation unless new source evidence proves a defect.

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

Confirmed remaining work must be sequenced explicitly:

1. Targeted live browser/device/real-data QA for source-integrated features where acceptance was not explicitly completed, including PR #400, PR #402, and Library / Textbooks after PR #404. Library circulation mutation QA remains blocked by the absence of connected-production learning-resource titles/copies/loans; principal/deputy/librarian/ltsm browser-role acceptance remains unverified where test memberships/credentials are unavailable.
2. N22/N23 bounded document QA only under explicit ownership.
3. N24/N25 extensions only from authoritative source facts and explicit disclosure semantics.
4. N06 only after verified Ministry source material exists.
5. N11 only after authoritative coursework/moderation requirements are confirmed.
6. T12 only after the deferred correction auto-approval product decision is resolved.

## 8. Active ownership

- **Control Room / Integration** — merge order, roadmap, shared-file coordination and integrated-main status.
- **Deployment reconciliation** — production migration parity is confirmed through PR #402; no current #402 deployment gate remains.
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

Do not rebuild integrated architecture, reopen PR #402 Absence Reviews without new source evidence, collapse daily/register and subject-period attendance into one authoritative record, convert lesson-level absences into statutory absence, let guardian notices silently rewrite attendance, model late-arrival/detention as attendance, infer school-wide learner access from Absence Reviews, duplicate the canonical library model or operational route, model circuits/regions as unrestricted school tenants, expose learner-level national data by default, hardcode administrative names/codes, duplicate canonical learner/staff/subject facts in forms, hardcode pass/promotion rules, assume one bell schedule for a year, assume examination centre equals school, create a second metric registry, or remove print/PDF workflows in favour of digital-only.