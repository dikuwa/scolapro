# ScolaPro Repository Instructions for AI Coding Agents

These instructions are mandatory for any AI assistant, coding agent, contributor, or automation that creates or modifies code in this repository.

## 1. Read before changing UI

Before creating or materially changing frontend UI, read:

1. `docs/08-ui-ux/DESIGN-PRINCIPLES.md`
2. `docs/08-ui-ux/DESIGN-SYSTEM.md`
3. `docs/08-ui-ux/MOTION-INTERACTION.md`
4. `docs/08-ui-ux/COMPONENT-INVENTORY.md`
5. `docs/08-ui-ux/ROLE-CENTRIC-NAVIGATION.md`
6. `docs/09-architecture/FRONTEND-ARCHITECTURE.md`
7. `docs/09-architecture/TECH-STACK-TOOLING.md`

Do not infer a generic dashboard style from your defaults. ScolaPro has an explicit visual system.

## 2. UI rules that must not be violated

- Use semantic design tokens; do not hardcode feature colors.
- Follow the approved fluid type scale and 8-point spacing rhythm.
- Use shadcn/ScolaPro reusable components before inventing new controls.
- Do not expose browser-styled select, radio, checkbox, date picker, `alert`, `confirm`, or `prompt` UI in core workflows.
- Use Sonner for lightweight toast feedback through the shared wrapper.
- Use restrained GSAP/CSS motion according to `MOTION-INTERACTION.md`.
- Respect `prefers-reduced-motion`.
- Do not hijack scrolling.
- Avoid card-inside-card layouts and excessive borders.
- Avoid pure black/pure white/raw saturated primary colors as dominant UI.
- No gradient text.
- No oversized page titles.
- No eyebrow label above every heading.
- No giant icon tiles or decorative gradient icons.
- Left alignment is the default.
- Every async action must show pending/loading/feedback state.
- Every page/component must consider loading, empty, error, disabled and responsive states.
- Dark mode/theme-aware behavior must not be an afterthought.

## 3. Architecture rules

Before changing domain/data/security architecture, read relevant documents under:
- `docs/02-domain/`
- `docs/04-academics/`
- `docs/05-curriculum/`
- `docs/06-workflows/`
- `docs/07-data-model/`
- `docs/09-architecture/`
- `docs/10-statutory/`
- `decisions/`

Important constraints include:
- PostgreSQL is the system of record.
- Multi-tenancy and authorization are defense-in-depth, including RLS.
- Academic/curriculum/statutory rules are versioned rather than hardcoded by grade/year.
- Historical learner/academic/statutory records must not be rewritten by later rule versions.
- Sensitive learner-support data requires stronger access than ordinary learner profile data.
- Offline mutations use the documented queue/idempotency/conflict architecture.
- Redis/cache is not authoritative data.
- AI output is assistance/draft unless governed workflow accepts it.

## 4. Dependency rule

Do not add a new dependency if an approved tool already solves the responsibility.

For a new dependency, explain:
- problem solved;
- why existing stack is insufficient;
- client/runtime cost;
- privacy/security implications;
- whether it needs a ScolaPro adapter/wrapper.

## 5. Privacy rule

Do not send sensitive learner information to analytics, logging, error monitoring, AI providers, or external tools unless the architecture explicitly allows it and appropriate privacy controls exist.

Never intentionally include learner names, marks, medical/support records, disciplinary details, guardian contact information, credentials or document contents in generic analytics events or logs.

## 6. Quality bar

A feature is not complete because it renders or passes a happy path.

Before completion verify:
- permissions;
- tenant isolation;
- validation;
- loading/error/empty states;
- responsive behavior;
- keyboard/focus accessibility;
- motion/reduced-motion behavior;
- offline behavior where applicable;
- auditability where applicable;
- tests appropriate to risk.

## 7. Do not silently override architecture

If an implementation request conflicts with an approved architecture/design document, do not silently improvise. Preserve the approved system and surface the conflict or create/update an ADR when a deliberate architectural change is required.

## 8. Product principle

**Capture once → use everywhere.**

Do not create duplicate sources of truth when existing authoritative school data can generate the required view, document, report, workflow or statistic.