import { inflateSync } from "node:zlib";
import { expect, test, type TestInfo } from "@playwright/test";
import { PDFArray, PDFDocument, PDFRawStream, PDFRef } from "pdf-lib";
import { DEMO } from "./support/accounts.mjs";
import { signIn, signInToAttendance } from "./support/session";

const endpoint =
  `/api/attendance/register-teacher?school=${DEMO.schoolId}&class=${DEMO.registerClass10A}` +
  `&date=${DEMO.teachingDate}&mode=full-term`;

// A cold Next dev compile plus a full-term PDF render is slower than the default
// interactive budgets; these are still far below the suite's 90s test timeout.
test.use({ navigationTimeout: 120_000, actionTimeout: 60_000 });
test.describe.configure({ timeout: 240_000 });

type Bundle = {
  html: string;
  pdfBase64: string;
  fileName: string;
  identity: string;
  notice?: string;
  paper?: "a2" | "a1";
  pageCount: number;
};

/**
 * Extracts the literal text drawn by the renderer straight from the PDF content
 * streams. The full-term sheet embeds a real font, so `pdftotext` is not
 * required and the assertion stays inside the repository's own toolchain.
 */
async function pdfText(bytes: Buffer) {
  const document = await PDFDocument.load(bytes);
  let text = "";
  for (const page of document.getPages()) {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray
      ? contents.asArray().map((reference) => document.context.lookup(reference as PDFRef))
      : [contents];
    const content = streams
      .filter((stream) => stream instanceof PDFRawStream)
      .map((stream) => {
        const raw = Buffer.from(stream.getContents());
        try {
          return inflateSync(raw).toString("latin1");
        } catch {
          return raw.toString("latin1");
        }
      })
      .join("\n");
    for (const match of content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
      const value = Buffer.from(match[1], "hex").toString("latin1");
      if (/^[\x20-\x7E]+$/.test(value)) text += `${value} `;
    }
  }
  return text;
}

async function attachBundle(bundle: Bundle, testInfo: TestInfo) {
  const pdfPath = testInfo.outputPath(bundle.fileName);
  await import("node:fs/promises").then(({ writeFile }) => writeFile(pdfPath, Buffer.from(bundle.pdfBase64, "base64")));
  await testInfo.attach(bundle.fileName, { path: pdfPath, contentType: "application/pdf" });
  return pdfPath;
}

