import { expect, test } from "@playwright/test";
import { DEMO } from "./support/accounts.mjs";
import {
  markLearnerAbsentByAdmission,
  openAttendanceDay,
  selectRegisterClass,
  submitRegister,
} from "./support/attendance";
import { signInToAttendance } from "./support/session";

/**
 * Regression coverage for #1229: the official register capture must confirm
 * success with a visible notification, and that notification must survive the
 * server refresh that immediately follows the save.
 *
 * The original defect was not a toast being cleared by the refresh — the action
 * state was discarded because `<DailyRegister>` was keyed by the submission id,
 * so `revalidatePath` remounted the component and `useActionState` reset to its
 * initial value before the success effect could run. These tests fail if the
 * key (or any equivalent remount) returns.
 */
test.describe("capture success notification", () => {
  test("the saved notification appears and survives the post-save refresh", async ({ page }) => {
    await signInToAttendance(page, "admin");
    await openAttendanceDay(page, { classId: DEMO.registerClass10B, date: DEMO.teachingDate });
    await selectRegisterClass(page, DEMO.registerClass10BName);

    await expect(page.getByRole("heading", { name: "Daily register" })).toBeVisible();
    const notification = page.getByText("Attendance register saved.");
    await expect(notification).toHaveCount(0);

    await markLearnerAbsentByAdmission(page, "DEMO-002");
    await expect(page.getByText("1 exceptions", { exact: true })).toBeVisible();
    await submitRegister(page);

    // The success notification must actually fire on capture.
    await expect(notification).toBeVisible({ timeout: 25_000 });

    // The refresh that follows must still flip the action into its persisted
    // revision state...
    await expect(page.getByRole("button", { name: "Save revision" })).toBeVisible({ timeout: 25_000 });

    // ...without clearing the notification that the user just received.
    await expect(notification).toBeVisible();
  });

  test("the assigned register teacher also receives the saved notification", async ({ page }) => {
    await signInToAttendance(page, "registerTeacher");
    await openAttendanceDay(page, { classId: DEMO.registerClass10A, date: DEMO.teachingDate });

    await expect(page.getByRole("heading", { name: "Daily register" })).toBeVisible();
    const notification = page.getByText("Attendance register saved.");
    await expect(notification).toHaveCount(0);

    await markLearnerAbsentByAdmission(page, "DEMO-001");
    await expect(page.getByText("1 exceptions", { exact: true })).toBeVisible();
    await submitRegister(page);

    await expect(notification).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole("button", { name: "Save revision" })).toBeVisible({ timeout: 25_000 });
    await expect(notification).toBeVisible();
  });
});
