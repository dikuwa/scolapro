# ADR-0004: PostgreSQL RLS as Defense in Depth

## Status
Accepted

## Context
ScolaPro is a multi-tenant education platform containing academic records, personal data and restricted learner-support information. Application-level authorization alone creates unacceptable risk if a route, query or future feature forgets a tenant/scope filter.

## Decision
Use PostgreSQL Row Level Security as a mandatory tenant/school data-boundary control, combined with service-layer capability and workflow authorization.

RLS will primarily enforce tenant isolation, school membership boundaries and selected sensitive-data visibility. Complex workflow decisions remain in application/domain services.

## Consequences
### Positive
- Cross-tenant data leakage is harder even when application code is defective.
- Security assumptions become testable at the database layer.
- Supabase/PostgreSQL is used in a way aligned with ScolaPro's data sensitivity.

### Costs
- Policies and migrations require disciplined testing.
- Elevated service credentials require strict server-side handling.
- Local/dev tooling must preserve realistic auth context.

## Rejected alternatives
- Application filtering only: insufficient defense for a multi-tenant education system.
- Encoding all business authorization in RLS: too complex and difficult to maintain.

## Rule
No production tenant-owned table may be introduced without an explicit RLS/access decision.