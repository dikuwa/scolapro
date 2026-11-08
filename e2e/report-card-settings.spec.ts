import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { DEMO } from "./support/accounts.mjs";
import { localSupabaseStatus } from "./support/local-supabase.mjs";
import { resolveE2EEnvironment } from "./support/env-guard.mjs";
import { mergedProjectEnv } from "../scripts/env-file.mjs";
import { signIn } from "./support/session";

const documentTitle = "Report card & document identity";
const subjectTitle = "Subject report rules";

const subjectId = "e2e40000-0000-4000-8000-000000001199";
function fixtureClient() {
  const status = localSupabaseStatus({ projectRoot: process.cwd() });
  return createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

// This spec creates a local-only synthetic subject with the local service-role
// key. Never seed a different stack when PLAYWRIGHT_BASE_URL targets hosted
// staging: Playwright can test that target only through approved seed controls.
test.describe("local-only report-card configuration fixture", () => {
  const target = resolveE2EEnvironment(mergedProjectEnv(process.cwd())).target;
  test.skip(target !== "local", "Reporting fixture is local Supabase only; staging must use its guarded seed.");

test.beforeAll(async () => {
  const { error } = await fixtureClient().from("subjects").upsert({
    id: subjectId, tenant_id: DEMO.tenantId, school_id: DEMO.schoolId, subject_code: "E2E-REPORT",
    display_name: "E2E Reporting Subject", status: "active",
  });
  expect(error).toBeNull();
});

test.afterAll(async () => {
  const client = fixtureClient();
  const { error: ruleError } = await client.from("school_settings").delete().eq("school_id", DEMO.schoolId).eq("setting_key", `report_card_subject.${subjectId}`);
  expect(ruleError).toBeNull();
  const { error } = await client.from("subjects").delete().eq("school_id", DEMO.schoolId).eq("id", subjectId);
  expect(error).toBeNull();
});

async function settingsPage(page: import("@playwright/test").Page) {
  await signIn(page, "admin");
  await page.goto("/school/settings");
  await expect(page.getByRole("heading", { name: documentTitle, exact: true })).toBeVisible();
  return {
    documentCard: page.locator("article").filter({ has: page.getByRole("heading", { name: documentTitle, exact: true }) }),
    subjectCard: page.locator("article").filter({ has: page.getByRole("heading", { name: subjectTitle, exact: true }) }),
  };
}

for (const width of [375, 768, 1440]) for (const theme of ["light", "dark"] as const) {
  test(`report configuration summaries and in-card editors at ${width}px ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    const { documentCard, subjectCard } = await settingsPage(page);
    await page.evaluate(theme => {
      document.documentElement.dataset.theme = theme;
      document.documentElement.classList.toggle("dark", theme === "dark");
    }, theme);
    for (const card of [documentCard, subjectCard]) {
      const toggle = card.getByRole("button", { name: "Edit configuration", exact: true });
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      const summary = card.locator(":scope > div").nth(1);
      const savedText = await summary.innerText();
      expect(savedText.length).toBeGreaterThan(0);
      await page.keyboard.press("Tab");
      await toggle.focus();
      await expect(toggle).toBeFocused();
      expect(await toggle.evaluate(node => getComputedStyle(node).boxShadow)).not.toBe("none");
      await page.keyboard.press("Enter");
      const close = card.getByRole("button", { name: "Close editor", exact: true });
      await expect(close).toHaveAttribute("aria-expanded", "true");
      await expect(summary).toHaveText(savedText, { useInnerText: true });
      const panelId = await close.getAttribute("aria-controls");
      await expect(card.locator(`[id="${panelId}"]`)).toBeVisible();
      const geometry = await card.evaluate(node => {
        const card = node.getBoundingClientRect();
        const toggle = node.querySelector("button[aria-controls]")!.getBoundingClientRect();
        const title = node.querySelector("h3")!.getBoundingClientRect();
        return { overflow: node.scrollWidth > node.clientWidth + 1, right: toggle.right <= card.right, top: Math.abs(title.top - toggle.top) < 20, font: parseFloat(getComputedStyle(node.querySelector("h3")!).fontSize) };
      });
      expect(geometry).toMatchObject({ overflow: false, right: true, top: true });
      expect(geometry.font).toBeGreaterThanOrEqual(12);
      expect(geometry.font).toBeLessThanOrEqual(14);
      // Hide fixed shell chrome only during the isolated card capture.
      await testInfo.attach(`${width}-${theme}-${panelId}`, { body: await card.screenshot({ style: "header, nav, nextjs-portal { opacity: 0 !important; }" }), contentType: "image/png" });
      if (card === subjectCard) {
        const save = card.locator("form").first().getByRole("button", { name: "Save", exact: true });
        const [response] = await Promise.all([
          page.waitForResponse(response => response.request().method() === "POST" && response.url().includes("/school/settings")),
          save.click(),
        ]);
        expect(response.ok()).toBe(true);
        await expect(save).toBeEnabled();
      }
      await close.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(toggle).toBeFocused();
      await toggle.click();
      if (card === documentCard) await card.getByRole("button", { name: "Cancel", exact: true }).click();
      else await card.getByRole("button", { name: "Close editor", exact: true }).click();
      await expect(toggle).toBeFocused();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
}

test("document save, validation, cancel, crest validation and subject save keep saved summaries", async ({ page }) => {
  const { documentCard, subjectCard } = await settingsPage(page);
  const edit = documentCard.getByRole("button", { name: "Edit configuration", exact: true });
  await edit.click();
  const formerName = documentCard.getByLabel("Former / secondary school name", { exact: true });
  const original = await formerName.inputValue();
  await formerName.fill("Unsaved synthetic draft");
  await documentCard.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(documentCard).not.toContainText("Unsaved synthetic draft");
  await edit.click();
  await expect(formerName).toHaveValue(original);
  await documentCard.getByLabel("School email", { exact: true }).fill("invalid-email");
  await documentCard.getByRole("button", { name: "Save document settings", exact: true }).click();
  await expect(documentCard.getByRole("alert")).toContainText("Enter a valid school email address.");
  await expect(documentCard.getByRole("button", { name: "Close editor", exact: true })).toBeVisible();
  await documentCard.getByRole("button", { name: "Cancel", exact: true }).click();
  await edit.click();
  await expect(documentCard.getByRole("alert")).toHaveCount(0);
  await documentCard.locator('input[type="file"]').setInputFiles({ name: "not-a-logo.txt", mimeType: "text/plain", buffer: Buffer.from("synthetic") });
  await expect(page.getByText("Choose a JPG or PNG school logo.", { exact: true })).toBeVisible();
  const logoPath = documentCard.locator('input[name="logoStoragePath"]');
  await expect(logoPath).toHaveValue("");
  await documentCard.locator('input[type="file"]').setInputFiles({
    name: "synthetic-crest.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=", "base64"),
  });
  await expect(logoPath).not.toHaveValue("");
  const storedPreview = await documentCard.getByAltText("Namib High School saved logo").getAttribute("src");
  await documentCard.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(logoPath).toHaveValue("");
  // Removing the current crest must preserve the append-only stored asset.
  expect((await page.request.get(storedPreview!)).status()).toBe(200);
  await formerName.fill("Synthetic Batch A School");
  await documentCard.getByRole("button", { name: "Save document settings", exact: true }).click();
  await expect(edit).toBeVisible();
  await expect(edit).toBeFocused();
  await expect(documentCard).toContainText("Synthetic Batch A School");
  await edit.click();
  await formerName.fill(original);
  await documentCard.getByRole("button", { name: "Save document settings", exact: true }).click();
  await expect(edit).toBeVisible();

  await subjectCard.getByRole("button", { name: "Edit configuration", exact: true }).click();
  const form = subjectCard.locator("form").first();
  const passMark = form.getByRole("spinbutton");
  const oldMark = await passMark.inputValue();
  await passMark.fill("47");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(subjectCard.locator("dl")).toContainText("47%");
  await passMark.fill(oldMark);
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(subjectCard.locator("dl > div").first()).toContainText(oldMark ? `${Number(oldMark)}%` : "Not configured");
  await expect(form.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
});

for (const role of ["registerTeacher", "hod"] as const) test(`${role} cannot open school report settings`, async ({ page }) => {
  await signIn(page, role);
  await page.goto("/school/settings");
  await expect(page).not.toHaveURL(/\/school\/settings/);
  await expect(page.getByRole("heading", { name: documentTitle, exact: true })).toHaveCount(0);
});

test("another school sees only its own empty report configuration", async ({ page }) => {
  await signIn(page, "outsider");
  await page.goto("/school/settings");
  const card = page.locator("article").filter({ has: page.getByRole("heading", { name: subjectTitle, exact: true }) });
  await expect(page.getByText("Document settings for E2E Isolation Secondary School.", { exact: false })).toBeVisible();
  await expect(card).toContainText("Configure active subjects first");
  await expect(card.getByRole("button", { name: "Edit configuration", exact: true })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "School settings", exact: true })).toBeVisible();
});
});
