import { expect, test } from "@playwright/test";
import { signIn } from "./support/session";

test("school leadership opens the governed official-result approval workspace", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto("/assessment");
  await expect(page.getByRole("link", { name: "Approve official results" })).toBeVisible();
  await page.getByRole("link", { name: "Approve official results" }).click();
  await expect(page.getByRole("heading", { name: "Official result approval" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Governed official-result approval" })).toBeVisible();
  await expect(page.getByText("No grading rules are invented here.", { exact: false })).toBeVisible();
});

for (const role of ["registerTeacher", "hod"] as const) {
  test(`${role} cannot reach school-manager official-result approval`, async ({ page }) => {
    await signIn(page, role);
    await page.goto("/assessment/results");
    await expect(page).not.toHaveURL(/\/assessment\/results(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "Official result approval" })).toHaveCount(0);
  });
}

test("independent school admin can open only their own empty approval scope", async ({ page }) => {
  await signIn(page, "outsider");
  await page.goto("/assessment/results");
  await expect(page.getByRole("heading", { name: "Official result approval" })).toBeVisible();
  // The Picker mounts its options only when open, so asserting page text would
  // pass even if the other tenant's offerings were present in the workspace.
  await page.getByRole("button", { name: "Subject and grade" }).click();
  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();
  // Options mount only when the Picker is open, so this is the first point where
  // cross-tenant leakage would actually be observable. Assert on the opened list
  // itself and avoid depending on whether this tenant has its own fixtures.
  await expect(listbox.getByRole("option").filter({ hasText: "E2E Published Science" })).toHaveCount(0);
  await expect(listbox.getByText("Namib High School")).toHaveCount(0);
  const optionCount = await listbox.getByRole("option").count();
  if (optionCount === 0) {
    await expect(listbox.getByText("No options available yet.", { exact: false })).toBeVisible();
  }
});
