import { expect, test } from "@playwright/test";
import { signIn } from "./support/session";
import { localSupabaseStatus } from "./support/local-supabase.mjs";
import { resolveE2EEnvironment } from "./support/env-guard.mjs";
import { mergedProjectEnv } from "../scripts/env-file.mjs";

const target = resolveE2EEnvironment(mergedProjectEnv(process.cwd())).target;
const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
const scaleKey = `E2E-G1313-${suffix}`;
const displayName = `Synthetic Grading Scale ${suffix}`;
const currentYear = new Date().getUTCFullYear();
const startDate = `${currentYear}-01-01`;
const endDate = `${currentYear}-12-31`;

test.describe.serial("#1313 school grading scale governance", () => {
  test.skip(target !== "local", "Grading scale mutations require disposable local synthetic school data.");
  test.beforeAll(() => { expect(localSupabaseStatus({ projectRoot: process.cwd() }).API_URL).toBeTruthy(); });

  test("school admin creates, validates and activates a versioned scale", async ({ page }, testInfo) => {
    await signIn(page, "admin");
    await page.goto("/assessment/grading-scales");
    await expect(page.getByRole("heading", { name: "School grading scales", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "School grading scale setup" })).toBeVisible();
    const add = page.getByRole("button", { name: "Add scale" });
    await expect(add).toBeVisible();

    await add.click();
    await page.locator('input[name="key"]').fill(scaleKey);
    await page.locator('input[name="version"]').fill("synthetic-v1");
    await page.locator('input[name="displayName"]').fill(displayName);
    await page.locator("#effectiveFrom-typed").fill(`01/01/${currentYear}`);
    await page.locator("#effectiveFrom-typed").blur();
    await page.locator("#effectiveTo-typed").fill(`31/12/${currentYear}`);
    await page.locator("#effectiveTo-typed").blur();
    await expect(page.locator('input[name="effectiveFrom"]')).toHaveValue(startDate);
    await expect(page.locator('input[name="effectiveTo"]')).toHaveValue(endDate);
    await page.getByRole("textbox", { name: "Band 1 minimum" }).fill("0");
    await page.getByRole("textbox", { name: "Band 1 maximum" }).fill("99");
    await page.getByRole("textbox", { name: "Band 1 symbol" }).fill("SYN");
    await page.getByRole("button", { name: "Save draft scale" }).click();
    await expect(page.getByText("Draft grading scale saved. Review and activate it separately.")).toBeVisible();
    await expect(add).toBeVisible();
    await expect(page.locator('input[name="key"]')).toHaveCount(0);

    const version = page.locator("article").filter({ hasText: displayName });
    await expect(version).toContainText("synthetic-v1");
    await expect(version).toContainText(`Effective ${startDate} to ${endDate}`);
    await expect(version).toContainText("draft");

    await version.getByRole("checkbox", { name: /I confirm this scale covers 0–100/ }).check();
    await version.getByRole("button", { name: "Activate and freeze" }).click();
    await expect(page.getByText("Bands must exactly cover 0–100", { exact: false })).toBeVisible();
    await expect(version).toContainText("draft");

    await version.getByRole("textbox", { name: "Band 1 maximum" }).fill("100");
    await expect(version.getByRole("button", { name: "Activate and freeze" })).toBeDisabled();
    await version.getByRole("button", { name: "Save draft bands" }).click();
    await expect(page.getByText("Draft grading bands updated.")).toBeVisible();
    await expect(version.getByRole("button", { name: "Activate and freeze" })).toBeDisabled();
    await version.getByRole("checkbox", { name: /I confirm this scale covers 0–100/ }).check();
    await version.getByRole("button", { name: "Activate and freeze" }).click();
    // The server refresh can unmount the transient Sonner toast before an
    // assertion observes it. Verify the persisted active version instead.
    // Active-count totals are shared across synthetic scales; assert this version only.
    await expect(version).toContainText("active");
    await expect(version).toContainText("This version is frozen.");
    await expect(version.getByRole("button", { name: "Save draft bands" })).toHaveCount(0);

    for (const width of [375, 768, 1440]) for (const theme of ["light", "dark"] as const) {
      await page.setViewportSize({ width, height: 950 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
        document.documentElement.classList.toggle("dark", value === "dark");
      }, theme);
      expect(await version.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await testInfo.attach(`grading-scale-${width}-${theme}.png`, {
        body: await version.screenshot(), contentType: "image/png",
      });
    }
  });

  for (const role of ["registerTeacher", "hod"] as const) {
    test(`${role} cannot configure school grading rules`, async ({ page }) => {
      await signIn(page, role);
      await page.goto("/assessment/grading-scales");
      await expect(page).not.toHaveURL(/\/assessment\/grading-scales(?:\?|$)/);
      await expect(page.getByRole("heading", { name: "School grading scales" })).toHaveCount(0);
    });
  }

  test("another school's manager cannot see the first school's configured scale", async ({ page }) => {
    await signIn(page, "outsider");
    await page.goto("/assessment/grading-scales");
    await expect(page.getByRole("heading", { name: "School grading scales" })).toBeVisible();
    await expect(page.getByText(displayName)).toHaveCount(0);
  });
});
