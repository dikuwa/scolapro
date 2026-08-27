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

### Universal shell and surface rules

These apply to authenticated and public-facing pages unless a deliberate marketing composition requires an explicit exception:

- Main page content must use the shared width tokens/utilities (`--content-max`, `--public-content-max`, `.scolapro-content-width`, `.scolapro-public-width`) rather than arbitrary large `max-w-*` values.
- Public authentication/marketing layouts may use full-bleed background surfaces, but their readable content must still align to the shared maximum content width.
- Borders are separators, not decoration. Use `--border-subtle` by default for cards, shell dividers and section separators. `--border` is reserved for controls or moments that need slightly stronger definition.
- Do not use dark/black card outlines or strong separator lines in ordinary ScolaPro UI.
- Normal content elevation uses `--shadow-xs`; stronger shadows require a semantic reason.
- Routine buttons, pills, inputs, navigation items and small cards should normally use `--radius-sm` or `--radius-xs`. Do not drift back to fully rounded/pill styling unless the component is semantically a chip/avatar/status pill.
- Shared CTA links/buttons with directional icons must use `.scolapro-cta` and `.scolapro-cta-icon` so the icon translates/scales subtly on hover/focus. Do not implement one-off arrow animations per page.
- The desktop sidebar collapse control sits on the intersection of the sidebar divider and top-header divider, visually overlapping both surfaces. Do not move it into the navigation content area.
- The collapsed sidebar is icon-only; the expanded sidebar is icon + label. Both states must use the shared sidebar width tokens and smooth tokenized motion.

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