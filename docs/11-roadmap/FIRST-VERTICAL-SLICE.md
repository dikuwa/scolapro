# ScolaPro First Vertical Slice

## Goal

Prove ScolaPro's core architecture end-to-end before broad feature construction.

The first vertical slice is intentionally narrow but production-shaped. It must exercise tenancy, school context, identity, authorization, RLS, design system, API/data access, auditability and responsive UX.

## Slice Scope

### Platform
- create/read one tenant;
- create/read one school under the tenant;
- school branding/basic profile;
- tenant/school context resolution.

### Identity and staff
- authenticate a user;
- associate user with staff profile;
- assign a school role/scope;
- render role-aware navigation.

### Learner
- create/read learner identity;
- create current school enrolment;
- assign grade and register class;
- learner list and learner overview.

### Authorization
Prove:
- platform role can access intended platform scope;
- school admin can access own school;
- teacher sees only authorized school/class context;
- cross-tenant access is rejected at database and application layers.

### UI
Implement using the approved ScolaPro design system:
- authentication shell;
- app shell/sidebar/top bar;
- dashboard placeholder with real context;
- learner list;
- learner profile overview;
- create learner/enrolment flow.

All representative surfaces must include:
- responsive states;
- loading/skeleton states;
- empty states;
- error states;
- smooth approved motion;
- Sonner feedback where appropriate.

## Out of Scope

Do not add yet:
- full marks engine;
- full attendance;
- curriculum import;
- timetable generation;
- communications providers;
- statutory submissions;
- AI generation.

These follow after the architectural slice proves the base.

## Acceptance Criteria

1. No tenant leakage under direct query attempts.
2. User role/scope drives navigation and server authorization.
3. Learner and enrolment are separate records.
4. Historical/effective-date structure is preserved in schema direction.
5. Design tokens are used; no ad hoc visual styling.
6. No native browser product controls where owned components are required.
7. Keyboard and mobile access work for core flow.
8. Automated tests cover tenant isolation and role access.
9. Audit event exists for material learner creation/update actions.
10. CI builds and tests the slice successfully.

## Why This Slice First

If this slice is wrong, every later module inherits the mistake. If it is correct, attendance, academics, curriculum, LTSM and statutory features can build on a proven foundation.
