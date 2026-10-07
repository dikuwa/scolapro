import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("src/app/globals.css", "utf8");
const home = readFileSync("src/app/page.tsx", "utf8");

test("global base borders fall back to the semantic design-system border token", () => {
  assert.match(css, /@layer base\s*\{[\s\S]*border-color:\s*var\(--border\)/);
  assert.match(css, /::file-selector-button/);
  assert.doesNotMatch(css, /@layer base\s*\{[\s\S]*border-color:\s*currentColor/);
});

test("dashboard suspense metric dividers use an explicit subtle border token", () => {
  assert.match(
    home,
    /h-24 animate-pulse border-border-subtle bg-surface-muted sm:border-l sm:first:border-l-0/,
  );
});

test("light and dark themes both define semantic border fallback values", () => {
  const rootBorder = css.match(/:root\s*\{[\s\S]*?--border:\s*([^;]+);/)?.[1]?.trim();
  const darkBorder = css.match(/:root\[data-theme="dark"\]\s*\{[\s\S]*?--border:\s*([^;]+);/)?.[1]?.trim();
  assert.ok(rootBorder);
  assert.ok(darkBorder);
  assert.notEqual(rootBorder, "currentColor");
  assert.notEqual(darkBorder, "currentColor");
});
