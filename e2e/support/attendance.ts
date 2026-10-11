import { expect, type Page } from "@playwright/test";

/** Navigates to the day view for a specific class and governed date. */
export async function openAttendanceDay(
  page: Page,
  params: { classId?: string; date?: string } = {},
) {
  const search = new URLSearchParams({ view: "day" });
  if (params.classId) search.set("class", params.classId);
  if (params.date) search.set("date", params.date);
  const url = `/attendance?${search.toString()}`;

  let lastUrl = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    lastUrl = page.url();
    if (!/\/login/.test(lastUrl)) {
      await expect(page.getByRole("heading", { name: "Attendance", exact: true })).toBeVisible({
        timeout: 25_000,
      });
      return;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`Attendance redirected to the login screen (${lastUrl}).`);
}

/** Opens the day-view "Register class" picker, retrying past a pre-hydration click. */
async function openClassPicker(page: Page) {
  const trigger = page.getByRole("button", { name: "Register class", exact: true });
  await expect(trigger).toBeVisible();
  await expect(async () => {
    if ((await page.getByRole("listbox").count()) === 0) await trigger.click();
    await expect(page.getByRole("listbox")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  return trigger;
}

/** Selects a register class in the day-view class picker. */
export async function selectRegisterClass(page: Page, className: string) {
  const trigger = await openClassPicker(page);
  await page.getByRole("option", { name: className }).first().click();
  await expect(trigger).toContainText(className);
}

/**
 * Isolates a learner by admission number, marks them absent and dismisses the
 * focus dialog. Relies on the official Present/Absent-only capture vocabulary.
 */
export async function markLearnerAbsentByAdmission(page: Page, admissionNumber: string) {
  await expect(page.getByRole("heading", { name: "Daily register" })).toBeVisible();
  await page.getByPlaceholder("Find learner by name or number…").fill(admissionNumber);

  const absent = page.getByRole("button", { name: "Absent", exact: true }).first();
  await expect(absent).toBeVisible({ timeout: 20_000 });
  await absent.click();

  const done = page.getByRole("button", { name: "Done editing attendance" });
  if (await done.count()) await done.click();
}

/** Clicks the primary register submit control, whatever its current label. */
export async function submitRegister(page: Page) {
  const button = page.getByRole("button", { name: /Confirm register|Save revision/ });
  await expect(button).toBeEnabled({ timeout: 20_000 });
  await button.click();
}

/**
 * Steps the attendance date control until the URL matches, retrying past a
 * pre-hydration click without double-advancing once the URL has changed.
 */
export async function stepAttendanceDate(page: Page, label: string, expected: RegExp) {
  await expect(async () => {
    if (!expected.test(page.url())) {
      await page.getByRole("button", { name: label }).click();
    }
    await expect(page).toHaveURL(expected, { timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}
