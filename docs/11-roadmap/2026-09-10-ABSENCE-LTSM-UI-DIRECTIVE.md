# Control Room Directive — Absence Review, Subject-Period Visibility, LTSM UI and UI QA

Date: **10 September 2026**

Authoritative source baseline when this directive was issued: `2ada1a38b84212f1f78aa09fb5d17eb361c2e1f0`.

Current reconciliation baseline: `41b4ad634c0a8f91a2e1d110aa3ecca73728d86f`, including merged PRs #402 and #404.

This directive records the product decisions confirmed after live UI review. It supplements the existing attendance/LTSM architecture and must be read with `IMPLEMENTATION-STATUS.md`, `CONTROL-ROOM.md`, and `PROGRESS-2026-08-28-ATTENDANCE-GUARDIANS.md`.

## 1. Attendance domains remain separate

ScolaPro must continue to preserve three distinct operational attendance streams:

1. **Official daily/register attendance** — the authoritative school attendance record used for school/statutory attendance.
2. **Subject-period attendance** — attendance recorded for a specific lesson/period by the authorized teaching context.
3. **Late-arrival/detention operations** — disciplinary/operational events that must not inflate or rewrite official absence statistics.

These streams may be presented together for awareness, but they must not be merged into one physical record, silently overwrite one another, or be counted interchangeably.

## 2. Absence Reviews school absenteeism workspace — integrated via PR #402

`/school/absence-reviews` is now **COMPLETE / INTEGRATED** in source via PR #402. Do not reopen the implementation unless new source evidence proves a defect.

### Daily/register absences

The workspace shows learners marked absent in official daily/register attendance even when no guardian notice exists.

For each relevant absence, the source supports learner/date/class context, official status/reason/evidence state, guardian-explanation correlation and review state as permitted by authorization.

Guardian notices may explain/support an official absence, but accepting a notice does **not silently rewrite the official attendance register**. Attendance correction remains a separate governed authority.

### Subject-period absenteeism

The workspace provides a **separate Subject-period absences view/tab** for lesson-level absenteeism.

Daily/register and subject-period absence counts remain separately labelled. Subject-period absence does not by itself become or inflate official daily/statutory absence. Daily absence likewise does not delete or replace an existing lesson-level record.

Subject-period visibility follows the authorized timetable/teaching scope and can show relevant lesson, subject, class and daily-status context where safely available.

### Parent/guardian notices

Guardian absence notices remain a governed explanation/evidence workflow. They are correlated to applicable learner/date context but remain distinct from both official daily attendance and subject-period records.

A guardian-notice review decision does not itself grant attendance visibility, evidence visibility, or attendance-correction authority.

### Visibility and authority

Merged PR #402 preserves these boundaries:

- `school_admin`, `principal`, `deputy_principal` — school-wide attendance awareness according to existing authority;
- `class_teacher` — assigned register-class daily scope;
- `teacher` — explicit subject/timetable allocation scope only;
- `hod` — explicit teaching allocation scope only; no invented school-wide or department-wide authority;
- counsellor guardian-notice review authority does not imply attendance scope;
- cross-school attendance scope is denied;
- sensitive evidence/attachments and attendance correction remain governed by their existing separate policies.

### Required filters/presentation

The workspace supports practical filtering by date/range, grade, class, learner, daily/subject-period view, subject where applicable, and explanation/review state. Daily and subject-period counts remain labelled separately.

### Deployment reconciliation

Connected-production parity for PR #402 is **COMPLETE / RECONCILED** on project `jhgumnvhoxmapmgotchu`. Migration `20260910123000_absence_review_scope_authorization` is present in the live ledger and `public.resolve_absence_review_scope(uuid,date,date)` is present with EXECUTE granted to `authenticated` and denied to `anon` and `public`.

This deployment evidence confirms source/live migration parity only. It does not constitute browser/device/populated-data acceptance.

## 3. LTSM / Library operational UI — integrated via PRs #401 and #404

The canonical LTSM/library database/domain foundation and loan lifecycle remain authoritative, including the #379 and #394 hardening for canonical subject linkage, return finality, school-local circulation authorization and Namibia-local lifecycle/effective-date semantics.

PR #401 merged `/library` as the canonical operational **Library / Textbooks** route. No duplicate `/ltsm` or `/textbooks` route is required, and the UI continues to reuse the canonical resource/title/copy/loan/return lifecycle rather than introducing a second library data model.

Subsequent live QA found two bounded source defects after #401:

- `learning_resource_copies.location_label` was loaded but not rendered to operators;
- valid active staff represented only by effective `staff_school_assignments` could be omitted from borrower search because the UI read path relied only on `school_memberships`.

PR #404 corrected both defects in source. Copy location labels are now rendered, and borrower discovery combines effective active membership-linked and assignment-linked staff with de-duplication. PR #404 added no schema, RLS, RPC, lifecycle or route-authorization changes and no migration. Application CI #2028 passed.

Library / Textbooks remains **COMPLETE / INTEGRATED; SOURCE-VERIFIED; LIVE-QA-GATED**. Connected production currently contains no learning-resource titles, copies or loans, so issue/return/lost/damaged lifecycle acceptance was not manufactured against operational data. Principal/deputy-principal/librarian/ltsm browser-role acceptance also remains unverified where no corresponding test memberships/credentials were available.

## 4. Live UI QA correction — integrated via PR #400

PR #400 merged the Academic Setup alignment, Conduct filter-row alignment and transparent primary/brand-colour loader corrections. These are **COMPLETE / INTEGRATED** in source.

Live browser/device visual acceptance remains **LIVE-QA-GATED** where not re-tested; source integration must not be treated as proof of unexercised visual/device scenarios.

## 5. Delivery classification

- **Absence Reviews expansion:** COMPLETE / INTEGRATED via PR #402; SOURCE-VERIFIED by merged authorization/runtime tests.
- **Subject-period absenteeism visibility inside Absence Reviews:** COMPLETE / INTEGRATED via PR #402; daily/register and subject-period attendance remain separate authoritative datasets with separate counts/views.
- **Absence Reviews authorization resolver migration:** `20260910123000_absence_review_scope_authorization.sql` is PARITY RECONCILED in connected production; no #402 deployment gate remains.
- **LTSM/Library operational route:** COMPLETE / INTEGRATED via PR #401 with #404 source corrections for copy-location rendering and assignment-only staff borrower discovery; no migration added by either PR. Remaining issue/return/lost/damaged and non-admin browser-role acceptance is LIVE-QA-GATED under current connected-data/test-role constraints.
- **Academic Setup / Conduct alignment + transparent primary-colour loader:** COMPLETE / INTEGRATED via PR #400; live browser/device visual acceptance remains separate where not re-tested.
- **Production migration parity through PR #402:** COMPLETE / RECONCILED. This supersedes the earlier through-#394 boundary without invalidating that prior evidence.
- **Browser/device/live-data acceptance for PR #402:** NOT CLAIMED; remains LIVE-QA-GATED where unexercised.

Do not reinterpret this directive as permission to collapse attendance domains, widen learner-sensitive authorization, couple guardian-review authority to attendance visibility, broaden evidence/correction authority, duplicate the LTSM/library model or add duplicate library routes.