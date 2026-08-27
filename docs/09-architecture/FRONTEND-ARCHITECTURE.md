# ScolaPro Frontend Architecture

## 1. Baseline

ScolaPro uses a **Next.js + TypeScript** frontend with the App Router and server/client boundaries chosen intentionally.

The frontend is not a dumping ground for domain logic. Core academic, authorization, workflow and statutory rules remain in domain/application services and are consumed through typed interfaces.

## 2. UI Stack

Approved baseline:
- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- one consistent shadcn component base
- Lucide icons
- React Hook Form
- Zod
- TanStack Query
- TanStack Table
- Sonner
- GSAP + `@gsap/react`

### shadcn base

As of 2026, shadcn supports Base UI, Radix and React Aria bases. ScolaPro must choose one base during project initialization and remain consistent. Do not casually mix foundations between components.

Preferred starting direction: **React Aria base** for accessibility-heavy school workflows, provided implementation validation confirms all required shadcn components and styling patterns are satisfactory. If that validation reveals friction, use Base UI consistently instead. The choice must be recorded in an ADR before broad component installation.

## 3. Folder Direction

Suggested application structure:

```text
src/
  app/
  components/
    ui/                # owned shadcn-derived primitives
    shell/             # app shell/navigation
    patterns/          # reusable composite UI
    charts/            # shared chart wrappers
  features/
    learners/
    attendance/
    academics/
    teaching/
    timetable/
    ltsm/
    communications/
    statutory/
  lib/
    api/
    auth/
    analytics/
    motion/
    offline/
    permissions/
    validation/
  hooks/
  styles/
  types/
```

Feature folders may contain components specific to that domain, but shared patterns must move upward instead of being copied.

## 4. Server vs Client Components

Default to server components for:
- static layout;
- server-fetched initial data;
- metadata;
- secure server-only access;
- content that does not need browser state.

Use client components for:
- forms;
- interactive grids;
- dialogs/popovers;
- optimistic/offline behavior;
- GSAP animation;
- browser APIs;
- local interactive state.

Do not mark entire page trees `use client` merely for convenience.

## 5. Data Fetching

Use server-side loading where it improves initial delivery and security. Use TanStack Query for interactive client-side server state requiring:
- caching;
- refetching;
- mutations;
- optimistic updates;
- background synchronization;
- dependent queries.

Query keys must be scoped by tenant/school/context where relevant.

Offline-critical data interacts with the offline mutation architecture rather than relying on TanStack Query alone.

## 6. Forms

Use React Hook Form + Zod for interactive validated forms where appropriate.

Rules:
- derive schemas from domain/API contracts where practical;
- never duplicate business rules exclusively in UI validation;
- server validation remains authoritative;
- field-level feedback is immediate and accessible.

## 7. Tables and Grids

Use TanStack Table as the base for reusable data-table behavior.

Marks/attendance may require specialized grid behavior beyond a normal table. Keep those specialized while reusing ScolaPro toolbars, filters, status, navigation and accessibility patterns.

## 8. Motion

Use CSS transitions for ordinary microinteraction and GSAP for coordinated motion. Follow `docs/08-ui-ux/MOTION-INTERACTION.md`.

GSAP React usage must use cleanup/scoping patterns such as `useGSAP()` rather than unmanaged global selectors.

## 9. Toasts and Feedback

Use Sonner through a ScolaPro wrapper so style, duration, placement and accessibility remain centralized.

Do not call toast APIs directly from every feature if a shared feedback helper can express the intent.

## 10. Charts

Use one primary chart library for standard analytics and wrap it behind ScolaPro chart components/tokens.

Preferred initial choice: **Recharts** for common school dashboards and reports. Use a lower-level visualization library only when a requirement cannot reasonably be met.

Charts must use shared tokens, responsive containers, accessible labels where possible and motion standards.

## 11. Icons

Use Lucide as the default icon family.

Rules:
- consistent sizes;
- no massive icons in routine UI;
- no decorative gradient icons;
- icons never replace essential text without accessible labels;
- avoid mixing icon families unless a domain-specific symbol genuinely requires it.

## 12. Styling

Tailwind consumes semantic design tokens via CSS variables.

No raw color classes such as arbitrary `bg-blue-600` in feature UI when a semantic token should be used. Brand/semantic classes should map to shared tokens.

## 13. Theme

Theme support must be systematized at the token level. A component that works only in light mode is incomplete.

Official print/PDF documents are not automatically dark-mode themed.

## 14. Responsiveness

Responsive behavior is designed during component construction, not added after desktop completion.

Test representative widths at minimum:
- small phone;
- large phone;
- tablet portrait/landscape;
- 13-inch laptop;
- standard desktop;
- wide desktop.

## 15. Loading & Streaming

Use route-level/loading boundaries and component-level skeletons strategically.

Avoid blank screens while waiting for data. Progressive rendering should preserve stable layout and reduce jumps.

## 16. Error Handling

Use:
- inline field errors;
- component error states;
- page-level recoverable error boundaries;
- Sonner for lightweight transient failures;
- dialogs/banners for consequential failures.

Never expose raw stack traces or technical server messages to school users.

## 17. Analytics Instrumentation

UI events route through a typed analytics layer. Do not scatter provider-specific PostHog calls throughout feature components.

Sensitive learner information must not be sent as analytics properties.

## 18. AI Coding Guardrail

AI agents must read:
- `AGENTS.md`
- `docs/08-ui-ux/DESIGN-SYSTEM.md`
- `docs/08-ui-ux/MOTION-INTERACTION.md`
- `docs/08-ui-ux/COMPONENT-INVENTORY.md`
- this document

before creating or materially changing frontend UI.