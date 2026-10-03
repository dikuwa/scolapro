import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const globals = readFileSync("src/app/globals.css", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");
const theme = readFileSync("src/components/theme/theme-preference.tsx", "utf8");
const accountMenu = readFileSync("src/components/shell/account-menu.tsx", "utf8");
const appShell = readFileSync("src/components/shell/app-shell.tsx", "utf8");
const shellFrame = readFileSync("src/components/shell/shell-frame.tsx", "utf8");
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

test("theme menu supports System Light and Dark with browser-local persistence", () => {
  for (const value of ["system", "light", "dark"]) assert.match(theme, new RegExp(`value: "${value}"`));
  assert.match(theme, /THEME_STORAGE_KEY = "scolapro-theme"/);
  assert.match(theme, /localStorage\.setItem/);
  assert.match(theme, /localStorage\.removeItem/);
  assert.match(theme, /role="menuitemradio"/);
  assert.match(theme, /aria-checked=\{selected\}/);
  assert.match(theme, /Follow this device/);
  assert.match(theme, /Always use light/);
  assert.match(theme, /Always use dark/);
  assert.doesNotMatch(theme, /grid-cols-3/);
});

test("effective top-bar icon follows Light Dark and OS changes while System is selected", () => {
  assert.match(theme, /SYSTEM_DARK_QUERY = "\(prefers-color-scheme: dark\)"/);
  assert.match(theme, /subscribeSystemTheme/);
  assert.match(theme, /const effectiveDark = preference === "dark" \|\| \(preference === "system" && systemDark\)/);
  assert.match(theme, /const TriggerIcon = effectiveDark \? Moon : Sun/);
});

test("authenticated header exposes a dedicated theme icon before notifications and profile", () => {
  const themeIndex = appShell.indexOf('<ThemeMenu variant="icon" />');
  const notificationIndex = appShell.indexOf("notificationContext ?");
  const accountIndex = appShell.indexOf("<AccountMenu", themeIndex);
  assert.ok(themeIndex >= 0);
  assert.ok(notificationIndex > themeIndex);
  assert.ok(accountIndex > themeIndex);
});

test("account menu uses the vertical theme menu instead of three inline choices", () => {
  assert.match(accountMenu, /<ThemeMenu variant="account" \/>/);
  assert.doesNotMatch(accountMenu, /ThemePreferenceControl/);
  assert.doesNotMatch(accountMenu, /grid-cols-3/);
});

test("root layout gives login and future public pages a theme launcher while AppShell suppresses the duplicate", () => {
  assert.match(layout, /<PublicThemeMenu \/>/);
  assert.match(theme, /scolapro-public-theme-launcher/);
  assert.match(shellFrame, /data-scolapro-shell="true"/);
  assert.match(globals, /body:has\(\[data-scolapro-shell="true"\]\) \.scolapro-public-theme-launcher/);
});

test("Account settings remains an alternate appearance entry using the same menu", () => {
  assert.match(settingsPage, /AppearanceSettings/);
  assert.match(theme, /<ThemeMenu variant="settings" align="left" \/>/);
});
