import { expect, test } from "@playwright/test";
import { DEMO } from "./support/accounts.mjs";
import { openAttendanceDay } from "./support/attendance";
import { capturableClassOptions, signInToAttendance } from "./support/session";

// The day-view class list is filtered by the same authority the capture action
// enforces, so the visible class list is the browser-observable allow/deny signal.
test.describe("register capture authorization", () => {
  test("school leadership can capture every register class", async ({ page }) => {
    await signInToAttendance(page, "admin");
    await openAttendanceDay(page, { date: DEMO.teachingDate });

    const options = await capturableClassOptions(page);
    expect(options).toHaveLength(2);
    expect(options).toEqual(
      expect.arrayContaining([DEMO.registerClass10AName, DEMO.registerClass10BName]),
    );
  });

  test("the assigned register teacher can capture only their own class", async ({ page }) => {
    await signInToAttendance(page, "registerTeacher");
    await openAttendanceDay(page, { date: DEMO.teachingDate });

    const options = await capturableClassOptions(page);
    expect(options).toEqual([DEMO.registerClass10AName]);
    expect(options).not.toContain(DEMO.registerClass10BName);
  });

  test("an unassigned teacher cannot capture any class", async ({ page }) => {
    await signInToAttendance(page, "unassignedTeacher");
    await openAttendanceDay(page, { date: DEMO.teachingDate });

    expect(await capturableClassOptions(page)).toEqual([]);
    await expect(page.getByText("No register classes configured")).toBeVisible();
  });

  test("a head of department cannot capture without a register assignment", async ({ page }) => {
    await signInToAttendance(page, "hod");
    await openAttendanceDay(page, { date: DEMO.teachingDate });

    expect(await capturableClassOptions(page)).toEqual([]);
    await expect(page.getByText("No register classes configured")).toBeVisible();
  });
});
