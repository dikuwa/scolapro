import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type TestInfo } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { DEMO } from "./support/accounts.mjs";
import { signInToAttendance } from "./support/session";

const COMPLETE_PROFILE_LINES = [
  "123 Synthetic School Road",
  "P.O. Box 12345",
  "+264 64 555 0100",
  "+264 64 555 0101",
  "office@synthetic-school.test",
  "Swakopmund",
  "DEMO001",
];

async function expectFittedRegisterFrame(frame: Locator) {
  const geometry = await frame.evaluate((element) => {
    const doc = (element as HTMLIFrameElement).contentDocument;
    const sectionRect = doc?.querySelector(".register-section")?.getBoundingClientRect();
    if (!doc || !sectionRect) return null;
    const viewport = doc.documentElement.clientWidth;
    return {
      viewport,
      width: sectionRect.width,
      left: sectionRect.left,
      right: viewport - sectionRect.right,
      scrollWidth: doc.documentElement.scrollWidth,
    };
  });
  expect(geometry).not.toBeNull();
  expect(geometry!.width).toBeGreaterThan(geometry!.viewport * 0.9);
  expect(geometry!.width).toBeLessThanOrEqual(geometry!.viewport + 1);
  expect(Math.abs(geometry!.left - geometry!.right)).toBeLessThan(4);
  expect(geometry!.scrollWidth).toBeLessThanOrEqual(geometry!.viewport + 2);
}

async function inspectAndAttachPdf(pdfPath: string, label: string, testInfo: TestInfo) {
  const bytes = await import("node:fs/promises").then(({ readFile }) => readFile(pdfPath));
  const parsed = await PDFDocument.load(bytes);
  expect(parsed.getPageCount()).toBeGreaterThanOrEqual(2);
  for (const page of parsed.getPages()) {
    const { width, height } = page.getSize();
    expect(Math.abs(width - 1190.55)).toBeLessThan(1);
    expect(Math.abs(height - 841.89)).toBeLessThan(1);
    expect(width).toBeGreaterThan(height);
  }

  const extracted = execFileSync("pdftotext", [pdfPath, "-"], { encoding: "utf8" });
  for (const value of COMPLETE_PROFILE_LINES) expect(extracted).toContain(value);
  expect(extracted).toContain("BOYS");
  expect(extracted).toContain("GIRLS");
  expect(extracted).toContain("Attendance");
  expect(extracted).toContain("Absence");
  expect(extracted).toContain("Possible");
  expect(extracted).toContain("Balance:");

  const prefix = testInfo.outputPath(`${label}-pdf-page`);
  execFileSync("pdftoppm", ["-png", "-r", "96", pdfPath, prefix], { stdio: "pipe" });
  const directory = path.dirname(prefix);
  const base = path.basename(prefix);
  const pageImages = readdirSync(directory)
    .filter((name) => name.startsWith(`${base}-`) && name.endsWith(".png"))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  expect(pageImages).toHaveLength(parsed.getPageCount());
  for (const [index, image] of pageImages.entries()) {
    await testInfo.attach(`${label}-pdf-page-${index + 1}.png`, {
      path: path.join(directory, image),
      contentType: "image/png",
    });
  }
  return parsed.getPageCount();
}

