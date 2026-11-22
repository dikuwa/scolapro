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

for (const role of ["registerTeacher", "hod", "outsider", "guardian"] as const) {
  test(`${role} cannot reach school-manager official-result approval`, async ({ page }) => {
    await signIn(page, role);
    await page.goto("/assessment/results");
    await expect(page).not.toHaveURL(/\/assessment\/results(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "Official result approval" })).toHaveCount(0);
  });
}
