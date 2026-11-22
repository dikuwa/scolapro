import { expect, test } from "@playwright/test";
import { signIn } from "./support/session";

// #1309 Wave A: establish a real authenticated guardian and an effective,
// synthetic learner relationship. The later publication E2E slice will
// generate and certify an official report for this same learner.
test("linked guardian sees their own learner but no unpublished results", async ({ page }) => {
  await signIn(page, "guardian");
  await page.goto("/parent");
  await expect(page.getByRole("heading", { name: "My children" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Latest published results" })).toBeVisible();
  await expect(page.getByText("No published report results are available yet.")).toBeVisible();
  await expect(page.getByText("Connect your guardian profile")).toHaveCount(0);
  await expect(page.getByText("E2E Isolation Secondary School")).toHaveCount(0);
  await expect(page.getByText("Namib High School", { exact: true }).first()).toBeVisible();
});

test("unlinked outsider cannot view synthetic guardian's learner through parent portal", async ({ page }) => {
  await signIn(page, "outsider");
  await page.goto("/parent");
  // The outsider has no effective guardian_user_links to any demo learner.
  // A role redirect or the empty family state is acceptable, but no learner
  // name or demo school identity may be rendered from the parent's read model.
  await expect(page.getByText("Synthetic Boy", { exact: false })).toHaveCount(0);
  await expect(page.getByText("E2E Linked Guardian", { exact: false })).toHaveCount(0);
});
