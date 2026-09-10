# Control Room Directive — Absence Review, Subject-Period Visibility, LTSM UI and UI QA

Date: **10 September 2026**

Authoritative source baseline when this directive was issued: `2ada1a38b84212f1f78aa09fb5d17eb361c2e1f0`.

Current reconciliation baseline: `01dec838a0dfc3cb93dd5a4b3a3720203e8cded0`, including merged PRs #400 and #401.

This directive records the product decisions confirmed after live UI review. It supplements the existing attendance/LTSM architecture and must be read with `IMPLEMENTATION-STATUS.md`, `CONTROL-ROOM.md`, and `PROGRESS-2026-08-28-ATTENDANCE-GUARDIANS.md`.

## 1. Attendance domains remain separate

ScolaPro must continue to preserve three distinct operational attendance streams:

1. **Official daily/register attendance** — the authoritative school attendance record used for school/statutory attendance.
2. **Subject-period attendance** — attendance recorded for a specific lesson/period by the authorized teaching context.
3. **Late-arrival/detention operations** — disciplinary/operational events that must not inflate or rewrite official absence statistics.

These streams may be presented together for awareness, but they must not be merged into one physical record, silently overwrite one another, or be counted interchangeably.

## 2. Absence Reviews becomes the school absenteeism workspace

`/school/absence-reviews` must evolve from a parent-notice-only inbox into a school absenteeism review workspace. PR #402 is the active implementation lane for this approved gap.

### Daily/register absences

The workspace must show learners marked **Absent** in official daily/register attendance even when no guardian notice exists.

For each relevant absence, authorized users should be able to see, as available:

- learner;
- date or date range;
- grade/class context;
- official attendance status/reason/evidence state;
- whether a guardian explanation exists;
- guardian notice review status;
- unresolved/unexplained state.

Guardian notices may explain/support an official absence, but accepting a notice must **not silently rewrite the official attendance register**. Any attendance correction must continue through the authoritative attendance/correction mechanism.

### Subject-period absenteeism

The same workspace must also provide a **separate Subject-period absences view/tab** so the school can review lesson-level absenteeism without confusing it with the official daily register.

The subject-period view must remain clearly labelled and separately counted. It should show, where available:

- learner;
- date;
- timetable period/day context;
- subject/offering;
- class/register context;
- recording teacher/authorized teaching context;
- subject-period attendance status/reason/evidence;
- corresponding daily/register status for context when safely available.

A subject-period absence must never by itself become or inflate an official daily/statutory absence. Conversely, a daily absence does not remove the need to preserve the lesson-level record if one exists.

### Parent/guardian notices

Guardian absence notices remain a governed explanation/evidence workflow managed by the authorized school review roles. Parent notices should be correlated to the learner/date or date range where possible and displayed alongside the relevant daily/register absence context.

Parent notices are **not** a replacement for subject-period records and should not be auto-applied to every lesson record without an explicit future rule.

### Visibility and authority

- School leadership/administrative review roles may review the school-wide daily absence + guardian-notice workflow according to existing authorization.
- Teachers/class teachers should receive appropriate absenteeism awareness only within their existing learner/class/teaching scope.
- Subject teachers should see subject-period absenteeism only within the scope already permitted by subject attendance/timetable authorization.
- Viewing absenteeism must not grant guardian-notice approval, attendance correction, or school-wide learner access beyond the existing role boundary.
- Sensitive evidence/attachments remain governed by their existing restricted read policies.

### Required filters/presentation

The workspace should support practical filtering by date/range, grade, class, learner, daily/subject-period view, subject where applicable, and explanation/review state. Daily and subject-period counts must be labelled separately.

## 3. LTSM / Library operational UI — integrated via PR #401

The canonical LTSM/library database/domain foundation and loan lifecycle remain authoritative, including the #379 and #394 hardening for canonical subject linkage, return finality, school-local circulation authorization and Namibia-local lifecycle/effective-date semantics.

PR #401 has merged. `/library` is now the canonical operational **Library / Textbooks** route and is **COMPLETE / INTEGRATED** in source. No duplicate `/ltsm` or `/textbooks` route is required. The UI reuses the canonical resource/title/copy/loan/return lifecycle rather than introducing a second library data model. PR #401 added no migration.

Live browser/device/populated-real-data acceptance remains **LIVE-QA-GATED** where those scenarios were not exercised.

## 4. Live UI QA correction — integrated via PR #400

PR #400 merged the Academic Setup alignment, Conduct filter-row alignment and transparent primary/brand-colour loader corrections. These are **COMPLETE / INTEGRATED** in source.

Live browser/device visual acceptance remains **LIVE-QA-GATED** where not re-tested; source integration must not be treated as proof of unexercised visual/device scenarios.

## 5. Delivery classification

- **Absence Reviews expansion:** ACTUAL IMPLEMENTATION GAP — ACTIVE PR #402.
- **Subject-period absenteeism visibility inside Absence Reviews:** ACTUAL IMPLEMENTATION GAP — ACTIVE PR #402; existing subject-attendance source remains authoritative.
- **LTSM/Library operational route:** COMPLETE / INTEGRATED via PR #401; backend/domain remains canonical; live browser/device/populated-real-data acceptance remains LIVE-QA-GATED where not exercised.
- **Academic Setup / Conduct alignment + transparent primary-colour loader:** COMPLETE / INTEGRATED via PR #400; live browser/device visual acceptance remains separate where not re-tested.
- **Production migration parity through PR #394:** RECONCILED. This does not imply browser/device/real-data acceptance.

Do not reinterpret this directive as permission to collapse attendance domains, widen learner-sensitive authorization, duplicate the LTSM/library model or add duplicate library routes.