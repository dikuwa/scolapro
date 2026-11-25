import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { localSupabaseStatus } from "./support/local-supabase.mjs";
import { resolveE2EEnvironment } from "./support/env-guard.mjs";
import { mergedProjectEnv } from "../scripts/env-file.mjs";
import { DEMO } from "./support/accounts.mjs";
import { signIn } from "./support/session";

const target = resolveE2EEnvironment(mergedProjectEnv(process.cwd())).target;
/** Known fixture owned by the demo school; provisioned by this spec, not by test order. */
const ISOLATION_TITLE = "Synthetic Booklist Isolation 1304";

async function provisionIsolationTitle() {
  const local = localSupabaseStatus({ projectRoot: process.cwd() });
  const service = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: deleteError } = await service
    .from("learning_resource_titles")
    .delete()
    .eq("school_id", DEMO.schoolId)
    .eq("title", ISOLATION_TITLE);
  expect(deleteError).toBeNull();
  const { error } = await service.from("learning_resource_titles").insert({
    tenant_id: DEMO.tenantId,
    school_id: DEMO.schoolId,
    resource_type: "textbook",
    title: ISOLATION_TITLE,
    status: "active",
  });
  expect(error).toBeNull();
}

test.describe("#1304 grade booklist functionality (synthetic school only)", () => {
  test.skip(target !== "local", "Changing booklist requirements is permitted only against a local synthetic database.");
  test.beforeAll(async () => {
    expect(localSupabaseStatus({ projectRoot: process.cwd() }).API_URL).toBeTruthy();
    await provisionIsolationTitle();
  });

  test("school admin can save, revise and deactivate a governed grade textbook requirement", async ({ page }, testInfo) => {
    const textbookName = `Synthetic Booklist 1304 ${crypto.randomUUID()}`;
    await signIn(page, "admin");
    await page.goto("/library?view=manage");
    await expect(page.getByRole("heading", { name: "Library / Textbooks" })).toBeVisible();
    const createTitle = page.locator("form").filter({ has: page.getByRole("heading", { name: "Add catalog title" }) });
    await createTitle.locator('input[name="title"]').fill(textbookName);
    await createTitle.getByRole("button", { name: "Create title" }).click();
    await expect(page.getByText("Catalog title created.")).toBeVisible();

    await page.goto("/library?view=class");
    await expect(page.getByRole("heading", { name: "Class borrowing view" })).toBeVisible();
    await page.getByRole("button", { name: "Grade", exact: true }).first().click();
    await page.getByRole("listbox").getByRole("option").filter({ hasNotText: "All grades" }).first().click();
    const card = page.getByRole("region", { name: "Textbook requirements" });
    await expect(card.getByText("Not configured.", { exact: false })).toBeVisible();
    await card.getByRole("button", { name: "Add requirement" }).click();
    await card.getByRole("button", { name: "Textbook", exact: true }).click();
    await page.getByRole("listbox").getByRole("option", { name: textbookName }).click();
    await card.getByRole("spinbutton", { name: "Copies per learner" }).fill("2");
    await card.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Textbook requirement saved.")).toBeVisible();
    await expect(card.getByText(textbookName)).toBeVisible();
    await expect(card.getByText(/2 per learner/)).toBeVisible();
    await expect(card.getByText("Not configured.", { exact: false })).toHaveCount(0);

    // Real configured (synthetic school only) light/dark visual acceptance at 3 device widths.
    for (const width of [375, 768, 1440]) {
      for (const theme of ["light", "dark"] as const) {
        await page.setViewportSize({ width, height: 950 });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
        await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
        const geometry = await card.evaluate(element => ({ overflow: element.scrollWidth > element.clientWidth + 1 }));
        expect(geometry.overflow).toBe(false);
        await testInfo.attach(`library-booklist-${width}-${theme}.png`, { body: await card.screenshot(), contentType: "image/png" });
      }
    }

    await card.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(card.getByRole("button", { name: "Confirm removal" })).toBeVisible();
    await card.getByRole("button", { name: "Keep", exact: true }).click();
    await expect(card.getByText(textbookName)).toBeVisible();
    await card.getByRole("button", { name: "Remove", exact: true }).click();
    await card.getByRole("button", { name: "Confirm removal" }).click();
    // The global destructive-submit guard may require a second explicit confirmation.
    const guardedConfirmation = page.getByRole("alertdialog", { name: "Confirm destructive action" });
    if (await guardedConfirmation.isVisible()) {
      await guardedConfirmation.getByRole("button", { name: "Yes, continue" }).click();
    }
    await expect(page.getByText("Booklist requirement removed from the active list.")).toBeVisible();
    await expect(card.getByText("Not configured.", { exact: false })).toBeVisible();
  });

  test("administrator of another school cannot see demo school's library titles or requirements", async ({ page, browser }) => {
    // The owning school can see the provisioned title...
    await signIn(page, "admin");
    await page.goto("/library?view=manage");
    await expect(page.getByRole("heading", { name: "Library / Textbooks" })).toBeVisible();
    await expect(page.getByText(ISOLATION_TITLE)).toBeVisible();

    // ...and a separate tenant's administrator cannot, in either view.
    const outsiderContext = await browser.newContext();
    try {
      const outsiderPage = await outsiderContext.newPage();
      await signIn(outsiderPage, "outsider");
      await outsiderPage.goto("/library?view=class");
      await expect(outsiderPage.getByRole("heading", { name: "Library / Textbooks" })).toBeVisible();
      await expect(outsiderPage.getByText(ISOLATION_TITLE)).toHaveCount(0);
      await outsiderPage.goto("/library?view=manage");
      await expect(outsiderPage.getByText(ISOLATION_TITLE)).toHaveCount(0);
    } finally {
      await outsiderContext.close();
    }
  });

  test("ordinary teacher cannot access privileged library configuration", async ({ page }) => {
    await signIn(page, "unassignedTeacher");
    await page.goto("/library?view=class");
    await expect(page).not.toHaveURL(/\/library(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "Official textbook requirements" })).toHaveCount(0);
  });
});
