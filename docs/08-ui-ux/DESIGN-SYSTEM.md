# ScolaPro Design System

> **Canonical UI specification.** All implementation work must conform to this document. If an existing page conflicts with this system, the design system wins unless a newer ADR explicitly supersedes it.

## 1. Product Character

ScolaPro is an official education operations platform. It should feel calm, modern, compact, trustworthy and intentional. The interface must support dense information without becoming visually noisy.

Visual inspiration direction:
- quiet neutral canvases;
- compact dashboards;
- softly elevated surfaces;
- strong left-aligned hierarchy;
- restrained accent colors;
- polished charts;
- subtle motion;
- minimal decorative clutter.

Do not reproduce any reference screenshot literally. Reuse the design qualities, not another product's identity or layout.

## 2. Design Foundations

### 2.1 Eight-point grid

Use an 8-point spacing system with a 4px half-step when genuinely needed.

Approved spacing tokens:
- `space-1 = 4px`
- `space-2 = 8px`
- `space-3 = 12px`
- `space-4 = 16px`
- `space-6 = 24px`
- `space-8 = 32px`
- `space-10 = 40px`
- `space-12 = 48px`
- `space-16 = 64px`

Do not introduce arbitrary spacing values in feature components.

### 2.2 Typography

Primary UI font: **Plus Jakarta Sans**.

Fallback stack must use appropriate system sans-serif fallbacks.

Use a restrained fluid type scale. Large marketing display type is allowed on the public landing page; authenticated product pages remain compact.

Suggested tokens:
- `text-xs`: 12px
- `text-sm`: clamp(13px, 0.78rem + 0.12vw, 14px)
- `text-base`: clamp(14px, 0.84rem + 0.14vw, 16px)
- `text-lg`: clamp(16px, 0.96rem + 0.18vw, 18px)
- `text-xl`: clamp(18px, 1.05rem + 0.3vw, 22px)
- `text-2xl`: clamp(22px, 1.22rem + 0.55vw, 28px)
- `text-3xl`: clamp(28px, 1.55rem + 0.8vw, 36px) — mostly marketing / exceptional product moments.

Application title guidance:
- page title: usually `text-xl` or `text-2xl`, weight 600;
- section title: `text-base`/`text-lg`, weight 600;
- labels/buttons: weight 500;
- body: weight 400;
- numbers requiring emphasis: weight 600.

Avoid:
- giant page headings;
- eyebrow labels above every title;
- general-purpose monospace UI;
- defaulting to Inter because a template uses it.

### 2.3 Alignment

Left alignment is the default. Center only when the composition genuinely benefits from it (empty states, authentication, selected marketing sections).

### 2.4 Density

Authenticated screens use a compact density optimized for school laptops and normal desktop monitors. Compact does not mean tiny: touch targets, accessibility and readability remain intact.

## 3. Color & Tokens

All colors must be semantic tokens defined centrally in CSS variables / Tailwind theme. Feature components must not hardcode hex values.

### Neutral surfaces

Required semantic tokens:
- `--background`
- `--foreground`
- `--surface`
- `--surface-muted`
- `--surface-subtle`
- `--surface-elevated`
- `--border`
- `--border-subtle`
- `--muted-foreground`

### Accent

Use a restrained indigo/blue-violet brand family rather than raw saturated blue. Accent should guide attention, not flood the screen.

### Semantic colors

Use softened semantic tokens:
- success;
- warning;
- destructive;
- info.

Semantic meaning must never rely on color alone.

### Forbidden color behavior

Do not:
- use pure black as normal application text;
- use pure white as the only surface everywhere;
- use raw fully saturated blue as the primary background of many elements;
- use low-contrast grey text on tinted surfaces;
- create rainbow dashboards;
- use gradient text.

## 4. Surface System

Use surface hierarchy instead of wrapping every section in a card.

- **Canvas:** global app background.
- **Surface:** primary content areas.
- **Muted surface:** filters, grouped controls, secondary sections.
- **Elevated surface:** menus, popovers, dialogs, drawers.

A page can contain large open content zones with spacing and tonal separation. A card is a tool, not the default wrapper for every block.

## 5. Borders, Radius & Elevation

### Border
- default: 1px subtle neutral;
- avoid thick borders;
- no decorative colored left stripes on cards.

### Radius
Suggested tokens:
- `radius-sm = 8px`
- `radius-md = 12px`
- `radius-lg = 16px`
- `radius-xl = 20px`

Do not randomly mix radii.

### Shadows
Use low-opacity soft shadows only when elevation is semantically useful. Normal content separation should usually come from spacing, tone and subtle borders.

## 6. App Shell

Desktop:
- compact persistent sidebar;
- top bar with context, global search, notifications and account controls;
- content region with restrained page header;
- contextual subnavigation only when needed.

Mobile:
- compact top bar;
- drawer or carefully selected bottom navigation for frequent role actions;
- no desktop-only interaction assumptions;
- important actions remain reachable and visible.

## 7. Components

ScolaPro uses **shadcn/ui as owned source code**, not as untouched defaults. Components must be normalized to ScolaPro tokens and interaction rules.

Current shadcn supports Base UI, Radix and React Aria bases. ScolaPro should initialize one base and remain consistent; do not mix bases casually. Prefer the base selected in the frontend architecture decision and wrap/compose through ScolaPro components rather than importing random alternatives.

Use styled components for:
- button;
- input;
- textarea;
- checkbox;
- radio group;
- switch;
- select;
- combobox;
- date picker/calendar;
- tabs;
- dialog;
- alert dialog;
- drawer/sheet;
- popover;
- tooltip;
- dropdown menu;
- command/search;
- table/data-grid shell;
- pagination;
- badges/status;
- alert/banner;
- skeleton/spinner/progress;
- empty state.

