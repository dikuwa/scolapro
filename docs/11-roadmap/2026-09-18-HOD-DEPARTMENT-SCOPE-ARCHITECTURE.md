# Issue #478 — HOD / Department Scope Architecture

## Decision

The existing `public.subject_department_responsibilities` table is sufficient for the first configuration surface and remains the **single authorization source** for HOD teaching oversight.

A new canonical named-department table is **not justified in this first slice**. The current governed record already expresses the facts authorization needs: school, subject, HOD staff assignment, effective dates and creator provenance. Both preparation review and merged PR #479 teaching-plan authoring resolve HOD authority through this record.

Creating a second department/subject authority model would introduce drift between a display taxonomy and operational authorization.

## Configurable school model

Schools configure explicit subject responsibilities. A single HOD may be assigned several subjects, which forms a school-defined portfolio without assuming a national department structure. Schools can split or combine portfolios by ending effective-dated responsibility rows and creating new ones.

Namibia-oriented names such as Languages, Mathematics & Natural Sciences, Social Sciences, Commerce / Business / Entrepreneurship, Life Skills / Arts / Practical or Vocational subjects, or phase groupings are **suggestions only**. This slice does not store or present any of them as an official NIED/Ministry structure.

A future named grouping entity is justified only when the product needs persistent school-authored labels/order/phase metadata independent of authorization. If introduced, it must be optional metadata referencing the governed responsibility records; it must never become a parallel authority source. Renaming such a grouping must itself preserve effective-dated history.

## Authority boundaries

- School Admin / Principal: configuration UI.
- Deputy Principal: existing database configuration authority is preserved, but no new UI entry is added in this slice.
- HOD: operational review/readiness/planning only for explicitly assigned subject responsibility.
- Platform Admin: existing platform governance authority is preserved.
- Platform Support: no school-operational HOD or configuration authority.
- Non-current school membership: cannot mutate HOD responsibility configuration.
- HOD need not teach the subject; responsibility follows the explicit staff-assignment link, not teacher allocation ownership.

PR #479 remains unchanged: `app_private.can_author_teaching_plan(...)` continues to delegate HOD plan authority to `app_private.hod_responsible_for_subject(...)`.

## Historical provenance

Responsibility identity is append/end. Subject, head assignment, school, tenant, creator and start date are immutable after insert. A change ends the existing row and creates a new effective-dated row; deletion is not exposed through client RLS. This preserves historical review/planning provenance.

## First UI/backend slice

`/school/setup` gains an HOD teaching-scope panel for School Admin and Principal. It:

- lists current and historical subject/HOD responsibilities;
- offers only current HOD staff placements;
- creates effective-dated subject responsibility rows;
- ends existing responsibilities without deleting them;
- does not invent a mandatory department taxonomy;
- reuses existing HOD review and #479 planning authorization.

This is intentionally the smallest safe slice; named department metadata remains deferred until a concrete non-authorization requirement needs it.
