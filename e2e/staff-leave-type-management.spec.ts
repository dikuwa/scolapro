import { expect, test } from "@playwright/test";
import { localSupabaseStatus } from "./support/local-supabase.mjs";
import { resolveE2EEnvironment } from "./support/env-guard.mjs";
import { mergedProjectEnv } from "../scripts/env-file.mjs";
import { signIn } from "./support/session";

const target = resolveE2EEnvironment(mergedProjectEnv(process.cwd())).target;
test.describe("#1307 school leave category management", () => {
  test.skip(target !== "local", "Staff leave writes are allowed only on disposable local synthetic schools.");
  test.beforeAll(() => { expect(localSupabaseStatus({ projectRoot: process.cwd() }).API_URL).toBeTruthy(); });

  test("school manager adds a category, can cancel edits, and can inactivate without losing history", async ({ page }, testInfo) => {
    const code = `L1307-${crypto.randomUUID().slice(0, 8)}`.toUpperCase();
    const name = `Synthetic Leave ${code}`;
    await signIn(page, "admin");
    await page.goto("/staff/leave");
    await expect(page.getByRole("heading", { name: "Staff Leave & Absence" })).toBeVisible();
    const card = page.getByRole("region", { name: "Leave type governance" });
    await expect(card).toBeVisible();
    const add = card.getByRole("button", { name: "Add leave type" });
    await add.click();
    await card.getByRole("textbox", { name: "Code" }).fill(code);
    await card.getByRole("textbox", { name: "Name" }).fill(name);
    await card.getByRole("button", { name: "Save type" }).click();
    await expect(page.getByText("Leave type saved.")).toBeVisible();
    await expect(card.getByText(name)).toBeVisible();
    await expect(add).toBeVisible();

    // An invalid attempted Add must not disable Cancel or leak errors into Edit.
    await add.click();
    await card.getByRole("button", { name: "Save type" }).click();
    await expect(card.locator('input[name="code"] + p')).toBeVisible();
    await card.getByRole("button", { name: "Cancel" }).click();
    await expect(card.getByRole("textbox", { name: "Code" })).toHaveCount(0);

    await card.getByRole("button", { name: `Edit ${name}` }).click();
    await expect(card.locator('input[name="code"] + p')).toHaveCount(0);
    const lockedCode = card.getByRole("textbox", { name: "Code" });
    await expect(lockedCode).toHaveValue(code);
    await expect(lockedCode).toHaveAttribute("readonly", "");
    await card.getByRole("textbox", { name: "Name" }).fill("Unsaved temporary draft");
    await card.getByRole("button", { name: "Cancel" }).click();
    await expect(card.getByText("Unsaved temporary draft")).toHaveCount(0);
    await expect(card.getByText(name)).toBeVisible();

    await card.getByRole("button", { name: `Edit ${name}` }).click();
    await expect(card.getByRole("textbox", { name: "Name" })).toHaveValue(name);
    await card.getByRole("button", { name: "Status", exact: true }).click();
    await page.getByRole("listbox").getByRole("option", { name: "Inactive" }).click();
    await card.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Leave type saved.")).toBeVisible();
    await expect(card.getByRole("button", { name: `Edit ${name}` }).locator("..").getByText(/Inactive · No balance ledger/)).toBeVisible();
    await expect(card.getByText(name)).toBeVisible();

    for (const width of [375, 768, 1440]) for (const theme of ["light", "dark"] as const) {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      const overflow = await card.evaluate(element => element.scrollWidth > element.clientWidth + 1);
      expect(overflow).toBe(false);
      await testInfo.attach(`leave-type-${width}-${theme}.png`, { body: await card.screenshot(), contentType: "image/png" });
    }
  });

  test("unassigned teacher does not see leave governance actions", async ({ page }) => {
    await signIn(page, "unassignedTeacher");
    await page.goto("/staff/leave");
    await expect(page.getByRole("button", { name: "Add leave type" })).toHaveCount(0);
  });
});
