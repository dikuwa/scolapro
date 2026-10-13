import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const compact = read("src/components/ui/compact-action.tsx");
const button = read("src/components/ui/button.tsx");

// The canonical soft danger treatment introduced by PR #1245 for Button `danger`.
const SOFT_DANGER =
  "bg-danger-soft text-[color:var(--danger)] hover:bg-[color:var(--danger)]/15 hover:text-[color:var(--danger)]";

const toneValue = (source, tone) => new RegExp(`${tone}: "([^"]+)"`).exec(source)?.[1];

test("compact-action danger tone uses the theme-aware soft danger tokens", () => {
  assert.match(compact, /danger: "bg-danger-soft text-\[color:var\(--danger\)\]/);
  assert.match(compact, /danger: "[^"\n]*hover:bg-\[color:var\(--danger\)\]\/15/);
  assert.match(compact, /danger: "[^"\n]*hover:text-\[color:var\(--danger\)\]/);
});

test("compact-action danger tone never uses a saturated fill or forced white text", () => {
  assert.doesNotMatch(compact, /danger: "[^"\n]*hover:text-white/);
  assert.doesNotMatch(compact, /danger: "[^"\n]*hover:bg-\[color:var\(--danger\)\]"/);
});

test("compact-action danger tone matches the canonical Button danger variant", () => {
  const compactDanger = toneValue(compact, "danger");
  assert.equal(compactDanger, SOFT_DANGER);
  assert.equal(compactDanger, toneValue(button, "danger"));
});

test("compact-action keeps every tone and its reusable, accessible API", () => {
  for (const tone of ["neutral", "brand", "success", "warning", "danger"]) {
    assert.ok(toneValue(compact, tone), `compact-action must keep the "${tone}" tone`);
  }
  assert.match(compact, /export function CompactActionLink/);
  assert.match(compact, /export function CompactActionButton/);
  assert.match(compact, /tone\?: CompactActionTone/);
  // Accessibility and pending semantics unchanged by the tone alignment.
  assert.match(compact, /aria-label=\{ariaLabel\}/);
  assert.match(compact, /aria-busy=\{waiting \|\| undefined\}/);
  assert.match(compact, /disabled=\{disabled \|\| waiting\}/);
  assert.match(compact, /focus-visible:ring-4/);
});

test("no shared UI component reintroduces a saturated danger tone", () => {
  const dir = new URL("../src/components/ui/", import.meta.url);
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".tsx")) continue;
    const source = readFileSync(new URL(file, dir), "utf8");
    assert.doesNotMatch(
      source,
      /danger: "[^"\n]*hover:text-white/,
      `${file}: danger tone must not force white text`,
    );
    assert.doesNotMatch(
      source,
      /danger: "[^"\n]*hover:bg-\[color:var\(--danger\)\]"/,
      `${file}: danger tone must not use a saturated fill`,
    );
  }
});
