import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const globals = readFileSync("src/app/globals.css", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");
const theme = readFileSync("src/components/theme/theme-preference.tsx", "utf8");
const accountMenu = readFileSync("src/components/shell/account-menu.tsx", "utf8");
const settingsPage = readFileSync("src/app/settings/page.tsx", "utf8");

test("explicit Light and Dark preferences override system theme while System keeps media fallback", () => {
  assert.match(globals, /:root\[data-theme="dark"\]/);
  assert.match(globals, /:root:not\(\[data-theme\]\)/);
  assert.match(globals, /@media \(prefers-color-scheme: dark\)/);
  assert.match(globals, /color-scheme: light/);
  assert.match(globals, /color-scheme: dark/);
});

test("theme preference is applied before hydration to avoid a refresh flash", () => {
  assert.match(layout, /scolapro-theme/);
  assert.match(layout, /localStorage\.getItem/);
  assert.match(layout, /root\.dataset\.theme/);
  assert.match(layout, /suppressHydrationWarning/);
  assert.match(layout, /dangerouslySetInnerHTML/);
});

test("theme switcher supports System Light and Dark with browser-local persistence", () => {
  for (const value of ["system", "light", "dark"]) assert.match(theme, new RegExp(`value: "${value}"`));
  assert.match(theme, /THEME_STORAGE_KEY = "scolapro-theme"/);
  assert.match(theme, /localStorage\.setItem/);
  assert.match(theme, /localStorage\.removeItem/);
  assert.match(theme, /aria-pressed=\{selected\}/);
  assert.match(theme, /System is the default/);
});

test("theme switcher is visible from both account menu and Account settings", () => {
  assert.match(accountMenu, /ThemePreferenceControl compact/);
  assert.match(settingsPage, /AppearanceSettings/);
});
