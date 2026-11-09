import { expect, test } from "@playwright/test";
import { localSupabaseStatus } from "./support/local-supabase.mjs";
import { resolveE2EEnvironment } from "./support/env-guard.mjs";
import { mergedProjectEnv } from "../scripts/env-file.mjs";
import { signIn } from "./support/session";

test.describe("#1282 local-only banking configuration", () => {
  const target = resolveE2EEnvironment(mergedProjectEnv(process.cwd())).target;
  test.skip(target !== "local", "Banking configuration QA runs only against local synthetic school data.");

  test.beforeAll(() => {
    expect(localSupabaseStatus({ projectRoot: process.cwd() }).API_URL).toBeTruthy();
  });

  async function cardForAdmin(page: import("@playwright/test").Page) {
    await signIn(page, "admin");
    await page.goto("/school/settings");
    const card = page.locator("article").filter({
      has: page.getByRole("heading", { name: "Banking & payment details", exact: true }),
    });
    await expect(card).toBeVisible();
    return card;
  }

  for (const width of [375, 768, 1440]) for (const theme of ["light", "dark"] as const) {
    test(`summary / edit / cancel at ${width}px ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      const card = await cardForAdmin(page);
      await page.evaluate(value => {
        document.documentElement.dataset.theme = value;
        document.documentElement.classList.toggle("dark", value === "dark");
      }, theme);

      for (const title of ["Bank name", "Account name", "Account number", "Payment instructions"]) {
        await expect(card.locator("dt").filter({ hasText: new RegExp(`^${title}import { expect, test } from "@playwright/test";
import { localSupabaseStatus } from "./support/local-supabase.mjs";
import { resolveE2EEnvironment } from "./support/env-guard.mjs";
import { mergedProjectEnv } from "../scripts/env-file.mjs";
import { signIn } from "./support/session";

test.describe("#1282 local-only banking configuration", () => {
  const target = resolveE2EEnvironment(mergedProjectEnv(process.cwd())).target;
  test.skip(target !== "local", "Banking configuration QA runs only against local synthetic school data.");

  test.beforeAll(() => {
    expect(localSupabaseStatus({ projectRoot: process.cwd() }).API_URL).toBeTruthy();
  });

  async function cardForAdmin(page: import("@playwright/test").Page) {
    await signIn(page, "admin");
    await page.goto("/school/settings");
    const card = page.locator("article").filter({
      has: page.getByRole("heading", { name: "Banking & payment details", exact: true }),
    });
    await expect(card).toBeVisible();
    return card;
  }

  for (const width of [375, 768, 1440]) for (const theme of ["light", "dark"] as const) {
    test(`summary / edit / cancel at ${width}px ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      const card = await cardForAdmin(page);
      await page.evaluate(value => {
        document.documentElement.dataset.theme = value;
        document.documentElement.classList.toggle("dark", value === "dark");
      }, theme);

      for (const title of ["Bank name", "Account name", "Account number", "Payment instructions"]) {
) })).toBeVisible();
      }
      await expect(card.getByRole("status")).toContainText(/Not configured|Not published|Published to eligible payers/);
      const edit = card.getByRole("button", { name: "Edit configuration", exact: true });
      await expect(edit).toHaveAttribute("aria-expanded", "false");
      const savedSummary = await card.locator("dl").innerText();

      await edit.click();
      const close = card.getByRole("button", { name: "Close editor", exact: true });
      await expect(close).toHaveAttribute("aria-expanded", "true");
      await expect(card.locator("#school-payment-settings-editor")).toBeVisible();
      const input = card.locator('input[name="bankName"]');
      const original = await input.inputValue();
      await input.fill("Unsaved synthetic value");
      await expect(card.locator("dl")).toHaveText(savedSummary, { useInnerText: true });
      const bounds = await card.evaluate(node => {
        const outline = node.getBoundingClientRect();
        const toggle = node.querySelector<HTMLButtonElement>("button[aria-controls]")!.getBoundingClientRect();
        return { overflow: node.scrollWidth > node.clientWidth + 1, toggleInside: toggle.right <= outline.right + 1 };
      });
      expect(bounds).toEqual({ overflow: false, toggleInside: true });
      await testInfo.attach(`payment-settings-${width}-${theme}.png`, {
        body: await card.screenshot(), contentType: "image/png",
      });
      await card.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(edit).toHaveAttribute("aria-expanded", "false");
      await expect(edit).toBeFocused();
      await edit.click();
      await expect(card.locator('input[name="bankName"]')).toHaveValue(original);
      await card.getByRole("button", { name: "Close editor", exact: true }).click();
      await expect(edit).toHaveAttribute("aria-expanded", "false");
    });
  }

  test("invalid synthetic details never publish and retain edit controls", async ({ page }) => {
    const card = await cardForAdmin(page);
    const previous = await card.locator("dl").innerText();
    await card.getByRole("button", { name: "Edit configuration" }).click();
    await card.locator('input[name="bankName"]').fill("a");
    await card.locator('input[name="accountName"]').fill("a");
    await card.locator('input[name="accountNumber"]').fill("a");
    await card.getByRole("button", { name: "Save banking details" }).click();
    await expect(card.getByRole("button", { name: "Close editor" })).toBeVisible();
    await expect(page.getByText("Enter the required bank details and keep each field within its allowed length.")).toBeVisible();
    await expect(card.locator("dl")).toHaveText(previous, { useInnerText: true });
  });
});
