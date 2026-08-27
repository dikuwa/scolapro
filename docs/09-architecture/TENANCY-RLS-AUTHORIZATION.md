# ScolaPro Tenancy, RLS and Authorization Model

## Objective
Protect each tenant and school at the database boundary while also supporting nuanced role scopes such as HOD department access, class-teacher access and restricted learner-support records.

## Core rule
Application authorization and PostgreSQL Row Level Security (RLS) are complementary. Neither substitutes for the other.

- Application authorization decides whether an action should be offered/permitted.
- RLS prevents cross-tenant or cross-scope data disclosure even if application code is wrong.

## Tenant boundary
Every tenant-owned operational row carries `tenant_id` directly or is reachable through a trusted parent table whose tenant is fixed. For high-risk/high-volume tables, prefer explicit `tenant_id` even when derivable.

Cross-tenant reads are prohibited to normal authenticated users.

Platform administrators use explicitly separated platform operations and auditable privileged pathways; they do not bypass tenant boundaries invisibly.

## School boundary
A tenant may own one or more schools. School access is represented by memberships/assignments rather than inferred only from user profile metadata.

## Actor context
Authenticated requests must establish a trusted context containing at least:
- authenticated user id;
- active tenant id;
- active school id where applicable;
- role/scope assignments;
- privileged-support context if explicitly activated.

The client must never be trusted to choose arbitrary tenant ids without server/database validation.

## Authorization layers

### 1. Platform membership
Can the user access the tenant at all?

### 2. School membership
Can the user access the selected school?

### 3. Functional permission
Can the user perform the requested capability (e.g. enter marks, verify marks, issue textbooks)?

### 4. Scope permission
Does the capability apply to this department, class, subject, learner or cohort?

### 5. Record sensitivity
Is the specific data class allowed for the actor? Sensitive health/support/vulnerability records require additional permission beyond ordinary learner-profile access.

### 6. Workflow state
Even authorized users may be prevented from editing records because the workflow is submitted, verified, certified or locked.

## Role model
Avoid one giant `role` column. Use role assignments with explicit scope.

Examples:
- Principal — school scope.
- HOD Science — department scope.
- Teacher — teacher-allocation-derived class/subject scope.
- Register Teacher — assigned register-class scope.
- Librarian/LTSM — school LTSM scope.
- Counsellor — learner-support scope with protected data permission.
- Parent — guardian-to-learner relationship scope.
- Learner — self scope.

## RLS policy principles
Policies should normally require:
1. authenticated actor;
2. matching tenant membership;
3. matching school membership or allowed broader scope;
4. record-specific access where necessary.

Do not encode every business permission into massive RLS expressions. RLS should strongly enforce data boundaries and sensitive record visibility; workflow/action permissions remain in the application/service layer.

## Service role discipline
The database service role bypasses RLS and therefore must never be exposed to browsers or mobile clients.

Server-side jobs using elevated credentials must:
- validate tenant/school context explicitly;
- process bounded sets;
- emit audit events;
- never accept arbitrary user-supplied tenant ids without authorization checks.

## Parent and learner access
Parent access is derived from active/valid guardian relationships, not by storing `parent_id` directly on every result or attendance record.

A guardian can only see the learner information exposed by the parent policy. Restricted counselling/health notes are excluded by default.

Learners can access their own allowed academic, attendance, timetable and task information; administrative and restricted records remain excluded.

## HOD and teacher scoping
Teacher academic access derives from effective teacher allocations for the academic period.

An HOD's department scope may cover multiple teachers/classes/subjects but must not automatically grant access to unrelated departments.

Historic records remain accessible according to explicit reporting/history permissions, not because the current allocation happens to match.

## Restricted learner-support data
Protected records are physically separated where practical and require dedicated permissions such as:
- `learner_support.view_restricted`
- `learner_support.edit_restricted`
- `learner_support.export_restricted`

Bulk export of restricted data requires stronger permission than individual case access and must be audited.

## Audit requirements
Log security-significant actions including:
- role/scope assignment changes;
- restricted-record access where required;
- bulk exports;
- result reopen/unlock;
- statutory certification;
- cross-school transfer acceptance;
- privileged platform support access.

## Tenant switching
Users with access to multiple tenants/schools must switch through a validated server action. Context switching does not broaden authorization and must clear stale client caches belonging to the previous context.

## RLS testing
Automated security tests must include:
- tenant A cannot read tenant B;
- school A staff cannot read school B unless explicitly assigned;
- teacher cannot access unallocated marks;
- parent cannot access unrelated learner;
- learner cannot access another learner;
- ordinary teacher cannot read restricted support notes;
- privileged workflows are denied without explicit capability.

## Status
Approved baseline. Physical SQL policies will be written alongside migrations rather than postponed until after feature development.