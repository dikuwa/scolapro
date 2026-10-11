import { expect, test } from "@playwright/test";
import { signIn, signOut } from "./support/session";

test.describe("authenticated session lifecycle", () => {
  test("unauthenticated visitors are redirected to the login screen", async ({ page }) => {
    await page.goto("/attendance");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("#email")).toBeVisible();
  });

  test("a synthetic account signs in and reaches the attendance workspace", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/attendance");
    await expect(page.getByRole("heading", { name: "Attendance", exact: true })).toBeVisible();
  });

  test("invalid credentials are rejected without creating a session", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill("local-admin@scolapro.test");
    await page.locator("#password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText(/could not sign you in/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    // The failed attempt must not have produced a usable session.
    await page.goto("/attendance");
    await expect(page).toHaveURL(/\/login/);
  });

  test("signing out ends the session", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/attendance");
    await expect(page.getByRole("heading", { name: "Attendance", exact: true })).toBeVisible();

    await signOut(page);

    await page.goto("/attendance");
    await expect(page).toHaveURL(/\/login/);
  });
});