test.describe("full-term single-sheet register", () => {
  test("rejects an impossible or out-of-term closing date with 400", async ({ page }) => {
    await signInToAttendance(page, "admin");
    for (const closingDate of ["2026-10-32", "2026-13-01", "2027-01-15"]) {
      const response = await page.request.get(`${endpoint}&closingDate=${closingDate}`, { timeout: 120_000 });
      expect(response.status()).toBe(400);
      const body = await response.json() as { error?: string };
      expect(body.error ?? "").toMatch(/closing date/i);
    }
  });

  test("renders the governed full-term sheet as a matching HTML/PDF bundle", async ({ page }, testInfo) => {
    await signInToAttendance(page, "admin");
    const response = await page.request.get(`${endpoint}&format=bundle`, { timeout: 120_000 });
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["content-type"]).toContain("application/json");

    const bundle = await response.json() as Bundle;
    expect(bundle.identity).toMatch(/^[a-f0-9]{24}$/);
    expect(bundle.fileName).toMatch(/^grade-10-a-full-term-register-\d{4}-\d{2}-\d{2}\.pdf$/);

    const pdfPath = await attachBundle(bundle, testInfo);
    const bytes = await import("node:fs/promises").then(({ readFile }) => readFile(pdfPath));
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(bundle.pageCount);

    if (bundle.notice) {
      // The approved fallback: A2/A1 cannot honour the 8pt/7pt floor, so the
      // unchanged paginated term deck is returned with an explicit notice and a
      // cover page. It must never be presented as a single sheet.
      expect(bundle.paper).toBeUndefined();
      expect(bundle.notice).toMatch(/single sheet/i);
      expect(pdf.getPageCount()).toBeGreaterThanOrEqual(3);
    } else {
      expect(bundle.paper).toBeDefined();
      expect(pdf.getPageCount()).toBe(2);
      for (const page of pdf.getPages()) {
        expect([1684, 2384]).toContain(Math.round(page.getWidth()));
        expect(page.getWidth()).toBeGreaterThan(page.getHeight());
      }
      const pageRule = /@page \{ size: ([\d.]+)pt ([\d.]+)pt; margin:([\d.]+)pt; \}/.exec(bundle.html);
      expect(pageRule).not.toBeNull();
      const [width, height, margin] = pageRule!.slice(1).map(Number);
      expect([1683.78, 2383.94]).toContain(width);
      expect(width).toBeGreaterThan(height);
      expect(margin).toBe(32);
      expect(bundle.html).toMatch(/table \{[^}]*font-size:8pt/);
      expect(bundle.html).toMatch(/thead th \{[^}]*font-size:7pt/);
    }

    const extracted = await pdfText(bytes);
    for (const label of ["BOYS", "GIRLS", "PROVISIONAL", "CLOSING DATE", "Possible"]) {
      expect(extracted.toUpperCase()).toContain(label.toUpperCase());
    }

    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.setContent(bundle.html, { waitUntil: "load" });
    const sheets = page.locator(".full-term-sheet, .register-section");
    expect(await sheets.count()).toBeGreaterThanOrEqual(2);
    if (!bundle.notice) {
      await expect(page.locator(".full-term-sheet")).toHaveCount(2);
      await expect(page.locator(".provisional-banner").first()).toContainText("PROVISIONAL");

      // Issue #1260: the strip must separate observed attendance from the future
      // projection instead of reporting a single "Balance: n / m".
      const balanceText = (await page.locator(".balance-strip").first().textContent()) ?? "";
      const balanceNumber = (label: string) => {
        const match = new RegExp(`${label}\\s*(\\d+)`).exec(balanceText);
        expect(match, `balance strip is missing "${label}": ${balanceText}`).not.toBeNull();
        return Number(match![1]);
      };
      const present = balanceNumber("Present");
      const absent = balanceNumber("Absent");
      const projected = balanceNumber("Projected");
      const observed = balanceNumber("Observed");
      const fullTerm = balanceNumber("Full-term");
      // Attendance integrity: observed present + observed absence is the elapsed
      // slice, and elapsed + projected is the governed whole-term denominator.
      expect(present + absent).toBe(observed);
      expect(observed + projected).toBe(fullTerm);
      expect(balanceText).toContain("✓");
      const closingDate = bundle.fileName.match(/(\d{4}-\d{2}-\d{2})\.pdf$/)![1];
      if (Date.parse(`${closingDate}T00:00:00Z`) > Date.now()) {
        // The term is still running, so the sheet must project the remaining
        // eligible days rather than stopping at today.
        expect(projected).toBeGreaterThan(0);
        expect(fullTerm).toBeGreaterThan(observed);
      }

      // The seeded effective calendar closes Oct 5 and Oct 14; no forced 65.
      for (const sheet of await page.locator(".full-term-sheet").all()) {
        await expect(sheet.locator(".full-term-meta")).toContainText("63 included");
        const holiday = sheet.locator('td.closure-column[title*="International"]');
        await expect(holiday).toHaveCount(1);
        await expect(holiday).toHaveClass(/non-teaching/);
        await expect(holiday.locator(".closure-label")).not.toBeEmpty();
        await expect(sheet.locator(".closure-index, .closure-notes-row")).toHaveCount(0);
        const rows = await sheet.locator(".learner-row").count();
        await expect(holiday).toHaveAttribute("rowspan", String(rows));
        await expect(holiday.locator(".absent-mark")).toHaveCount(0);
        await expect(sheet.locator(".possible-summary-row td.non-teaching")).toHaveCount(2);
      }

      // Issue #1260: nonzero left/right sheet padding inside the 32pt page margin.
      const sheetPadding = await page.locator(".full-term-sheet").first().evaluate(
        (element) => Number.parseFloat(getComputedStyle(element).paddingLeft),
      );
      expect(sheetPadding).toBeGreaterThan(0);

      // Issue #1260 (final): the footer caption and the red totals share one
      // rendered row, so the caption cannot sit below the balance strip.
      const footerRow = page.locator(".sheet-footer-row").first();
      await expect(footerRow.locator(".sheet-foot")).toHaveCount(1);
      await expect(footerRow.locator(".balance-strip")).toHaveCount(1);
      const footerBaselineDelta = await footerRow.evaluate((element) => {
        const foot = element.querySelector(".sheet-foot")!.getBoundingClientRect();
        const balance = element.querySelector(".balance-strip")!.getBoundingClientRect();
        return Math.abs(foot.top - balance.top);
      });
      expect(footerBaselineDelta).toBeLessThanOrEqual(1);

      // The official header is the shared school-document header, not a
      // full-term-specific variant.
      await expect(page.locator(".full-term-sheet .school-header .school-name").first()).not.toBeEmpty();
      expect(Math.abs(sheetPadding - 10 * (96 / 72))).toBeLessThan(0.1);

      const dataFontSize = await page.locator(".full-term-sheet table").first().evaluate(
        (element) => Number.parseFloat(getComputedStyle(element).fontSize),
      );
      // 8pt at the CSS reference resolution of 96dpi.
      expect(Math.abs(dataFontSize - 8 * (96 / 72))).toBeLessThan(0.1);

      // Print parity: the HTML must paginate to exactly the same two landscape
      // sheets as the PDF. A third page means a row or closure band overflowed.
      const printed = await page.pdf({ preferCSSPageSize: true, printBackground: true });
      const printedDocument = await PDFDocument.load(printed);
      expect(printedDocument.getPageCount()).toBe(pdf.getPageCount());
      const pdfWidth = pdf.getPages()[0].getWidth();
      for (const printedPage of printedDocument.getPages()) {
        expect(Math.abs(printedPage.getWidth() - pdfWidth)).toBeLessThan(1);
        expect(printedPage.getWidth()).toBeGreaterThan(printedPage.getHeight());
      }
      await testInfo.attach("synthetic-full-term-sheet-print.pdf", {
        body: printed,
        contentType: "application/pdf",
      });
    }
    await testInfo.attach("synthetic-full-term-sheet.png", {
      body: await sheets.first().screenshot(),
      contentType: "image/png",
    });
  });

  test("the full-term mode is reachable from the register workspace and previews the same sheet", async ({ page }, testInfo) => {
    await signInToAttendance(page, "admin");
    await page.goto(
      `/attendance?view=register&class=${DEMO.registerClass10A}&date=${DEMO.teachingDate}&mode=full-term`,
    );
    await expect(page.getByRole("heading", { name: "Register Teacher document" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Period", exact: true })).toContainText("Full term (single sheet)");
    const closingDate = page.getByRole("button", { name: "Closing date", exact: true });
    await expect(closingDate).toBeVisible();
    await expect(closingDate).toContainText("Last eligible school day");

    const frame = page.locator('iframe[title*="Full-Term Single-Sheet Register"]');
    await expect(frame).toBeVisible({ timeout: 45_000 });
    const gutter = await frame.evaluate(element => Number.parseFloat(getComputedStyle(element.parentElement!).marginLeft));
    expect(gutter).toBeGreaterThanOrEqual(4);
    const documentFrame = frame.contentFrame();
    await expect(documentFrame.locator(".full-term-sheet")).toHaveCount(2, { timeout: 45_000 });
    await expect(documentFrame.locator(".full-term-sheet").first()).toBeVisible();
    await expect(documentFrame.locator(".provisional-banner").first()).toContainText("PROVISIONAL");
    await expect(page.getByText(/Single-sheet A[12] landscape preview/i)).toBeVisible();
    await testInfo.attach("synthetic-full-term-workspace.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  });

  test("the full-term PDF endpoint honours the download contract", async ({ page }) => {
    await signInToAttendance(page, "admin");
    const response = await page.request.get(`${endpoint}&format=pdf`, { timeout: 120_000 });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"] ?? "").toContain("application/pdf");
    expect(response.headers()["content-disposition"] ?? "").toContain("grade-10-a-full-term-register-");
    expect(response.headers()["cache-control"] ?? "").toContain("no-store");
    const body = await response.body();
    expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  test("signed-out requests cannot read the full-term register", async ({ request }) => {
    const response = await request.get(`${endpoint}&format=bundle`);
    expect(response.status()).toBe(401);
  });

  // Class-scope authorization (independent-review finding #1). A staff member
  // may only export the register of a class they are assigned to capture, or
  // via an explicitly governed admin override. An unassigned teacher, an HOD and
  // a cross-tenant administrator must all be denied before any learner data is
  // built.
  test.describe("class-scope authorization", () => {
    const classScopeCases = [
      { role: "admin" as const, allowed: true, because: "governed admin override" },
      { role: "registerTeacher" as const, allowed: true, because: "assigned register teacher of the class" },
      { role: "unassignedTeacher" as const, allowed: false, because: "teacher without the class assignment" },
      { role: "hod" as const, allowed: false, because: "HOD review authority is not capture" },
    ];

    for (const { role, allowed, because } of classScopeCases) {
      test(`${role} ${allowed ? "may" : "may not"} export the assigned class register (${because})`, async ({ page }) => {
        await signInToAttendance(page, role);
        const response = await page.request.get(
          `/api/attendance/register-teacher?school=${DEMO.schoolId}&class=${DEMO.registerClass10A}&date=${DEMO.teachingDate}&mode=full-term&format=bundle`,
          { timeout: 120_000 },
        );
        expect(response.status()).toBe(allowed ? 200 : 403);
        if (!allowed) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          expect(String(body.error ?? "")).toMatch(/not authorized|membership/i);
        }
      });
    }

    test("a cross-tenant administrator cannot reach another school's register", async ({ page }) => {
      await signIn(page, "outsider");
      const response = await page.request.get(
        `/api/attendance/register-teacher?school=${DEMO.schoolId}&class=${DEMO.registerClass10A}&date=${DEMO.teachingDate}&mode=full-term&format=bundle`,
        { timeout: 120_000 },
      );
      expect(response.status()).toBe(403);
    });
  });
});
