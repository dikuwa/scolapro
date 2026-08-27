# ScolaPro Coding Standards

## Purpose

These standards exist to keep ScolaPro maintainable while multiple humans and AI coding agents contribute to the same codebase.

## TypeScript

- strict mode required;
- avoid `any` except documented interoperability boundaries;
- prefer explicit domain types;
- avoid giant catch-all DTOs;
- validate external input at boundaries;
- distinguish identifiers with clear types/names.

## React

- components should have one clear responsibility;
- avoid oversized page components;
- extract repeated UI into owned reusable components;
- do not hide domain rules inside rendering branches;
- use server components by default where interaction is not required;
- minimize `use client` boundaries.

## State

Use the narrowest suitable state mechanism.

- local UI state: React state;
- server state: TanStack Query where client caching/mutation is needed;
- forms: React Hook Form;
- offline mutations: approved durable offline queue;
- do not add a global state library unless a proven cross-cutting need exists.

## Database

- PostgreSQL naming uses snake_case;
- all tenant-owned tables include required tenant/school ownership fields per data architecture;
- RLS required for tenant-sensitive tables;
- foreign keys and meaningful constraints are preferred over application-only assumptions;
- preserve historical academic data;
- use explicit migrations.

## Errors

- errors should be typed/classified at service boundaries;
- user-facing errors are human-readable;
- logs preserve diagnostic context without leaking sensitive data;
- do not swallow failures silently.

## Security

- authorization is checked server-side;
- never trust role claims or tenant IDs supplied only by client UI;
- never expose service-role credentials;
- avoid logging learner-sensitive payloads;
- validate file uploads and provider callbacks.

## UI

All frontend code must comply with the design-system documents.

Forbidden shortcuts include:
- raw browser alerts;
- inconsistent native selects/date inputs in product workflows;
- arbitrary colors/radii/spacing;
- one-off button variants;
- unreviewed third-party visual systems;
- abrupt page/state transitions when approved motion patterns exist.

## Async UX

Any action with noticeable latency must expose state:
- pending;
- success;
- failure;
- retry/recovery where appropriate.

## Tests

Business-critical code requires tests for:
- happy path;
- permissions;
- invalid data;
- tenant isolation;
- historical/version behavior when applicable.

## Comments

Comments should explain *why*, constraints, policy provenance or non-obvious trade-offs. Avoid comments that simply restate code.

## AI-generated Code

AI output is not exempt from these standards. Generated code must be reviewed for:
- security;
- RLS/tenant boundaries;
- design-system compliance;
- duplicated logic;
- accessibility;
- unnecessary dependencies;
- test coverage.
