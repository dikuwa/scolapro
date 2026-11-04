import { expect, test } from "@playwright/test";
import { DEMO } from "./support/accounts.mjs";
import { signIn } from "./support/session";

const roster = `register_class:${DEMO.registerClass10A}`;
const target = new URLSearchParams({ scope: "all", target: roster });
const previewUrl = `/class-lists?${target}`;
const presetKey = "scolapro:class-list-presets:v1";
const birthDate = "18/06/2010";

test("Class List DOB is opt-in, follows the applied preview and survives preset reload", async ({ page }) => {
  await signIn(page, "admin");
  await page.evaluate((key) => {
    localStorage.setItem(key, JSON.stringify([{
      id: "legacy",
      name: "Legacy columns",
      configuration: { columns: ["sex", "admissionNumber"], blankColumns: 0 },
    }]));
  }, presetKey);

  const response = await page.goto(previewUrl);
  await expect(page.getByRole("columnheader", { name: "Gender" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Date of Birth" })).toHaveCount(0);
  expect(await response!.text()).not.toContain("2010-06-18");

  await page.getByRole("button", { name: "Choose optional fields" }).click();
  await page.getByRole("option", { name: "Date of Birth" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("status").filter({ hasText: "Preview the batch to apply your changes." })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Date of Birth" })).toHaveCount(0);
  await page.getByRole("button", { name: "Preview batch" }).click();
  await expect(page.getByRole("columnheader", { name: "Date of Birth" })).toBeVisible();
  await expect(page.getByRole("cell", { name: birthDate, exact: true })).toBeVisible();

  await page.getByLabel("Preset name").fill("Include DOB");
  await page.getByRole("button", { name: "Save preset" }).click();
  const stored = await page.evaluate((key) => localStorage.getItem(key), presetKey);
  expect(stored).toContain('"dateOfBirth"');
  expect(stored).not.toContain("2010-06-18");
  expect(stored).not.toContain(birthDate);

  await page.goto(previewUrl);
  await page.getByRole("button", { name: "Include DOB", exact: true }).click();
  await page.getByRole("button", { name: "Preview batch" }).click();
  await expect(page.getByRole("cell", { name: birthDate, exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Legacy columns", exact: true }).click();
  await expect(page.getByRole("cell", { name: birthDate, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Preview batch" }).click();
  await expect(page.getByRole("columnheader", { name: "Gender" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Date of Birth" })).toHaveCount(0);

  const printed = await page.request.get(`/api/official-documents/class-list?${target}&columns=dateOfBirth,sex`);
  expect(printed.ok()).toBe(true);
  expect(await printed.text()).toContain(birthDate);
});

test("requesting DOB cannot widen the authorized Class List roster", async ({ page }) => {
  await signIn(page, "outsider");
  const denied = await page.request.get(`/api/official-documents/class-list?${target}&columns=dateOfBirth`);
  expect([403, 404]).toContain(denied.status());
  expect(await denied.text()).not.toContain(birthDate);
});
