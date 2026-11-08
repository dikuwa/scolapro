import { expect, test } from "@playwright/test";
import { localSupabaseStatus } from "./support/local-supabase.mjs";
import { resolveE2EEnvironment } from "./support/env-guard.mjs";
import { mergedProjectEnv } from "../scripts/env-file.mjs";
import { signIn } from "./support/session";

test.describe("#1279 local-only Statutory / EMIS configuration card", () => {
  const target = resolveE2EEnvironment(mergedProjectEnv(process.cwd())).target;
  test.skip(target !== "local", "Statutory settings interaction requires the local synthetic school fixture.");

  test.beforeAll(() => {
    // Reject hosted/staging URLs: screenshots and save behavior must never
    // mutate a real school's statutory profile.
    const status = localSupabaseStatus({ projectRoot: process.cwd() });
    expect(status.API_URL).toBeTruthy();
  });

  async function loadCard(page: import("@playwright/test").Page) {
    await signIn(page, "admin");
    await page.goto("/school/settings");
    const card = page.locator("article").filter({
      has: page.getByRole("heading", { name: "Statutory / EMIS Profile", exact: true }),
    });
    await expect(card).toBeVisible();
    return card;
  }

  for (const width of [375, 768, 1440]) {
    for (const theme of ["light", "dark"] as const) {
      test(`summary and inline Cancel remain aligned at ${width}px ${theme}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
        const card = await loadCard(page);
        await page.evaluate(value => {
          document.documentElement.dataset.theme = value;
          document.documentElement.classList.toggle("dark", value === "dark");
        }, theme);
        for (const label of ["Canonical sources", "Pay point", "Constituency", "School classification", "Satellite school", "Cluster centre"]) {
          await expect(card.getByText(label, { exact: true }).first()).toBeVisible();
        }
        const edit = card.getByRole("button", { name: "Edit configuration", exact: true });
        await expect(edit).toHaveAttribute("aria-expanded", "false");
        const saved = await card.locator("dl").innerText();
        await edit.click();
        const close = card.getByRole("button", { name: "Close editor", exact: true });
        await expect(close).toHaveAttribute("aria-expanded", "true");
        await expect(card.locator("#school-statutory-profile-editor")).toBeVisible();
        const payPoint = card.getByLabel("Pay point", { exact: true });
        const original = await payPoint.inputValue();
        await payPoint.fill("Unsaved synthetic draft");
        await expect(card.locator("dl")).toHaveText(saved, { useInnerText: true });
        const geometry = await card.evaluate(element => {
          const cardBox = element.getBoundingClientRect();
          const buttonBox = element.querySelector("button[aria-controls]")!.getBoundingClientRect();
          return { overflow: element.scrollWidth > element.clientWidth + 1, toggleWithinCard: buttonBox.right <= cardBox.right + 1 };
        });
        expect(geometry).toEqual({ overflow: false, toggleWithinCard: true });
        await testInfo.attach(`statutory-${width}-${theme}.png`, {
          body: await card.screenshot(),
          contentType: "image/png",
        });
        await card.getByRole("button", { name: "Cancel", exact: true }).click();
        await expect(edit).toHaveAttribute("aria-expanded", "false");
        await expect(edit).toBeFocused();
        await edit.click();
        await expect(card.getByLabel("Pay point", { exact: true })).toHaveValue(original);
        await close.click();
        await expect(edit).toHaveAttribute("aria-expanded", "false");
      });
    }
  }

  test("saving unchanged local synthetic fields closes and keeps the summary", async ({ page }) => {
    const card = await loadCard(page);
    const edit = card.getByRole("button", { name: "Edit configuration", exact: true });
    const saved = await card.locator("dl").innerText();
    await edit.click();
    await card.getByRole("button", { name: "Save Statutory / EMIS Profile" }).click();
    await expect(edit).toHaveAttribute("aria-expanded", "false", { timeout: 20000 });
    await expect(card.locator("dl")).toHaveText(saved, { useInnerText: true });
  });
});
