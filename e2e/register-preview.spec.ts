import { expect, test } from "@playwright/test";
import { DEMO } from "./support/accounts.mjs";
import { signInToAttendance } from "./support/session";

test.describe("inline register document preview and PDF", () => {
  test("the register tab renders the shared document and downloads a PDF", async ({ page }) => {
    await signInToAttendance(page, "admin");
    await page.goto(
      `/attendance?view=register&class=${DEMO.registerClass10A}&date=${DEMO.teachingDate}`,
    );
    await expect(page.getByRole("heading", { name: "Attendance", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Register Teacher document" })).toBeVisible();

    // The on-screen sheet is the resolved bundle document, loaded as an iframe.
    const frame = page.locator('iframe[title*="inline document"]');
    await expect(frame).toBeVisible({ timeout: 45_000 });

    // The HTML sheet must fill the available preview frame without the
    // fixed-width left-aligned canvas seen in #1234.
    const sheet = frame.contentFrame().locator(".sheet");
    await expect(sheet).toBeVisible();
    const geometry = await frame.evaluate((element) => {
      const frameRect = element.getBoundingClientRect();
      const doc = (element as HTMLIFrameElement).contentDocument;
      const sheetRect = doc?.querySelector(".sheet")?.getBoundingClientRect();
      if (!sheetRect) return null;
      return {
        viewport: frameRect.width,
        width: sheetRect.width,
        left: sheetRect.left,
        right: frameRect.width - sheetRect.right,
      };
    });
    expect(geometry).not.toBeNull();
    expect(geometry!.width).toBeGreaterThan(geometry!.viewport * 0.9);
    expect(Math.abs(geometry!.left - geometry!.right)).toBeLessThan(16);


    // The same resolved document backs the PDF download control.
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 45_000 }),
      page.getByRole("button", { name: "PDF", exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });

  test("the register-teacher PDF endpoint returns a PDF for an authorized user", async ({ page }) => {
    await signInToAttendance(page, "admin");

    const response = await page.request.get(
      `/api/attendance/register-teacher?school=${DEMO.schoolId}&class=${DEMO.registerClass10A}` +
        `&date=${DEMO.teachingDate}&mode=week&format=pdf`,
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"] ?? "").toContain("application/pdf");
    const body = await response.body();
    expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
