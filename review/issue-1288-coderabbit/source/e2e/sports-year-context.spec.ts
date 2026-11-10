import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { mergedProjectEnv } from "../scripts/env-file.mjs";
import { DEMO, OUTSIDER_TENANT } from "./support/accounts.mjs";
import { isLoopbackHost, resolveE2EEnvironment } from "./support/env-guard.mjs";
import { localSupabaseStatus } from "./support/local-supabase.mjs";
import { signIn } from "./support/session";

const academicYear = 2090;
const path = `/school/sports-houses?year=${academicYear}`;
const editorId = "sports-year-reference-date-editor";
const draftDate = `14/05/${academicYear}`;
const savedDate = `${academicYear}-05-14`;

function yearCard(page: Page) {
  return page.locator("section").filter({
    has: page.getByRole("heading", { name: "Year context", exact: true }),
  });
}

function toast(page: Page, message: string) {
  return page.locator("[data-sonner-toast]").getByText(message, { exact: true });
}

async function expectCardLayout(card: Locator, toggle: Locator) {
  const bounds = await card.boundingBox();
  const button = await toggle.boundingBox();
  const heading = await card.getByRole("heading", { name: "Year context" }).boundingBox();
  expect(bounds).toBeTruthy();
  expect(button).toBeTruthy();
  expect(heading).toBeTruthy();
  expect(button!.x + button!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
  expect(button!.x).toBeGreaterThan(heading!.x + heading!.width / 2);
  expect(Math.abs(button!.y - heading!.y)).toBeLessThanOrEqual(16);
  const overflow = await card.evaluate((node) => ({
    card: node.scrollWidth - node.clientWidth,
    viewport: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(overflow.card).toBeLessThanOrEqual(1);
  expect(overflow.viewport).toBeLessThanOrEqual(1);
}

test.describe("#1288 local-only Sports / Houses Year context", () => {
  const env = mergedProjectEnv(process.cwd());
  const target = resolveE2EEnvironment(env).target;
  test.skip(target !== "local", "Sports year-context saves require local synthetic school data.");

  let local: SupabaseClient;

  test.beforeAll(async () => {
    const status = localSupabaseStatus({ projectRoot: process.cwd() });
    const app = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    const stack = new URL(status.API_URL);
    expect(isLoopbackHost(app.hostname)).toBe(true);
    expect(app.port).toBe(stack.port);
    expect(app.protocol).toBe(stack.protocol);
    const client = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await client.from("schools").select("id,name")
      .in("id", [DEMO.schoolId, OUTSIDER_TENANT.schoolId]);
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(data).toEqual(expect.arrayContaining([
      { id: DEMO.schoolId, name: DEMO.schoolName },
      { id: OUTSIDER_TENANT.schoolId, name: OUTSIDER_TENANT.schoolName },
    ]));
    local = client;
  });

  async function clearSyntheticYear() {
    const { error } = await local.from("sports_year_settings").delete()
      .eq("school_id", DEMO.schoolId).eq("academic_year", academicYear);
    expect(error).toBeNull();
  }

  async function savedSchoolYears() {
    const { data, error } = await local.from("sports_year_settings").select("school_id,age_reference_date")
      .in("school_id", [DEMO.schoolId, OUTSIDER_TENANT.schoolId]).eq("academic_year", academicYear);
    expect(error).toBeNull();
    return data;
  }

  test.beforeEach(clearSyntheticYear);
  test.afterEach(async () => {
    if (local) await clearSyntheticYear();
  });

  for (const width of [375, 768, 1440]) {
    for (const theme of ["light", "dark"] as const) {
      test(`summary, approval and save at ${width}px ${theme}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
        await page.addInitScript((value) => localStorage.setItem("scolapro-theme", value), theme);
        await signIn(page, "admin");
        await page.goto(path);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

        const card = yearCard(page);
        const yearPicker = card.getByRole("button", { name: "Academic year", exact: true });
        const toggle = card.locator(`button[aria-controls="${editorId}"]`);
        const editor = card.locator(`form#${editorId}`);
        const date = editor.getByRole("textbox", { name: /^Official age reference date/ });
        const approval = editor.getByRole("checkbox", { name: /approved by school management/ });
        const submit = editor.getByRole("button", { name: "Save reference date", exact: true });
        const missingDate = card.getByText("Not configured", { exact: true });

        await expect(card).toBeVisible();
        await expect(yearPicker).toHaveText(String(academicYear));
        await expect(card.getByText("Assignment continuity", { exact: true })).toBeVisible();
        await expect(card.getByText("No saved policy", { exact: true })).toBeVisible();
        await expect(missingDate).toBeVisible();
        await expect(toggle).toHaveAccessibleName("Add record");
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        await expect(editor).toHaveCount(0);
        await expectCardLayout(card, toggle);
        await card.screenshot({ path: testInfo.outputPath("closed.png") });

        await toggle.press("Enter");
        await expect(toggle).toHaveAccessibleName("Close editor");
        await expect(toggle).toHaveAttribute("aria-expanded", "true");
        await expect(editor).toBeVisible();
        await expect(yearPicker).toHaveText(String(academicYear));
        await expect(missingDate).toBeVisible();
        await expect(date).toHaveValue("");
        await expect(approval).not.toBeChecked();
        await expectCardLayout(card, toggle);
        await card.screenshot({ path: testInfo.outputPath("editor.png") });

        await date.fill(draftDate);
        await approval.check();
        await editor.getByRole("button", { name: "Cancel", exact: true }).press("Enter");
        await expect(editor).toHaveCount(0);
        await expect(toggle).toBeFocused();
        await toggle.press("Enter");
        await expect(date).toHaveValue("");
        await expect(approval).not.toBeChecked();

        const wrongYear = `14/05/${academicYear + 1}`;
        await date.fill(wrongYear);
        await submit.click();
        await expect(date).toHaveAttribute("aria-invalid", "true");
        await expect(date).toHaveValue(wrongYear);
        await expect(date).toBeFocused();
        await expect(toast(page, "Choose a valid date within the academic year.")).toBeVisible();
        await expect(missingDate).toBeVisible();
        await expectCardLayout(card, toggle);
        await page.screenshot({ path: testInfo.outputPath("validation.png") });

        await date.fill(draftDate);
        await submit.click();
        await expect(toast(page, "Choose a valid date within the academic year and confirm school approval.")).toBeVisible();
        await expect(editor).toBeVisible();
        await expect(date).toHaveValue(draftDate);
        await expect(missingDate).toBeVisible();

        // A valid form targeting the second synthetic school must fail server authorization.
        await approval.check();
        const school = editor.locator('input[name="schoolId"]');
        await school.evaluate((input: HTMLInputElement, id) => { input.value = id; }, OUTSIDER_TENANT.schoolId);
        await submit.click();
        await expect(toast(page, "Only an active School Admin for this school can change the approved Sports reference date.")).toBeVisible();
        await expect(editor).toBeVisible();
        await expect(date).toHaveValue(draftDate);
        await expect(approval).toBeChecked();
        await expect(missingDate).toBeVisible();
        expect(await savedSchoolYears()).toEqual([]);
        await page.screenshot({ path: testInfo.outputPath("server-error.png") });

        await school.evaluate((input: HTMLInputElement, id) => { input.value = id; }, DEMO.schoolId);
        // Keyboard submit leaves the year list open. Its options must lock during the real request.
        await yearPicker.press("Enter");
        const pendingYearOption = card.getByRole("option", { selected: false }).first();
        await expect(pendingYearOption).toBeEnabled();
        const save = Promise.withResolvers<void>();
        await page.route((url) => url.pathname === "/school/sports-houses", async (route) => {
          if (route.request().method() === "POST") await save.promise;
          await route.continue();
        });
        try {
          await submit.press("Enter");
          await expect(yearPicker).toBeDisabled();
          await expect(pendingYearOption).toBeDisabled();
          await expect(toggle).toBeDisabled();
          await expect(page).toHaveURL(new RegExp(`year=${academicYear}$`));
        } finally {
          save.resolve();
        }
        await expect(toast(page, "The school-approved reference date was saved. Age groups remain unchanged.")).toBeVisible();
        await expect(editor).toHaveCount(0);
        await expect(toggle).toHaveAccessibleName("Edit configuration");
        await expect(toggle).toBeFocused();
        await yearPicker.press("Escape");
        await expect(card.getByRole("listbox")).toBeHidden();
        await expect(missingDate).toHaveCount(0);
        await expect(card.locator(`time[datetime="${savedDate}"]`)).toBeVisible();
        await expect(card.getByText(/carry forward/i)).toBeVisible();
        expect(await savedSchoolYears()).toEqual([{ school_id: DEMO.schoolId, age_reference_date: savedDate }]);
        await card.screenshot({ path: testInfo.outputPath("configured.png") });

        await toggle.press("Enter");
        await expect(date).toHaveValue(draftDate);
        await expect(approval).not.toBeChecked();
        await toggle.press("Enter");
        await expect(editor).toHaveCount(0);
        await expect(toggle).toBeFocused();

        await toggle.press("Enter");
        await date.fill(`27/09/${academicYear}`);
        await yearPicker.click();
        const nextYear = card.getByRole("option", { selected: false }).first();
        const nextYearLabel = await nextYear.innerText();
        await nextYear.click();
        await expect(yearPicker).toHaveText(nextYearLabel);
        await expect(editor).toHaveCount(0);
        await yearPicker.click();
        await card.getByRole("option", { name: String(academicYear), exact: true }).click();
        await expect(yearPicker).toHaveText(String(academicYear));
        await expect(editor).toHaveCount(0);
        await toggle.press("Enter");
        await expect(date).toHaveValue(draftDate);
      });
    }
  }

  test("an authenticated teacher can read Year context without its editor", async ({ page }) => {
    await signIn(page, "registerTeacher");
    await page.goto(path);
    const card = yearCard(page);
    await expect(card.getByRole("button", { name: "Academic year", exact: true })).toHaveText(String(academicYear));
    await expect(card.getByText("Not configured", { exact: true })).toBeVisible();
    await expect(card.getByText("Assignment continuity", { exact: true })).toBeVisible();
    await expect(card.locator(`[aria-controls="${editorId}"], #${editorId}`)).toHaveCount(0);
  });
});
