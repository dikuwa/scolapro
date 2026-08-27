# ScolaPro Repository Structure & Implementation Baseline

## Purpose

This document defines the implementation-ready repository structure for ScolaPro so development can begin without architectural drift.

## Baseline Structure

```text
scolapro/
  src/
    app/
      (auth)/
      (platform)/
      (school)/
      api/
      layout.tsx
      page.tsx
    components/
      ui/
      shell/
      patterns/
      charts/
      forms/
      tables/
      feedback/
    features/
      platform/
      schools/
      staff/
      learners/
      guardians/
      enrolment/
      curriculum/
      timetable/
      teaching/
      attendance/
      assessment/
      promotion/
      reports/
      learner-support/
      ltsm/
      communications/
      statutory/
      documents/
    lib/
      auth/
      permissions/
      db/
      api/
      analytics/
      cache/
      jobs/
      offline/
      motion/
      validation/
      storage/
      logging/
      security/
    hooks/
    styles/
    types/
  supabase/
    migrations/
    seed/
  public/
  tests/
    unit/
    integration/
    e2e/
    fixtures/
  docs/
  decisions/
  scripts/
  .github/
    workflows/
```

## Boundaries

- `components/ui` contains owned low-level design-system components derived from shadcn.
- `components/patterns` contains reusable compositions used across multiple domains.
- `features/*` owns feature-specific UI and application logic.
- `lib/*` contains cross-cutting infrastructure only.
- domain/business rules must not be buried inside route components.
- database access must be routed through approved server-side data access helpers.

## Route Organization

Use route groups to separate concerns without exposing implementation taxonomy in URLs.

Suggested direction:

```text
/(auth)
/(platform)
/(school)
```

School-facing routes should be role-aware while still sharing the same underlying domain services.

## Package Policy

Before adding a dependency:
1. verify an approved dependency does not already solve the need;
2. prefer mature, focused packages;
3. avoid packages that duplicate platform capabilities;
4. document significant architectural dependencies in an ADR;
5. do not add UI libraries that introduce a competing visual system.

## Generated Code

Generated shadcn components become part of the owned source tree and must be adapted to ScolaPro tokens, accessibility and motion standards.

## Naming

- React components: PascalCase
- hooks: `useXxx`
- feature folders: lowercase kebab-case when multiple words are needed
- server actions/services: explicit verbs and domain nouns
- database tables/columns: snake_case
- environment variables: SCREAMING_SNAKE_CASE

## Import Direction

Preferred dependency direction:

```text
app -> features -> patterns/ui -> lib/contracts
```

Shared infrastructure may be consumed by features, but features should not import from unrelated feature internals.

## Implementation Guardrail

Any AI or developer creating application code must read `AGENTS.md` and the linked architecture/design documents before scaffolding or changing structure.
