import { expect, test } from "@playwright/test";
import { DEMO } from "./support/accounts.mjs";
import {
  markLearnerAbsentByAdmission,
  openAttendanceDay,
  selectRegisterClass,
} from "./support/attendance";
import { signInToAttendance } from "./support/session";

test.describe("unsaved-change protection", () => {
  test("navigating away from an edited register prompts before discarding", async ({ page }) => {
    await signInToAttendance(page, "admin");
    await openAttendanceDay(page, { classId: DEMO.registerClass10A, date: DEMO.draftDate });
    await selectRegisterClass(page, DEMO.registerClass10AName);

    await markLearnerAbsentByAdmission(page, "DEMO-001");
    await expect(page.getByText("1 exceptions", { exact: true })).toBeVisible();

    // A date change with a dirty draft must be intercepted, not silently applied.
    await page.getByRole("button", { name: "Next school day" }).click();
    await expect(page.getByText("Unsaved attendance changes")).toBeVisible();
    await expect(page).toHaveURL(/date=2026-10-15/);

    await page.getByRole("button", { name: "Discard and continue" }).click();
    await expect(page).toHaveURL(/date=2026-10-16/);
  });
});
