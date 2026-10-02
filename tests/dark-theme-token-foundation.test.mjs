import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("src/app/globals.css", "utf8");

test("design system exposes a real system-dark token palette", () => {
  assert.match(css, /@media \(prefers-color-scheme: dark\)\s*\{/);
  assert.match(css, /color-scheme:\s*dark/);

  for (const token of [
    "--background",
    "--foreground",
    "--surface",
    "--surface-muted",
    "--surface-subtle",
    "--surface-elevated",
    "--border",
    "--border-subtle",
    "--muted-foreground",
    "--brand",
    "--brand-strong",
    "--brand-soft",
    "--success",
    "--success-soft",
    "--warning",
    "--warning-soft",
    "--danger",
    "--danger-soft",
    "--info",
    "--info-soft",
    "--accent-indigo",
    "--accent-indigo-soft",
    "--accent-mint",
    "--accent-mint-soft",
    "--accent-rose",
    "--accent-rose-soft",
    "--accent-amber",
    "--accent-amber-soft",
    "--accent-orange",
    "--accent-orange-soft",
    "--accent-sky",
    "--accent-sky-soft",
  ]) {
    const occurrences = css.split(token).length - 1;
    assert.ok(occurrences >= 2, `${token} has both light and dark values`);
  }
});

test("dark mode keeps semantic palette tokens instead of component-specific overrides", () => {
  const darkBlock = css.match(/@media \(prefers-color-scheme: dark\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.ok(darkBlock);
  assert.doesNotMatch(darkBlock, /\.scolapro-|button\s*\{|input\s*\{|textarea\s*\{/);
});
