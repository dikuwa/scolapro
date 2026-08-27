# ADR-0006 — Use shadcn/ui with React Aria as the frontend component base

- **Status:** Accepted
- **Date:** 2026-08-27

## Context

ScolaPro requires a consistent, custom-styled, accessibility-conscious component system across form-heavy school workflows. Browser-native visual controls are not acceptable as the final product presentation, and AI coding tools must be able to inspect and reuse the component implementation.

Current shadcn/ui supports Base UI, Radix and React Aria as first-class component bases. React Aria provides a strong accessibility-focused foundation while shadcn keeps the component source open and owned by the repository.

## Decision

Initialize ScolaPro's shadcn/ui component system using the **React Aria base** and keep that base consistent across the application.

Components copied/generated into the repository are ScolaPro-owned source code and must be restyled through ScolaPro design tokens and component standards.

Do not casually mix Base UI or Radix variants into the same component layer. A future switch requires an explicit ADR and migration plan.

## Consequences

Positive:
- strong accessibility-oriented component foundation;
- open component source for customization and AI tooling;
- consistent control behavior and styling;
- reduced reliance on browser-native UI presentation.

Tradeoffs:
- React Aria shadcn support is newer than the historical Radix ecosystem;
- component behavior must be validated during initial shell implementation;
- third-party examples targeting other shadcn bases may require adaptation.

## Implementation

Initialize via the shadcn CLI using the React Aria base and install only the components required by the approved component inventory.

The canonical visual specification remains `docs/08-ui-ux/DESIGN-SYSTEM.md`.