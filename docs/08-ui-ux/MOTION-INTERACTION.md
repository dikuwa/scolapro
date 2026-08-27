# ScolaPro Motion & Interaction Standard

> Motion must make the application feel responsive, continuous and intentional. It must never become decorative friction.

## 1. Principles

1. **No abrupt state changes** where a short transition can communicate continuity.
2. **Motion confirms cause and effect.** A clicked control should visibly respond.
3. **Official, not theatrical.** ScolaPro is an education operations product; motion is restrained.
4. **Performance first.** Prefer opacity and transform animation. Avoid layout-thrashing animation.
5. **Reduced motion is mandatory.** Respect `prefers-reduced-motion` and provide near-instant alternatives.
6. **Do not hijack scrolling.** Native scroll behavior remains primary.

## 2. Animation Technology

### GSAP

Use **GSAP** for coordinated animation that benefits from timelines, scroll triggers, stagger or chart orchestration. In React use the official `@gsap/react` `useGSAP()` pattern so animations are scoped and cleaned up correctly.

Approved uses:
- public landing-page section reveals;
- restrained authenticated-page content entrance;
- dashboard widget stagger on initial load;
- chart entrance/reveal sequences;
- complex expand/reorder transitions that genuinely benefit from GSAP;
- selected contextual scroll reveals.

Do not use GSAP for every hover or button press.

### CSS transitions

Use CSS/Tailwind transitions for routine microinteraction:
- hover;
- focus;
- pressed states;
- color/background change;
- simple opacity/transform changes.

### Component-library transitions

Use the transition behavior of shadcn/headless primitives for dialogs, popovers, sheets, accordions and menus, normalized to ScolaPro motion tokens.

## 3. Motion Tokens

Recommended duration tokens:
- `motion-instant`: 80ms
- `motion-fast`: 140ms
- `motion-base`: 200ms
- `motion-slow`: 320ms
- `motion-reveal`: 420ms

Longer animation requires explicit justification.

Recommended easing families:
- standard UI: smooth ease-out;
- entering: ease-out / cubic-bezier equivalent;
- exiting: slightly faster ease-in;
- spring-like motion only for selected lightweight interactions and without bounce-heavy behavior.

Do not mix arbitrary durations/eases in feature code.

## 4. Page & Route Transitions

Authenticated route changes should feel immediate. Do not block navigation with full-screen animations.

Preferred pattern:
- retain stable app shell;
- content region changes;
- new content may fade from ~0 to 1 and translate 4–8px into position;
- duration around 160–240ms;
- skeleton/loading state can appear immediately while data resolves.

Avoid dramatic horizontal slides between unrelated application routes.

## 5. Scroll Behavior

- anchor navigation may use smooth scrolling;
- landing-page reveals may use GSAP ScrollTrigger;
- reveal content once rather than replaying excessively;
- use small translate values with opacity;
- keep stagger subtle (roughly 40–80ms between related items);
- do not use scroll-jacking;
- do not add ScrollSmoother by default.

## 6. Hover, Focus & Pressed States

Interactive elements must visibly respond:
- background/tint change;
- subtle shadow/elevation change where appropriate;
- 1–2px translate/scale only where natural;
- focus ring remains clearly visible;
- pressed state is distinct from hover.

Avoid large scale jumps and bouncing controls.

## 7. Loading & Pending Interaction

User actions must never feel ignored.

Examples:
- button immediately enters pending state;
- local control disables if duplicate submission would be unsafe;
- row can show inline spinner/status;
- page areas use skeletons rather than blank whitespace;
- long jobs show progress/status and can continue in background when architecture permits.

## 8. Charts & Analytics

Animate charts only when it improves comprehension:
- bar: grow from baseline;
- line: draw/reveal left-to-right;
- area: reveal with line;
- radial/doughnut: sweep to value;
- KPI number: short value transition if not distracting.

Use coordinated stagger for related series. Keep the final chart readable immediately after entrance.

Charts updating because of filters should generally transition smoothly between states rather than replay a theatrical entrance.

## 9. Dialogs, Menus, Drawers & Tooltips

- dialogs: short fade + subtle scale/translate;
- drawers/sheets: smooth positional transition;
- dropdown/popover: short fade/scale;
- tooltip: quick entrance, no distracting delay after intent is established.

Closing motion should usually be faster than opening.

## 10. Lists, Rows & Reordering

When filtering, inserting or removing list items:
- preserve spatial continuity;
- fade/translate inserted items;
- collapse removed space smoothly when useful;
- do not animate hundreds of table rows individually.

For large data grids, performance and input responsiveness override decorative motion.

## 11. Notifications & Toasts

Sonner toast behavior:
- short smooth entrance/exit;
- no bouncing stacks;
- respect reduced motion;
- do not overwhelm the user with toasts during batch work.

## 12. Landing Page

The public ScolaPro site may be more expressive than the authenticated product while remaining professional.

Approved patterns:
- hero content stagger;
- subtle image/device mockup entrance;
- section fade/translate reveals;
- animated statistics;
- controlled chart/data visualization animation;
- hover transitions on feature/product cards;
- subtle gradient backgrounds.

Avoid:
- gradient text;
- constant floating objects;
- excessive parallax;
- motion on every sentence;
- autoplay animation that competes with reading.

## 13. Reduced Motion

When `prefers-reduced-motion: reduce`:
- remove scroll-based reveal movement;
- remove stagger delays;
- use direct opacity/state changes or no animation;
- avoid animated numeric counting;
- keep essential progress indicators understandable.

## 14. Performance Guardrails

- animate `transform` and `opacity` by default;
- do not animate expensive layout properties repeatedly;
- lazy-load heavy landing-page animation where appropriate;
- do not initialize ScrollTrigger on large numbers of trivial elements;
- measure on mid-range mobile hardware;
- animation must not impair typing, marks entry, attendance capture or navigation.

## 15. AI/Developer Rule

Before adding animation, answer: **what user feedback, hierarchy or continuity does this animation communicate?** If there is no useful answer, do not add it.