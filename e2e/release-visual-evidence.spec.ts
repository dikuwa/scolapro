import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { signIn } from "./support/session";

const themes = ["light", "dark"] as const;

async function capture(page: Page, testInfo: TestInfo, name: string, widths: number[]) {
  for (const width of widths) {
    for (const theme of themes) {
      await page.setViewportSize({ width, height: 950 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
        document.documentElement.classList.toggle("dark", value === "dark");
      }, theme);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
      await testInfo.attach(`${name}-${width}-${theme}.png`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
    }
  }
}

test.describe("release visual evidence (synthetic local school)", () => {
  test.describe.configure({ mode: "serial" });

  test("academic setup has complete responsive theme evidence", async ({ page }, testInfo) => {
    await signIn(page, "admin");
    await page.goto("/school/setup?year=2026");
    await expect(page.getByRole("heading", { name: /^Academic setup ·/ })).toBeVisible();
    await capture(page, testInfo, "academic-setup", [390, 768, 1440]);
  });

  test("admissions has complete responsive theme evidence", async ({ page }, testInfo) => {
    await signIn(page, "admin");
    await page.goto("/school/admissions");
    await expect(page.getByRole("heading", { name: "Admissions & document intake", exact: true })).toBeVisible();
    await capture(page, testInfo, "admissions", [390, 768, 1440]);
  });

  test("grading, library and staff leave have exact 390px evidence", async ({ page }, testInfo) => {
    await signIn(page, "admin");
    const surfaces = [
      { name: "grading", url: "/assessment/grading-scales", heading: "School grading scales" },
      { name: "library", url: "/library?view=class", heading: "Library / Textbooks" },
      { name: "staff-leave", url: "/staff/leave", heading: "Staff Leave & Absence" },
    ];
    for (const surface of surfaces) {
      await page.goto(surface.url);
      await expect(page.getByRole("heading", { name: surface.heading, exact: true })).toBeVisible();
      await capture(page, testInfo, surface.name, [390]);
    }
  });
});
