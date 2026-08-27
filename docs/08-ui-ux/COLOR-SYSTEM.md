# ScolaPro Contextual Color System

> **Canonical companion to `DESIGN-SYSTEM.md`.** Feature work must use these tokens. Do not introduce page-specific hex colors, ad-hoc Tailwind palette colors or new semantic hues without updating this document and the central CSS token layer first.

## Purpose

ScolaPro is intentionally restrained, but restrained must not mean visually flat. The product uses neutral surfaces for most structure and a small family of soft contextual colors to create hierarchy, recognition and warmth without turning dashboards into a rainbow.

The approved direction comes from the visual character of the product reference reviewed on 27 August 2026: quiet off-white surfaces, a restrained indigo primary, soft mint, rose and amber contextual panels, plus occasional orange and sky accents. ScolaPro keeps its existing brand color and existing success/warning/danger/info meanings; the contextual palette supplements them.

## Two different color systems

### 1. Semantic status colors

These communicate actual state and must retain their meaning:

- `--success` / `--success-soft`: completed, healthy, verified, positive outcome.
- `--warning` / `--warning-soft`: caution, attention required, approaching limit.
- `--danger` / `--danger-soft`: error, destructive, blocked, failed.
- `--info` / `--info-soft`: neutral information or guidance.
- `--brand` / `--brand-strong` / `--brand-soft`: ScolaPro identity and primary actions.

Do not use a status token decoratively where no status meaning exists.

### 2. Contextual presentation accents

These create visual grouping and lightweight emphasis without asserting workflow status:

- `--accent-indigo` / `--accent-indigo-soft`: primary contextual emphasis, identity, headline metric.
- `--accent-mint` / `--accent-mint-soft`: secondary metric, participation, growth, people/resources.
- `--accent-rose` / `--accent-rose-soft`: tertiary data grouping, comparative category, non-destructive emphasis.
- `--accent-amber` / `--accent-amber-soft`: schedules, readiness, time/context grouping when no warning is implied.
- `--accent-orange` / `--accent-orange-soft`: occasional high-energy supporting accent; use sparingly.
- `--accent-sky` / `--accent-sky-soft`: informational panels, workflow context, calm secondary feature areas.

Current central CSS values:

| Token | Base | Soft |
|---|---|---|
| Indigo | `#6071e9` | `#eef0ff` |
| Mint | `#58a987` | `#edf9f1` |
| Rose | `#c66f98` | `#fbedf4` |
| Amber | `#c28a43` | `#fff6e8` |
| Orange | `#e98a48` | `#fff1e7` |
| Sky | `#5f8fb9` | `#edf5fb` |

These values live in `src/app/globals.css`. Components reference tokens, never these hex values directly.

## Approved reusable tone classes

The CSS layer exposes:

- `scolapro-tone-brand`
- `scolapro-tone-mint`
- `scolapro-tone-rose`
- `scolapro-tone-amber`
- `scolapro-tone-orange`
- `scolapro-tone-sky`

Use these for compact icon wells, small metric identifiers, selected contextual chips and similarly bounded elements. Do not use them as an excuse to color every card.

## Dashboard application rules

A typical 3-metric row may use a sequence such as indigo → mint → amber. If a fourth comparison exists, rose or sky may be introduced. The majority of each metric card remains the normal surface color; usually only the icon well, tiny badge, miniature chart or carefully chosen panel receives the contextual tint.

Large contextual panels may use one soft accent background only when it helps distinguish a meaningful workflow block from its neighboring content. Never alternate every section background just for decoration.

## Charts

Chart series must derive from this token family. Prefer one dominant series plus one or two comparison colors. Avoid arbitrary library default palettes. A chart should still be understandable in monochrome through labels, shape, position or pattern where relevant.

## Public pages

The same accent family may appear on the landing/login/public experience, but the public composition remains calmer than marketing templates. Soft tint fields, small feature icons and lightweight illustrations may use these tokens. Primary CTAs remain brand-colored.

## Notifications

Persistent notifications and Sonner toasts use **status** semantics, not contextual presentation accents. Success remains success, warning remains warning, error remains danger, and information remains info. Contextual mint/rose/amber must not silently replace those meanings.

## Loading

Skeletons preserve structural shape using neutral surfaces. The shared shadcn-style `Spinner` primitive may be layered into genuinely slower loads or local pending controls. Spinner sizing is contextual:

- inline/button: `size-3.5` to `size-4`;
- page/workspace: `size-4` on small screens and `size-5` on larger screens;
- avoid oversized decorative spinners.

## Governance rule

Any coder or AI modifying ScolaPro must first search the existing token set. If the needed meaning already exists, reuse it. If a truly new visual meaning is required, update the central token system and this document before introducing it in feature code. No feature owns its own color palette.
