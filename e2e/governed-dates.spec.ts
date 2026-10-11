import { expect, test } from "@playwright/test";
import { DEMO } from "./support/accounts.mjs";
import { openAttendanceDay } from "./support/attendance";
import { signInToAttendance } from "./support/session";

test.describe("governed attendance dates", () => {
  test("a governed non-teaching day blocks the register surface", async ({ page }) => {
    await signInToAttendance(page, "admin");
    await openAttendanceDay(page, { classId: DEMO.registerClass10A, date: DEMO.nonTeachingDate });

    await expect(page.getByRole("heading", { name: "No school on this day" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Daily register" })).toHaveCount(0);
  });

  test("a governed teaching day shows the register surface", async ({ page }) => {
    await signInToAttendance(page, "admin");
    await openAttendanceDay(page, { classId: DEMO.registerClass10A, date: DEMO.teachingDate });

    await expect(page.getByRole("heading", { name: "Daily register" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "No school on this day" })).toHaveCount(0);
  });
});
