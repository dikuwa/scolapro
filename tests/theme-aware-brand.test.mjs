import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const brand = readFileSync("src/components/brand/scolapro-brand.tsx", "utf8");
const globals = readFileSync("src/app/globals.css", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");
const theme = readFileSync("src/components/theme/theme-preference.tsx", "utf8");
const appShell = readFileSync("src/components/shell/app-shell.tsx", "utf8");
const login = readFileSync("src/app/login/page.tsx", "utf8");
const offline = readFileSync("src/app/offline/page.tsx", "utf8");
const serviceWorker = readFileSync("public/sw.js", "utf8");

test("shared ScolaPro brand switches blue assets to white assets in dark mode", () => {
  assert.match(brand, /icon-blue\.svg/);
  assert.match(brand, /icon-white\.svg/);
  assert.match(brand, /logo-blue\.svg/);
  assert.match(brand, /logo-white\.svg/);
  assert.match(brand, /scolapro-brand-light/);
  assert.match(brand, /scolapro-brand-dark/);

  assert.match(globals, /\.scolapro-brand-dark \{ display: none; \}/);
  assert.match(globals, /:root\[data-theme="dark"\] \.scolapro-brand-light \{ display: none; \}/);
  assert.match(globals, /:root\[data-theme="dark"\] \.scolapro-brand-dark \{ display: block; \}/);
  assert.match(globals, /:root:not\(\[data-theme\]\) \.scolapro-brand-light \{ display: none; \}/);
  assert.match(globals, /:root:not\(\[data-theme\]\) \.scolapro-brand-dark \{ display: block; \}/);
});

test("all current app identity surfaces use the shared theme-aware brand component", () => {
  assert.match(appShell, /ScolaProMark/);
  assert.match(appShell, /ScolaProWordmark/);
  assert.match(login, /ScolaProWordmark/);
  assert.match(offline, /ScolaProWordmark/);
});

test("favicon bootstraps from effective theme and changes with live theme updates", () => {
  assert.match(layout, /id="scolapro-favicon"/);
  assert.match(layout, /id="scolapro-shortcut-icon"/);
  assert.match(layout, /icon-blue\.svg/);
  assert.match(layout, /icon-white\.svg/);
  assert.match(layout, /faviconBootstrapScript/);
  assert.match(layout, /prefers-color-scheme: dark/);

  assert.match(theme, /syncThemeFavicon/);
  assert.match(theme, /LIGHT_FAVICON = "\/brand\/scolapro\/icon-blue\.svg"/);
  assert.match(theme, /DARK_FAVICON = "\/brand\/scolapro\/icon-white\.svg"/);
  assert.match(theme, /applyThemePreference\(preference/);
  assert.match(theme, /if \(preference === "system"\) syncThemeFavicon\(preference\)/);
});

test("there is no competing Next static favicon file", () => {
  assert.equal(existsSync("src/app/icon.svg"), false);
  assert.doesNotMatch(layout, /icons:\s*\{[\s\S]*?icon:\s*\[/);
  assert.doesNotMatch(layout, /shortcut:/);
});

test("offline shell pre-caches both main brand theme variants", () => {
  for (const asset of [
    "icon-blue.svg",
    "icon-white.svg",
    "logo-blue.svg",
    "logo-white.svg",
  ]) {
    assert.match(serviceWorker, new RegExp(asset.replace(".", "\\.")));
  }
});
