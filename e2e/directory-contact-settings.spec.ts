import { expect, test } from "@playwright/test";
import { signIn } from "./support/session";

for (const width of [375, 768, 1440]) for (const theme of ["light", "dark"] as const) {
  test(`school directory contact configuration is summary-first at ${width}px ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await signIn(page, "admin");
    await page.goto("/school/settings");
    const card = page.locator("article").filter({ has: page.getByRole("heading", { name: "School Directory contact", exact: true }) });
    await expect(card).toBeVisible();
    await expect(card).toContainText("Public cellphone");
    await expect(card).toContainText("Principal public email");
    const edit = card.getByRole("button", { name: "Edit configuration" });
    await expect(edit).toHaveAttribute("aria-expanded", "false");
    await expect(card.getByLabel("Cellphone", { exact: true })).toHaveCount(0);
    await edit.focus();
    await page.keyboard.press("Enter");
    await expect(card.getByRole("button", { name: "Close editor" })).toHaveAttribute("aria-expanded", "true");
    const cellphone = card.getByLabel("Cellphone", { exact: true });
    await expect(cellphone).toBeVisible();
    const original = await cellphone.inputValue();
    await cellphone.fill("Unsaved synthetic phone");
    await card.getByRole("button", { name: "Cancel" }).click();
    await expect(card.getByLabel("Cellphone", { exact: true })).toHaveCount(0);
    await expect(edit).toHaveAttribute("aria-expanded", "false");
    await expect(edit).toBeFocused();
    await edit.click();
    await expect(card.getByLabel("Cellphone", { exact: true })).toHaveValue(original);
    await card.getByRole("button", { name: "Close editor" }).click();
    await expect(edit).toHaveAttribute("aria-expanded", "false");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
  });
}

test("non-school roles cannot edit public school directory contact", async ({ page }) => {
  await signIn(page, "registerTeacher");
  await page.goto("/school/settings");
  await expect(page).not.toHaveURL(/\/school\/settings/);
});
