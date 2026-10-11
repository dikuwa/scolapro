import { expect, type Page } from "@playwright/test";
import { SYNTHETIC_ACCOUNTS, syntheticPassword } from "./accounts.mjs";

export type AccountKey = keyof typeof SYNTHETIC_ACCOUNTS;

export function account(key: AccountKey) {
  const value = SYNTHETIC_ACCOUNTS[key];
  if (!value) throw new Error(`Unknown synthetic account: ${String(key)}`);
  return value;
}

/**
 * Signs a synthetic account in through the real login form.
 *
 * The local dev stack occasionally drops a session cookie under load, so a
 * single attempt is retried a few times before failing.
 */
export async function signIn(page: Page, key: AccountKey) {
  const { email } = account(key);
  const password = syntheticPassword();

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    try {
      await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 25_000 });
      await expect(page.locator("#email")).toHaveCount(0, { timeout: 25_000 });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `Unable to sign in as ${email}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

/**
 * Navigates to an attendance URL, retrying past the transient redirect to
 * `/login` that the local stack can emit while a fresh session propagates.
 */
export async function gotoAttendance(page: Page, url = "/attendance") {
  let lastUrl = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    lastUrl = page.url();
    if (!/\/login/.test(lastUrl)) {
      await expect(page.getByRole("heading", { name: "Attendance", exact: true })).toBeVisible({
        timeout: 25_000,
      });
      return;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`Attendance redirected to the login screen (${lastUrl}).`);
}

/** Signs in and opens the attendance workspace. */
export async function signInToAttendance(page: Page, key: AccountKey, url = "/attendance") {
  await signIn(page, key);
  await gotoAttendance(page, url);
}

/** Signs the current session out through the app shell account menu. */
export async function signOut(page: Page) {
  await page.locator('[aria-haspopup="menu"]').first().click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login(\?|$)/, { timeout: 30_000 });
}

/**
 * Opens the day-view "Register class" picker and returns the capturable class
 * labels. Returns [] when the actor has no capturable classes (the denial
 * surface for unassigned teachers, HODs and cross-tenant users).
 *
 * The open is retried so a click that lands before hydration completes is not
 * mistaken for "no classes".
 */
export async function capturableClassOptions(page: Page) {
  const trigger = page.getByRole("button", { name: "Register class", exact: true });
  if ((await trigger.count()) === 0) return [];
  await expect(trigger).toBeVisible();

  await expect(async () => {
    if ((await page.getByRole("listbox").count()) === 0) await trigger.click();
    await expect(page.getByRole("listbox")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });

  const labels = await page.getByRole("option").allInnerTexts();
  await page.keyboard.press("Escape");
  return labels.map((text) => text.split("\n")[0]?.trim() ?? "").filter(Boolean);
}
