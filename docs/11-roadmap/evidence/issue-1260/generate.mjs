// Issue #1260 acceptance evidence generator.
//
// Produces the A2/A1, BOYS/GIRLS screen, print and PDF artefacts used to accept
// the full-term Register Teacher single-sheet, plus the numeric measurements
// (horizontal inset and footer placement) quoted in README.md.
//
// It runs the shipping renderers directly, so the evidence is produced by the
// same code path the application uses. The governed term definitions come from
// the authorised Namib High School 2026 learner calendar configuration
// (supabase/migrations/20261004110740_recover_namib_high_2026_learner_calendar.sql).
// Learners are synthetic. No production learner data is read or written.
//
// Usage (from the repository root):
//   node docs/11-roadmap/evidence/issue-1260/generate.mjs

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { PDFArray, PDFDocument, PDFRawStream } from "pdf-lib";
import zlib from "node:zlib";
import {
  HEADER_FIXTURE,
  fullTermHtml,
  fullTermLayout,
  fullTermPdf,
  learnerRow,
  model,
  normalImpactRows,
} from "../../../../tests/helpers/register-teacher-harness.mjs";

const OUT = dirname(fileURLToPath(import.meta.url));
const CSS_PX_TO_PT = 72 / 96;

// Governed Namib High School 2026 learner calendar (authorised configuration).
// Term 3 is the owner's 65-day scenario; Term 1 is long enough that A2 cannot
// hold the date columns at the 8pt floor, so it exercises the A1 sheet.
const CASES = [
  {
    key: "a2",
    termName: "Term 3",
    termStart: "2026-09-07",
    termEnd: "2026-12-04",
    today: "2026-11-05",
    expectedPaper: "a2",
  },
  {
    key: "a1",
    termName: "Term 1",
    termStart: "2026-01-12",
    termEnd: "2026-04-28",
    today: "2026-03-31",
    expectedPaper: "a1",
  },
  {
    // Control Room remediation: a school-opened replacement Saturday makes the
    // included count exceed the scheduled Mon-Fri baseline. The sheet must say
    // so instead of printing a contradictory total.
    key: "a2-replacement-saturday",
    termName: "Term 3",
    termStart: "2026-09-07",
    termEnd: "2026-12-04",
    today: "2026-11-05",
    expectedPaper: "a2",
    replacementSaturday: "2026-09-12",
    screenOnly: true,
  },
];

