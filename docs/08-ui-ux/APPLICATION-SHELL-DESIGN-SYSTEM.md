# ScolaPro Application Shell & Design System Baseline

## Product Character

ScolaPro should feel calm, fast, professional and modern rather than like a legacy enterprise database. The interface is role/task-centric and should reduce cognitive load for teachers working under time pressure.

## Shell

Desktop:
- compact persistent sidebar for primary role navigation;
- top bar for school/context switcher, search, notifications, profile and theme;
- content header with page title, concise context and primary action;
- contextual secondary navigation only when a domain genuinely needs it.

Mobile:
- compact header;
- bottom or drawer-based primary navigation based on role/task frequency;
- primary actions remain reachable without horizontal scrolling;
- attendance, marks and class actions optimized for thumb interaction.

## Navigation Rules

Navigation exposes tasks, not database taxonomy. Avoid deeply nested trees. Ordinary teachers should not see configuration irrelevant to their assignments.

Global search may later surface learners, staff, classes, reports and actions according to permission.

## Design Tokens

Define tokens before feature-specific styling:
- typography scale;
- spacing scale;
- border radius;
- elevation;
- semantic colors;
- surface hierarchy;
- focus states;
- motion duration;
- density modes if later required.

All tokens must be theme-aware and accessible.

## Typography

Use a highly legible modern sans-serif for application UI. Official printed documents may use separate template-specific typography. Avoid oversized dashboard typography that wastes vertical space on small laptops.

## Forms

- labels remain visible;
- helper/error text is concise;
- searchable selects for long lists;
- sensible defaults;
- autosave only where the user can clearly understand state;
- destructive actions separated from routine actions;
- validation appears near the field and in a useful summary when necessary.

## Tables and Grids

Use tables for inherently tabular work: marks, class lists, stock lists, statutory verification. Provide sticky headers/context, keyboard support where useful, search/filter, responsive fallback and explicit empty/loading/error states.

Do not force every domain into cards. Do not force every domain into tables.

## Status & Feedback

Use human-readable statuses such as "Waiting for HOD review". Prefer in-app toast/banner/dialog patterns over browser alerts. Long operations show progress and remain recoverable.

## Accessibility

Baseline requirements:
- keyboard navigation;
- visible focus;
- adequate contrast;
- semantic labels;
- touch targets;
- no information conveyed only by color;
- screen-reader-compatible form errors and dialog focus management.

## Motion

Use restrained motion for navigation continuity, expanding rows, dialogs and feedback. Avoid decorative animation that slows teacher workflows.

## Print Boundary

Application pages are not official documents. Print/PDF templates have dedicated layouts and may render data differently while preserving the same source record.

## First Prototype Surfaces

Before broad implementation, validate the design system against five representative screens:
1. Teacher dashboard
2. Daily attendance
3. Marks grid
4. Learner profile
5. School-admin readiness/dashboard

If the design works for these, extend it to the rest of the product.
