import { expect, test } from "@playwright/test";
import { DEMO } from "./support/accounts.mjs";
import {
  markLearnerAbsentByAdmission,
  openAttendanceDay,
  selectRegisterClass,
  submitRegister,
} from "./support/attendance";
import { signInToAttendance } from "./support/session";

test.describe("official register capture", () => {
  test("school leadership captures an official register", async ({ page }) => {
    await signInToAttendance(page, "admin");
    await openAttendanceDay(page, { classId: DEMO.registerClass10B, date: DEMO.teachingDate });
    await selectRegisterClass(page, DEMO.registerClass10BName);

    await expect(page.getByRole("heading", { name: "Daily register" })).toBeVisible();
    await markLearnerAbsentByAdmission(page, "DEMO-002");
    await expect(page.getByText("1 exceptions", { exact: true })).toBeVisible();

    await submitRegister(page);
    // A persisted submission always turns the primary action into a revision.
    // That deterministic state is the capture-success signal: the transient
    // success toast is cleared by the immediate router.refresh() that follows it.
    await expect(page.getByRole("button", { name: "Save revision" })).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText("1 exceptions", { exact: true })).toBeVisible();
  });

  test("the assigned register teacher captures their own class", async ({ page }) => {
    await signInToAttendance(page, "registerTeacher");
    await openAttendanceDay(page, { classId: DEMO.registerClass10A, date: DEMO.teachingDate });

    await expect(page.getByRole("heading", { name: "Daily register" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Register class", exact: true })).toContainText(
      DEMO.registerClass10AName,
    );

    await markLearnerAbsentByAdmission(page, "DEMO-001");
    await expect(page.getByText("1 exceptions", { exact: true })).toBeVisible();
    await submitRegister(page);
    await expect(page.getByRole("button", { name: "Save revision" })).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText("1 exceptions", { exact: true })).toBeVisible();
  });
});
