import { expect, test } from "@playwright/test";
import { DEMO } from "./support/accounts.mjs";
import { capturableClassOptions, signInToAttendance } from "./support/session";

// The isolation tenant has no register classes at all, so the summary reports
// "Not configured" and no class is ever capturable.
test.describe("tenant isolation", () => {
  test("a second-tenant administrator sees no classes from the demo school", async ({ page }) => {
    await signInToAttendance(page, "outsider");

    await expect(page.getByText("E2E Isolation Secondary School").first()).toBeVisible();
    expect(await capturableClassOptions(page)).toEqual([]);
    await expect(page.getByText("Not configured", { exact: true })).toBeVisible();
    await expect(page.getByText(DEMO.registerClass10AName)).toHaveCount(0);
  });

  test("a second-tenant administrator cannot open a demo-school register by URL", async ({ page }) => {
    await signInToAttendance(
      page,
      "outsider",
      `/attendance?view=day&class=${DEMO.registerClass10A}&date=${DEMO.teachingDate}`,
    );

    expect(await capturableClassOptions(page)).toEqual([]);
    await expect(page.getByText("Not configured", { exact: true })).toBeVisible();
    await expect(page.getByText(DEMO.registerClass10AName)).toHaveCount(0);
  });
});