function buildDocument(entry) {
  return model.buildRegisterTeacherDocument({
    mode: "term",
    schoolId: "synthetic-school",
    academicYear: 2026,
    classId: "synthetic-class",
    className: "Grade 10/A",
    gradeName: "Grade 10",
    registerTeacherName: "Acceptance Evidence Teacher",
    termId: `synthetic-${entry.key}`,
    termName: entry.termName,
    selectedDate: entry.today,
    termStart: entry.termStart,
    termEnd: entry.termEnd,
    scope: model.resolveRegisterTeacherScope({
      mode: "term",
      selectedDate: entry.today,
      termStart: entry.termStart,
      termEnd: entry.termEnd,
    }),
    impactRows: entry.replacementSaturday
      ? [...normalImpactRows(entry.termStart, entry.termEnd), { target_date: entry.replacementSaturday, teaching_impact: "NORMAL" }]
      : normalImpactRows(entry.termStart, entry.termEnd),
    enrolments: [
      learnerRow({ id: "b1", learner_id: "b1", sex: "male", surname: "Boy", first_names: "Evidence", admission_number: "ACC-001" }),
      learnerRow({ id: "g1", learner_id: "g1", sex: "female", surname: "Girl", first_names: "Evidence", admission_number: "ACC-002" }),
    ],
    currentRows: [],
    overrideRows: entry.replacementSaturday
      ? [{ school_date: entry.replacementSaturday, reason: "School open day (replacement Saturday)" }]
      : [],
    calendarEventRows: [],
    submissionRows: [],
    fullTerm: { today: entry.today },
  });
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

/**
 * Measures where ink actually lands on each PDF page. The renderer paints a
 * white page box, so a bounding-box device reports the whole sheet; scanning the
 * raster for dark pixels gives the real content edges instead.
 */
function inkExtents(pdfPath, pageNumber, width) {
  const raw = `/tmp/issue-1260-${process.pid}-${pageNumber}.ppm`;
  execFileSync("gs", [
    "-q", "-dNOPAUSE", "-dBATCH", "-sDEVICE=ppmraw", "-r72",
    `-dFirstPage=${pageNumber}`, `-dLastPage=${pageNumber}`,
    `-sOutputFile=${raw}`, pdfPath,
  ]);
  const bytes = readFileSync(raw);
  let cursor = 0;
  const fields = [];
  while (fields.length < 4) {
    while (/\s/.test(String.fromCharCode(bytes[cursor]))) cursor += 1;
    if (bytes[cursor] === 35) {
      while (bytes[cursor] !== 10) cursor += 1;
      continue;
    }
    let field = "";
    while (!/\s/.test(String.fromCharCode(bytes[cursor]))) {
      field += String.fromCharCode(bytes[cursor]);
      cursor += 1;
    }
    fields.push(field);
  }
  cursor += 1;
  const pageWidth = Number(fields[1]);
  const pageHeight = Number(fields[2]);
  if (pageWidth !== Math.round(width) && Math.abs(pageWidth - width) > 1) {
    throw new Error(`unexpected raster width ${pageWidth} for ${pdfPath}`);
  }
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (let y = 0; y < pageHeight; y += 1) {
    for (let x = 0; x < pageWidth; x += 1) {
      const offset = cursor + (y * pageWidth + x) * 3;
      if ((bytes[offset] + bytes[offset + 1] + bytes[offset + 2]) / 3 < 140) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return {
    pageWidth,
    pageHeight,
    leftPt: left,
    rightPt: pageWidth - 1 - right,
    topPt: top,
    bottomPt: pageHeight - 1 - bottom,
  };
}

function renderPagePng(pdfPath, pageNumber, outputPath) {
  execFileSync("gs", [
    "-q", "-dNOPAUSE", "-dBATCH", "-sDEVICE=png16m", "-r72",
    `-dFirstPage=${pageNumber}`, `-dLastPage=${pageNumber}`,
    `-sOutputFile=${outputPath}`, pdfPath,
  ]);
}

async function measure(page) {
  return page.evaluate(() => {
    const sheets = [...document.querySelectorAll(".full-term-sheet")];
    return sheets.map((sheet) => {
      const box = sheet.getBoundingClientRect();
      const style = getComputedStyle(sheet);
      const table = sheet.querySelector("table");
      const foot = sheet.querySelector(".sheet-foot");
      const balance = sheet.querySelector(".balance-strip");
      const summaries = [...sheet.querySelectorAll(".summary-row")];
      const lastSummary = summaries[summaries.length - 1];
      const rect = (element) => (element ? element.getBoundingClientRect() : null);
      const tableBox = rect(table);
      const footBox = rect(foot);
      const balanceBox = rect(balance);
      const summaryBox = rect(lastSummary);
      return {
        label: sheet.querySelector(".full-term-meta strong")?.parentElement?.textContent?.trim() ?? "",
        sheetWidth: box.width,
        sheetHeight: box.height,
        paddingLeft: Number.parseFloat(style.paddingLeft),
        paddingRight: Number.parseFloat(style.paddingRight),
        tableLeftOffset: tableBox ? tableBox.left - box.left : null,
        tableRightGap: tableBox ? box.right - tableBox.right : null,
        balanceTop: balanceBox ? balanceBox.top - box.top : null,
        lastSummaryBottom: summaryBox ? summaryBox.bottom - box.top : null,
        footerTop: footBox ? footBox.top - box.top : null,
        footerBottom: footBox ? footBox.bottom - box.top : null,
        footerGapFromSummary: footBox && summaryBox ? footBox.top - summaryBox.bottom : null,
        footerGapFromBalance: footBox && balanceBox ? footBox.top - balanceBox.bottom : null,
        footerDistanceFromSheetBottom: footBox ? box.bottom - footBox.bottom : null,
        banner: sheet.querySelector(".provisional-banner")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        summaryLabels: [...sheet.querySelectorAll(".summary-row th")].map((cell) => cell.textContent?.trim() ?? ""),
        sheetText: sheet.textContent?.replace(/\s+/g, " ").trim() ?? "",
      };
    });
  });
}

const browser = await chromium.launch();
const report = { generatedAt: new Date().toISOString(), cases: [], invariants: {} };

try {
  for (const entry of CASES) {
    const document = buildDocument(entry);
    const plan = fullTermLayout.planRegisterTeacherFullTermDocument(document);
    if (!plan.fits) throw new Error(`${entry.key}: plan does not fit (${plan.reason})`);
    if (plan.paper !== entry.expectedPaper) throw new Error(`${entry.key}: expected ${entry.expectedPaper}, planned ${plan.paper}`);

    const html = fullTermHtml.renderRegisterTeacherFullTermHtml({ header: HEADER_FIXTURE, document, plan });
    let pageCount = 0;
    let serverSizes = [];
    let serverPageLabels = [];
    let serverInk = [];
    let printSizes = [];
    let printInk = [];
    let printPngs = [];

    const page = await browser.newPage({ viewport: { width: 2600, height: 1800 }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load" });
    const sheets = page.locator(".full-term-sheet");
    const count = await sheets.count();
    if (count !== 2) throw new Error(`${entry.key}: expected 2 sheets, found ${count}`);

    for (let index = 0; index < count; index += 1) {
      const label = index === 0 ? "boys" : "girls";
      await sheets.nth(index).screenshot({ path: join(OUT, `${entry.key}-screen-${label}.png`) });
    }

    const metrics = await measure(page);

    if (!entry.screenOnly) {
      const { bytes, pageCount: renderedPages } = await fullTermPdf.renderRegisterTeacherFullTermPdf({ header: HEADER_FIXTURE, document, plan });
      pageCount = renderedPages;
      await writeFile(join(OUT, `${entry.key}-server.pdf`), bytes);

      const printed = await page.pdf({ preferCSSPageSize: true, printBackground: true });
      await writeFile(join(OUT, `${entry.key}-print.pdf`), printed);

      const printDocument = await PDFDocument.load(printed);
      const serverDocument = await PDFDocument.load(bytes);
      printSizes = printDocument.getPages().map((p) => [round(p.getWidth()), round(p.getHeight())]);
      serverSizes = serverDocument.getPages().map((p) => [round(p.getWidth()), round(p.getHeight())]);

      for (let pageIndex = 1; pageIndex <= printDocument.getPageCount(); pageIndex += 1) {
        const label = pageIndex === 1 ? "boys" : "girls";
        const target = join(OUT, `${entry.key}-print-${label}.png`);
        renderPagePng(join(OUT, `${entry.key}-print.pdf`), pageIndex, target);
        printPngs.push(`${entry.key}-print-${label}.png`);
      }

      for (let pageIndex = 1; pageIndex <= serverDocument.getPageCount(); pageIndex += 1) {
        const size = serverSizes[pageIndex - 1];
        serverInk.push(inkExtents(join(OUT, `${entry.key}-server.pdf`), pageIndex, size[0], size[1]));
        printInk.push(inkExtents(join(OUT, `${entry.key}-print.pdf`), pageIndex, printSizes[pageIndex - 1][0], printSizes[pageIndex - 1][1]));
      }

      serverPageLabels = serverDocument.getPages().map((pdfPage) => {
        const contents = pdfPage.node.Contents();
        const streams = contents instanceof PDFArray
          ? contents.asArray().map((reference) => serverDocument.context.lookup(reference))
          : [contents];
        let text = "";
        for (const stream of streams) {
          if (!(stream instanceof PDFRawStream)) continue;
          const raw = Buffer.from(stream.getContents());
          let decoded;
          try { decoded = zlib.inflateSync(raw).toString("latin1"); } catch { decoded = raw.toString("latin1"); }
          for (const match of decoded.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
            const value = Buffer.from(match[1], "hex").toString("latin1");
            if (/^[\x20-\x7E]+$/.test(value)) text += value;
          }
        }
        const index = text.indexOf("BOYS/GIRLS:");
        return index === -1 ? "" : text.slice(index, index + 24);
      });
    }

    report.cases.push({
      key: entry.key,
      paper: plan.paper,
      paperLabel: fullTermLayout.fullTermSheetContext(plan.sheets[0]).paperLabel,
      paperSizePt: [round(plan.sheets[0].width), round(plan.sheets[0].height)],
      term: `${entry.termName} ${entry.termStart}..${entry.termEnd}`,
      asOf: entry.today,
      screenOnly: Boolean(entry.screenOnly),
      scheduledTeachingDayCount: document.fullTerm.scheduledTeachingDayCount,
      includedTeachingDayCount: document.fullTerm.includedTeachingDayCount,
      possibleLearnerDays: document.fullTerm.possibleLearnerDays,
      observedLearnerDays: document.fullTerm.observedLearnerDays,
      projectedLearnerDays: document.fullTerm.projectedLearnerDays,
      margin: plan.sheets[0].margin,
      inset: plan.sheets[0].inset,
      contentWidth: round(plan.sheets[0].contentWidth),
      dayWidth: round(plan.sheets[0].dayWidth),
      rowHeight: round(plan.sheets[0].rowHeight),
      serverPdfPages: pageCount,
      serverPdfSizes: serverSizes,
      serverPdfPageLabels: serverPageLabels,
      serverInkExtents: serverInk,
      printPdfPages: printSizes.length,
      printPdfSizes: printSizes,
      printInkExtents: printInk,
      printPngs,
      sheets: metrics.map((metric, index) => ({
        label: metric.label,
        sheetWidth: round(metric.sheetWidth),
        sheetHeight: round(metric.sheetHeight),
        paddingLeftPt: round(metric.paddingLeft * CSS_PX_TO_PT),
        paddingRightPt: round(metric.paddingRight * CSS_PX_TO_PT),
        tableLeftOffsetPt: round(metric.tableLeftOffset * CSS_PX_TO_PT),
        tableRightGapPt: round(metric.tableRightGap * CSS_PX_TO_PT),
        footerGapFromSummaryPt: round(metric.footerGapFromSummary * CSS_PX_TO_PT),
        footerGapFromBalancePt: round(metric.footerGapFromBalance * CSS_PX_TO_PT),
        footerDistanceFromSheetBottomPt: round(metric.footerDistanceFromSheetBottom * CSS_PX_TO_PT),
        pageSeparated: metric.label === (index === 0 ? "BOYS/GIRLS: BOYS" : "BOYS/GIRLS: GIRLS"),
        banner: metric.banner,
        summaryLabels: metric.summaryLabels,
        balance: /Present (\d+)\s*Absent (\d+)\s*Projected (\d+)\s*Observed (\d+) \/ Full-term (\d+)/.exec(metric.sheetText)?.slice(1).map(Number) ?? null,
      })),
    });

    await page.close();
  }
} finally {
  await browser.close();
}

// Cross-case invariants that the acceptance claim depends on.
const [a2] = report.cases;
const fullCases = report.cases.filter((entry) => !entry.screenOnly);
const saturdayCase = report.cases.find((entry) => entry.key === "a2-replacement-saturday");
report.invariants = {
  boysOnPageOneGirlsOnPageTwo: report.cases.every((entry) => entry.sheets[0]?.pageSeparated && entry.sheets[1]?.pageSeparated),
  pdfPageOneIsBoysPageTwoIsGirls: fullCases.every(
    (entry) => entry.serverPdfPageLabels[0].startsWith("BOYS/GIRLS: BOYS") && entry.serverPdfPageLabels[1].startsWith("BOYS/GIRLS: GIRLS"),
  ),
  horizontalInsetIsTenPoints: report.cases.every((entry) => entry.sheets.every(
    (sheet) => Math.abs(sheet.tableLeftOffsetPt - 10) < 0.5 && Math.abs(sheet.tableRightGapPt - 10) < 0.5,
  )),
  pdfInkStartsAtFortyTwoPoints: fullCases.every((entry) => entry.serverInkExtents.every(
    (extent) => Math.abs(extent.leftPt - 42) <= 1 && Math.abs(extent.rightPt - 42) <= 1,
  )),
  footerSitsDirectlyUnderBalanceStrip: report.cases.every((entry) => entry.sheets.every(
    (sheet) => sheet.footerGapFromBalancePt >= 0 && sheet.footerGapFromBalancePt <= 8,
  )),
  printMatchesServerPdf: fullCases.every(
    (entry) => entry.printPdfPages === entry.serverPdfPages && entry.printPdfSizes.every(
      (size, index) => Math.abs(size[0] - entry.serverPdfSizes[index][0]) < 1 && Math.abs(size[1] - entry.serverPdfSizes[index][1]) < 1,
    ),
  ),
  a2CarriesSixtyFiveGovernedDays: a2.scheduledTeachingDayCount === 65 && a2.includedTeachingDayCount === 65,
  observedPlusProjectedEqualsPossible: report.cases.every((entry) => entry.observedLearnerDays + entry.projectedLearnerDays === entry.possibleLearnerDays),
  summaryBasisLabelsAreExplicit: fullCases.every((entry) => entry.sheets.every(
    (sheet) => sheet.summaryLabels.includes("Total possible attendances (daily/week = observed; term = full term)"),
  )),
  replacementSaturdayIsExplained: Boolean(saturdayCase)
    && saturdayCase.scheduledTeachingDayCount === 65
    && saturdayCase.includedTeachingDayCount === 66
    && saturdayCase.sheets.every(
      (sheet) => sheet.banner.includes("66 school-included teaching days (1 school-added replacement day)")
        && !sheet.banner.includes("66 included eligible days"),
    ),
};

await writeFile(join(OUT, "measurements.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.invariants, null, 2));
