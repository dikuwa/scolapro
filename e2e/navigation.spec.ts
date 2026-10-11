import { expect, test } from "@playwright/test";
import { DEMO } from "./support/accounts.mjs";
import { openAttendanceDay, stepAttendanceDate } from "./support/attendance";
import { signInToAttendance } from "./support/session";

test.describe("attendance navigation", () => {
  test("the view tabs switch between day, week and register", async ({ page }) => {
    await signInToAttendance(page, "admin");
    await openAttendanceDay(page, { date: DEMO.teachingDate });

    // `exact` keeps the view tabs distinct from controls such as "Register class"
    // and "Next school day" that share a prefix with the tab labels.
    await expect(async () => {
      await page.getByRole("button", { name: "Week", exact: true }).click();
      await expect(page).toHaveURL(/view=week/, { timeout: 3_000 });
    }).toPass({ timeout: 30_000 });

    await expect(async () => {
      await page.getByRole("button", { name: "Register", exact: true }).click();
      await expect(page).toHaveURL(/view=register/, { timeout: 3_000 });
    }).toPass({ timeout: 30_000 });

    await expect(async () => {
      await page.getByRole("button", { name: "Day", exact: true }).click();
      await expect(page).toHaveURL(/view=day/, { timeout: 3_000 });
    }).toPass({ timeout: 30_000 });
  });

  test("the date stepper moves across school days", async ({ page }) => {
    await signInToAttendance(page, "admin");
    await openAttendanceDay(page, { date: DEMO.teachingDate });

    await stepAttendanceDate(page, "Next school day", /date=2026-10-14/);
    await stepAttendanceDate(page, "Previous school day", /date=2026-10-13/);
  });
});