### Native-control rule

Do not ship browser-styled native `select`, radio UI, checkbox UI, date picker UI, confirm/alert dialogs, or similar controls in core ScolaPro workflows. Use accessible ScolaPro/shadcn primitives.

Native HTML semantics may exist underneath headless accessible components where appropriate; the user-facing presentation must remain consistent.

## 8. Buttons & Actions

Variants:
- primary;
- secondary;
- outline/subtle;
- ghost;
- destructive;
- link;
- icon.

Rules:
- avoid oversized buttons;
- primary action is visually clear but not neon;
- every async action has pending/disabled feedback;
- destructive actions never look like routine actions;
- icon-only buttons require accessible labels/tooltips where needed;
- directional CTA arrows use the shared ScolaPro CTA treatment rather than one-off icon styling;
- the default external/forward CTA icon is `ArrowUpRight`, with the shared subtle outward hover/focus motion;
- use a straight right arrow only when the semantic meaning is explicitly horizontal navigation, and opt into the shared right-arrow motion token rather than custom transforms.

## 9. Forms

- labels stay visible;
- helper text is concise and readable;
- inline validation appears near the field;
- long selectors use combobox/typeahead;
- dates use consistent ScolaPro date picker;
- sensible defaults reduce typing;
- long forms use sections, steps, progressive disclosure or sticky actions;
- do not place every form section inside nested cards.

## 10. Tables & Dense Workflows

Use tables for inherently tabular tasks: marks, attendance review, class lists, LTSM stock, statutory verification.

Standards:
- compact rows;
- sticky headers where useful;
- frozen identity columns where horizontal movement is necessary;
- search/filter/reset controls;
- keyboard entry where useful;
- clear bulk selection;
- explicit loading/empty/error states;
- appropriate responsive fallback.

## 11. Dashboard Composition

Dashboards should prioritize **actionable exceptions** over decorative metrics.

Use:
- small metric summaries;
- pending tasks;
- readiness indicators;
- compact charts;
- recent activity;
- alerts/exceptions;
- quick actions.

Avoid:
- many saturated colored cards;
- overly large numbers;
- chart walls;
- cards nested inside cards;
- decorative illustrations that displace useful information.

## 12. Charts & Analytics

Charts use a consistent palette derived from tokens. Prefer one dominant accent plus restrained comparison colors.

Charts should animate into view where useful:
- bars may grow from baseline;
- lines may reveal/draw;
- doughnut/radial values may sweep in;
- related series may stagger lightly.

Animation must not delay reading the data and must respect reduced motion.

## 13. Loading, Feedback & State

Every meaningful async operation must communicate state.

Use:
- skeleton for structural loading;
- spinner for localized pending state;
- progress for long-running operations;
- button pending labels (`Saving…`, `Submitting…`);
- inline saved/sync states;
- Sonner toasts for lightweight confirmations;
- banners/dialogs for important or blocking information.

Never leave a click with no visible response.

## 14. Toasts

Use **Sonner** as the toast system. Toast styling is tokenized and theme-aware.

Toast personality is semantic but restrained:
- success → success token, success-soft surface, success icon;
- warning → warning token, warning-soft surface, warning icon;
- error → danger token, danger-soft surface, danger icon;
- info → info token, info-soft surface, info icon;
- loading → brand-soft surface and brand loading indicator.

Use the global ScolaPro toaster/component. Do not manually create black/default Sonner toasts or page-specific toast colors. Toasts retain subtle borders, small-radius treatment, light elevation and high contrast. Descriptions remain readable muted text, while icon/title styling carries the semantic cue. Color must complement the icon and wording, never be the only signal.

Use toasts for:
- save confirmation;
- copy/export started;
- lightweight success/failure feedback.

Do not use toasts as the sole representation of critical errors or workflows requiring user action.

## 15. Responsive Rules

- mobile-first CSS;
- content density scales down gracefully;
- forms collapse to one column;
- sidebar becomes drawer/bottom pattern;
- filters can move to a sheet;
- tables preserve critical columns and allow controlled horizontal scroll when unavoidable;
- touch targets remain usable;
- no important action should disappear below excessive decorative content.

## 16. Accessibility

Minimum standard:
- visible keyboard focus;
- semantic labels;
- keyboard navigation;
- accessible dialogs/focus management;
- no color-only meaning;
- WCAG-minded contrast;
- usable touch targets;
- `prefers-reduced-motion` support;
- screen-reader-compatible dynamic status messages.

## 17. Dark Mode

Dark mode must be designed, not mechanically inverted.

- preserve surface hierarchy;
- avoid pure black canvas;
- avoid glowing saturated borders;
- charts and semantic colors remain legible;
- print documents remain separate from application theme.

## 18. Public Landing Page

The landing page may use more generous whitespace, larger display type and subtle background gradients, while retaining the same tokens and brand language.

Allowed:
- subtle gradient backgrounds;
- larger narrative sections;
- GSAP scroll reveals;
- restrained staggered feature entrances.

Not allowed:
- gradient text;
- excessive parallax;
- scroll hijacking;
- constant looping decoration;
- motion that impairs accessibility or performance.

## 19. Mandatory QA Before Merge

Every new UI surface must be checked for:
- token usage;
- type-scale compliance;
- 8-point spacing rhythm;
- light and dark themes if enabled;
- loading state;
- empty state;
- error state;
- disabled/pending action state;
- keyboard/focus behavior;
- mobile/tablet/desktop layouts;
- reduced-motion behavior where animated;
- absence of browser-styled controls;
- absence of nested-card and border overuse.

A screen is not complete when it merely works. It is complete when it behaves and looks like ScolaPro.