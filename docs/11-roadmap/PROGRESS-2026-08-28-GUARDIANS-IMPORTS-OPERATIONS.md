# Progress — Guardians, Imports & Attendance Operations

Date: **28 August 2026**

This checkpoint records the backend/domain bulk that followed the mobile attendance and tooltip refinement pass. Read this together with `IMPLEMENTATION-STATUS.md`, the attendance/learner workflow documents, and the database migrations before continuing.

## Completed in this bulk

### Guardian operations
- Physical guardian identities remain separate from learner identities.
- Learner↔guardian relationships are effective-dated and sibling-safe.
- Guardian contact history is effective-dated.
- Added governed RPCs to create/update guardian identity, link it to a learner, record current contacts, and end a relationship without deleting history.
- Added learner-profile guardian query/action/panel foundation.
- Parent-portal user linking remains separate from guardian identity.

### Bulk import staging
- Added `import_batches`, `import_rows`, and `import_commit_results`.
- Raw source rows are preserved separately from normalized/reconciled data.
- Supported staging domains: learners, staff, guardians, academic structure.
- Added governed create/stage/resolve/ready operations.
- Added the first atomic production commit path for **new learner** imports. It uses the canonical learner-registration RPC rather than writing raw spreadsheet data directly to domain tables.
- Existing/update/link reconciliation remains intentionally uncommitted until deterministic matching rules are implemented.

### Subject-period attendance
- Added a subject/lesson attendance submission model separate from the statutory morning register.
- Allocated teachers may record attendance for their timetable lesson; school leadership may support them.
- Default is present with explicit exceptions and auditable revisions.
- Subject-period attendance is linked to timetable slot and class but must not be counted as official morning attendance.
- Added server queries/actions and `/attendance/lesson/[slotId]` UI foundation.

### School late-arrival operations
- Existing weekly late-arrival/detention engine remains separate from statutory attendance.
- Added governed temporary duty assignment (`late_arrival_recorder`) rather than a new permanent system role.
- Added weekly readiness view.
- Added `/late-arrivals` operational workspace for school leadership/delegated staff: learner search, late-arrival recording, open detention queue, completion/waiver actions.
- Fixed delegated-staff validation to resolve school scope through active school membership rather than assuming `staff_members` has `school_id`.

### Database hygiene
- Repaired historical migration ordering so RPC execution hardening occurs after timetable management RPC creation.
- Aligned live Supabase migration versions with source-controlled filenames.
- Corrected pgTAP test-plan counts and expanded operational-domain coverage.

## Important invariants

1. Official morning/register attendance, subject-period attendance, and school late-arrival are **three different sources of truth**. Do not merge their statistics.
2. Bulk import never bypasses canonical domain functions. Raw spreadsheet/CSV rows stage first, reconcile second, then commit through governed domain operations.
3. Names alone are never sufficient for automatic learner/guardian merging.
4. Guardian identities should be reused across siblings; do not duplicate the same parent per learner.
5. School late-arrival duties are temporary delegations, not another permanent role unless a later product decision explicitly changes this.

## Next implementation targets

1. Link timetable lesson cards to subject-period attendance and complete subject-period evidence/mobile QA.
2. Build the application-side CSV learner import parser/preview and deterministic grade/class reconciliation; XLSX support may follow after dependency review.
3. Add search/link-existing-guardian flow for siblings and parent-portal user linking.
4. Continue report-card/term/year snapshot persistence and statutory output foundations.
5. Add communication provider adapters/jobs after guardian/contact recipient resolution is stable.
6. Continue RLS/performance hardening and cross-school invalid-write fixtures throughout.

UI polish remains a later consolidated pass except where a control is necessary to make an operational workflow usable.