test.describe("inline register document preview and PDF", () => {
  test("the register tab renders the shared document and downloads a visually inspectable PDF", async ({ page }, testInfo) => {
    await signInToAttendance(page, "admin");
    await page.goto(
      `/attendance?view=register&class=${DEMO.registerClass10A}&date=${DEMO.teachingDate}`,
    );
    await expect(page.getByRole("heading", { name: "Attendance", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Register Teacher document" })).toBeVisible();

    const frame = page.locator('iframe[title*="inline document"]');
    await expect(frame).toBeVisible({ timeout: 45_000 });
    const documentFrame = frame.contentFrame();
    await expect(documentFrame.locator(".sheet")).toBeVisible();
    await expect(documentFrame.locator(".register-section")).toHaveCount(2);
    await expect(documentFrame.locator('.register-section[aria-label^="BOYS register page"]')).toBeVisible();
    await expect(documentFrame.locator('.register-section[aria-label^="GIRLS register page"]')).toBeVisible();
    await expect(documentFrame.locator(".absence-reason-mark").first()).toBeVisible();
    await expect(documentFrame.locator(".non-teaching").first()).toBeVisible();
    const contactText = await documentFrame.locator(".school-contact").first().innerText();
    for (const value of COMPLETE_PROFILE_LINES) expect(contactText).toContain(value);
    const schoolNameFont = await documentFrame.locator(".school-name").first().evaluate(
      (element) => getComputedStyle(element).fontFamily,
    );
    expect(schoolNameFont).toContain("ScolaPro Old English");
    const balanceBorder = await documentFrame.locator(".balance-strip").first().evaluate(
      (element) => getComputedStyle(element).borderStyle,
    );
    expect(balanceBorder).toBe("none");

    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await frame.scrollIntoViewIfNeeded();
      await expectFittedRegisterFrame(frame);
      await testInfo.attach(`synthetic-register-inline-${width}.png`, {
        body: await frame.screenshot(),
        contentType: "image/png",
      });
    }

    await page.getByRole("button", { name: "Preview / Print", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const fullScreenFrame = dialog.locator("iframe");
    await expect(fullScreenFrame).toBeVisible();
    await expect(fullScreenFrame.contentFrame().locator(".register-section").first()).toBeVisible();
    await expectFittedRegisterFrame(fullScreenFrame);
    await testInfo.attach("synthetic-register-full-screen.png", {
      body: await dialog.screenshot(),
      contentType: "image/png",
    });
    await dialog.getByRole("button", { name: "Close document preview" }).click();

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 45_000 }),
      page.getByRole("button", { name: "PDF", exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^grade-10-a-week-register-\d{4}-\d{2}-\d{2}\.pdf$/);
    const pdfPath = testInfo.outputPath("synthetic-register-week.pdf");
    await download.saveAs(pdfPath);
    await testInfo.attach("synthetic-register-week.pdf", {
      path: pdfPath,
      contentType: "application/pdf",
    });
    await inspectAndAttachPdf(pdfPath, "synthetic-register-week", testInfo);
  });

  test("the term bundle repeats matching HTML and PDF pages for boys and girls", async ({ page }, testInfo) => {
    await signInToAttendance(page, "admin");
    const response = await page.request.get(
      `/api/attendance/register-teacher?school=${DEMO.schoolId}&class=${DEMO.registerClass10A}` +
        `&date=${DEMO.teachingDate}&mode=term&format=bundle`,
    );
    expect(response.status()).toBe(200);
    const bundle = await response.json() as {
      html: string;
      pdfBase64: string;
      fileName: string;
      identity: string;
    };
    expect(bundle.fileName).toMatch(/^grade-10-a-term-register-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(bundle.identity).toMatch(/^[a-f0-9]{24}$/);

    await page.setContent(bundle.html, { waitUntil: "load" });
    const sections = page.locator(".register-section");
    const htmlPageCount = await sections.count();
    expect(htmlPageCount).toBeGreaterThanOrEqual(4);
    await expect(page.locator('.register-section[aria-label^="BOYS register page"]').first()).toBeVisible();
    await expect(page.locator('.register-section[aria-label^="GIRLS register page"]').first()).toBeVisible();
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const firstRect = await sections.first().boundingBox();
      expect(firstRect).not.toBeNull();
      expect(firstRect!.width).toBeLessThanOrEqual(width + 1);
      await testInfo.attach(`synthetic-register-term-html-${width}.png`, {
        body: await sections.first().screenshot(),
        contentType: "image/png",
      });
    }
    await testInfo.attach("synthetic-register-term-html-last-page.png", {
      body: await sections.last().screenshot(),
      contentType: "image/png",
    });

    const pdfPath = testInfo.outputPath(bundle.fileName);
    const pdfBytes = Buffer.from(bundle.pdfBase64, "base64");
    await import("node:fs/promises").then(({ writeFile }) => writeFile(pdfPath, pdfBytes));
    await testInfo.attach("synthetic-register-term.pdf", {
      path: pdfPath,
      contentType: "application/pdf",
    });
    const pdfPageCount = await inspectAndAttachPdf(pdfPath, "synthetic-register-term", testInfo);
    expect(pdfPageCount).toBe(htmlPageCount);
  });

  test("the register-teacher PDF endpoint returns a PDF for an authorized user", async ({ page }) => {
    await signInToAttendance(page, "admin");
    const response = await page.request.get(
      `/api/attendance/register-teacher?school=${DEMO.schoolId}&class=${DEMO.registerClass10A}` +
        `&date=${DEMO.teachingDate}&mode=week&format=pdf`,
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"] ?? "").toContain("application/pdf");
    expect(response.headers()["content-disposition"] ?? "").toContain("grade-10-a-week-register-");
    const body = await response.body();
    expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
