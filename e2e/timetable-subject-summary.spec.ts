import { expect, test } from "@playwright/test";
import { localSupabaseStatus } from "./support/local-supabase.mjs";
import { resolveE2EEnvironment } from "./support/env-guard.mjs";
import { mergedProjectEnv } from "../scripts/env-file.mjs";
import { signIn } from "./support/session";

test.describe("#1285 timetable subject preview (local synthetic)", () => {
  const target = resolveE2EEnvironment(mergedProjectEnv(process.cwd())).target;
  test.skip(target !== "local", "Subject maintenance checks require synthetic local school data.");

  test.beforeAll(() => {
    expect(localSupabaseStatus({ projectRoot: process.cwd() }).API_URL).toBeTruthy();
  });

  for (const width of [375, 768, 1440]) {
    test(`subject preview remains visible before editing at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 950 });
      await signIn(page, "admin");
      await page.goto("/timetable");

      const section = page.locator("details").filter({
        has: page.getByText("Configured subjects", { exact: true }),
      });
      await expect(section).toBeVisible();
      const preview = section.locator("[data-subject-preview]");
      const maintenance = section.locator("[data-subject-maintenance]");
      const disclosure = section.locator("summary");
      await expect(preview).toBeVisible();
      await expect(maintenance).toBeHidden();
      expect(await preview.locator(":scope > span").count()).toBeGreaterThan(0);
      const hasOverflow = await section.evaluate(node => node.scrollWidth > node.clientWidth + 1);
      expect(hasOverflow).toBe(false);
      await testInfo.attach(`subjects-collapsed-${width}.png`, {
        body: await section.screenshot(), contentType: "image/png",
      });

      await disclosure.click();
      await expect(section).toHaveAttribute("open", "");
      await expect(preview).toBeHidden();
      await expect(maintenance).toBeVisible();
      await expect(maintenance.locator("button[aria-label^='Edit']").first()).toBeVisible();

      await disclosure.click();
      await expect(section).not.toHaveAttribute("open");
      await expect(preview).toBeVisible();
    });
  }
});
