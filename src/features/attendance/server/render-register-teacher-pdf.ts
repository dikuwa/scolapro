import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import {
  createOfficialDocumentPdfResources,
  drawOfficialDocumentPdfHeader,
  fitOfficialDocumentPdfText,
} from "@/features/documents/server/official-document-pdf-header";
import type { RegisterTeacherDocument, RegisterTeacherSection, RegisterTeacherWeek } from "@/features/attendance/server/register-teacher-document";
import {
  REGISTER_TEACHER_LAYOUT,
  formatRegisterTeacherDate,
  registerTeacherBalance,
  registerTeacherColumnPlan,
  registerTeacherDocumentContext,
  registerTeacherGovernanceAlert,
  registerTeacherPageJobs,
  registerTeacherTermValue,
  registerTeacherValuesFor,
  type RegisterTeacherSummaryKind,
} from "@/features/attendance/server/register-teacher-layout";

const PAGE_WIDTH = REGISTER_TEACHER_LAYOUT.pageWidth;
const PAGE_HEIGHT = REGISTER_TEACHER_LAYOUT.pageHeight;
const MARGIN = REGISTER_TEACHER_LAYOUT.margin;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LINE = rgb(0.25, 0.25, 0.25);
const INK = rgb(0.08, 0.08, 0.08);
const MUTED = rgb(0.38, 0.38, 0.38);
const RED = rgb(0.64, 0.07, 0.09);
const RED_SOFT = rgb(1, 0.95, 0.95);
const GREY = rgb(0.92, 0.92, 0.92);
const PURPLE_SOFT = rgb(0.95, 0.93, 0.98);
const GREEN_SOFT = rgb(0.93, 0.96, 0.84);
const ROW_HEIGHT = 13;

function formatDate(value: string) {
  return formatRegisterTeacherDate(value);
}

function drawCell(page: PDFPage, font: PDFFont, value: string, x: number, top: number, width: number, height: number, options?: { fill?: ReturnType<typeof rgb>; color?: ReturnType<typeof rgb>; align?: "left" | "center"; size?: number; borderWidth?: number }) {
  if (options?.fill) page.drawRectangle({ x, y: top - height, width, height, color: options.fill });
  page.drawRectangle({ x, y: top - height, width, height, borderColor: LINE, borderWidth: options?.borderWidth ?? 0.42 });
  if (!value) return;
  const size = options?.size ?? 5.4;
  const rendered = fitOfficialDocumentPdfText(font, value, size, Math.max(4, width - 6));
  const tx = options?.align === "left" ? x + 3 : x + Math.max(2, (width - font.widthOfTextAtSize(rendered, size)) / 2);
  page.drawText(rendered, { x: tx, y: top - height + Math.max(2.5, (height - size) / 2), size, font, color: options?.color ?? INK });
}

function drawPage(input: {
  page: PDFPage;
  header: OfficialDocumentHeaderModel;
  resources: Awaited<ReturnType<typeof createOfficialDocumentPdfResources>>;
  checkFont: PDFFont;
  document: RegisterTeacherDocument;
  section: RegisterTeacherSection;
  weeks: RegisterTeacherWeek[];
  learners: RegisterTeacherSection["learners"];
  pageNumber: number;
  pageCount: number;
}) {
  const { page, header, resources, checkFont, document, section, weeks, learners } = input;
  const context = registerTeacherDocumentContext(document);
  let y = drawOfficialDocumentPdfHeader(page, header, resources, PAGE_HEIGHT - MARGIN, {
    documentX: MARGIN,
    documentWidth: CONTENT_WIDTH,
    context,
  });

  // Match the preview's visual order: official header, legend, five-cell
  // metadata band, then the register grid.
  const legendSize = 5.6;
  const legendY = y - 7;
  let legendX = MARGIN + 2;
  const legendPart = (label: string, font: PDFFont = resources.regular, color = MUTED) => {
    page.drawText(label, { x: legendX, y: legendY, size: legendSize, font, color });
    legendX += font.widthOfTextAtSize(label, legendSize);
  };
  legendPart("I", resources.bold, INK);
  legendPart(" = Present     ");
  legendPart("a", resources.regular, RED);
  legendPart(" = Absent     ");
  legendPart("a", resources.regular, RED);
  // Keep the red reason marker immediately above and to the right of its "a".
  page.drawText("✓", { x: legendX - 0.3, y: legendY + 3.2, size: 4.5, font: checkFont, color: RED });
  legendX += 5;
  legendPart(" = Absent with reason     Grey = non-teaching / inactive; governed closure names appear in the register");
  y -= 21;

  const meta = [
    ["BOYS/GIRLS:", section.label],
    ["TERM:", `${document.termName}${input.pageCount > 1 ? ` · Page ${input.pageNumber}/${input.pageCount}` : ""}`],
    ["TOTAL SCHOOL DAYS:", String(document.teachingDayCount)],
    ["REGISTER CLASS:", document.className],
    ["REGISTER TEACHER:", document.registerTeacherName],
  ] as const;
  const metaWidth = CONTENT_WIDTH / meta.length;
  meta.forEach(([label, value], index) => {
    const x = MARGIN + index * metaWidth;
    drawCell(page, resources.regular, "", x, y, metaWidth, 17, { fill: RED_SOFT, borderWidth: 0.8 });
    const labelSize = 5.6;
    page.drawText(label, { x: x + 4, y: y - 11, size: labelSize, font: resources.bold, color: RED });
    page.drawText(fitOfficialDocumentPdfText(resources.regular, ` ${value}`, 5.6, metaWidth - resources.bold.widthOfTextAtSize(label, labelSize) - 11), {
      x: x + 4 + resources.bold.widthOfTextAtSize(label, labelSize),
      y: y - 11,
      size: 5.6,
      font: resources.regular,
      color: INK,
    });
  });
  y -= 20;

  // Column geometry comes from the shared layout contract so the drawn PDF grid
  // matches the HTML/print preview exactly.
  const plan = registerTeacherColumnPlan(weeks);
  const identityWidths = plan.identityWidths;
  const termWidths = plan.termWidths;
  const identityTotal = identityWidths.reduce((sum, width) => sum + width, 0);
  const dayWidth = plan.dayWidth;
  // Two-tier page heading mirrors the HTML table: identity cells span both
  // bands, each weekly group has a week-ending heading above daily dates,
  // and the right-hand total-per-term group spans its three metric columns.
  const headerTop = 15;
  const headerBottom = 15;
  let x = MARGIN;
  const identityLabels = ["ADMIN NO.", "NO.", "SURNAME", "GIVEN NAMES", "DATE OF BIRTH"];
  identityLabels.forEach((label, index) => {
    drawCell(page, resources.bold, label, x, y, identityWidths[index], headerTop + headerBottom, {
      fill: RED_SOFT, color: RED, size: 5,
      align: index === 2 || index === 3 ? "left" : "center",
    });
    x += identityWidths[index];
  });
  for (const week of weeks) {
    const groupWidth = (week.dates.length + 1) * dayWidth;
    drawCell(page, resources.bold, `Week Ending Friday  ${formatDate(week.weekEnding)}`,
      x, y, groupWidth, headerTop, { fill: RED_SOFT, color: RED, size: 6 });
    for (const day of week.dates) {
      const dayLabel = day.teaching
        ? `${day.weekday}  ${day.dayNumber}`
        : day.reason ?? `Non-teaching ${day.weekday} ${day.dayNumber}`;
      drawCell(page, resources.bold, dayLabel, x, y - headerTop, dayWidth, headerBottom, {
        fill: day.teaching ? RED_SOFT : GREY,
        color: day.teaching ? RED : MUTED,
        size: day.teaching ? 5.2 : 4,
      });
      x += dayWidth;
    }
    drawCell(page, resources.bold, "Tot.", x, y - headerTop, dayWidth, headerBottom,
      { fill: RED_SOFT, color: RED, size: 5 });
    x += dayWidth;
  }
  const termGroupWidth = termWidths.reduce((sum, width) => sum + width, 0);
  drawCell(page, resources.bold, "TOTAL PER TERM", x, y, termGroupWidth, headerTop,
    { fill: RED_SOFT, color: RED, size: 5.5 });
  ["Attend.", "Absent", "Days"].forEach((label, index) => {
    const fill = index === 0 ? PURPLE_SOFT : index === 1 ? RED_SOFT : GREEN_SOFT;
    drawCell(page, resources.bold, label, x, y - headerTop, termWidths[index], headerBottom,
      { fill, color: index === 1 ? RED : INK, size: 5.2 });
    x += termWidths[index];
  });
  y -= headerTop + headerBottom;

  learners.forEach((learner, index) => {
    x = MARGIN;
    const identity = [learner.admissionNumber ?? "", String(index + 1), learner.surname, learner.givenNames, learner.dateOfBirth ? formatDate(learner.dateOfBirth) : ""];
    identity.forEach((value, cellIndex) => { drawCell(page, resources.regular, value, x, y, identityWidths[cellIndex], ROW_HEIGHT, { align: cellIndex === 2 || cellIndex === 3 ? "left" : "center", size: 5.3 }); x += identityWidths[cellIndex]; });
    for (const week of weeks) {
      let weekPresent = 0;
      let weekAbsent = 0;
      for (const day of week.dates) {
        const mark = learner.marks[day.date] ?? "";
        if (mark === "I") weekPresent += 1;
        if (mark === "a") weekAbsent += 1;
        drawCell(page, resources.bold, mark, x, y, dayWidth, ROW_HEIGHT, { fill: day.teaching ? undefined : GREY, color: mark === "a" ? RED : INK, size: 7 });
        if (mark === "a" && learner.reasonedAbsenceDates[day.date]) {
          page.drawText("✓", { x: x + dayWidth / 2 + 2.3, y: y - ROW_HEIGHT + 8.5, size: 3.8, font: checkFont, color: RED });
        }
        x += dayWidth;
      }
      drawCell(page, resources.bold, String(weekPresent), x, y, dayWidth, ROW_HEIGHT, { fill: RED_SOFT, size: 5.2 });
      x += dayWidth;
    }
    [String(learner.termAttended), String(learner.termAbsent), String(learner.termDays)].forEach((value, termIndex) => { drawCell(page, resources.bold, value, x, y, termWidths[termIndex], ROW_HEIGHT, { fill: termIndex === 0 ? PURPLE_SOFT : termIndex === 1 ? RED_SOFT : GREEN_SOFT, color: termIndex === 1 ? RED : INK, size: 5.5 }); x += termWidths[termIndex]; });
    y -= ROW_HEIGHT;
  });

  if (!learners.length) {
    drawCell(page, resources.regular, `No ${section.label.toLowerCase()} in this register section.`, MARGIN, y, CONTENT_WIDTH, 28, { size: 6.2 });
    y -= 28;
  }

  const summaryRows: Array<{ label: string; kind: RegisterTeacherSummaryKind; fill: ReturnType<typeof rgb>; color: ReturnType<typeof rgb> }> = [
    { label: "Total number of attendances", kind: "attendance", fill: PURPLE_SOFT, color: INK },
    { label: "Total number of absentees", kind: "absence", fill: RED_SOFT, color: RED },
    { label: "Total number of possible attendances", kind: "possible", fill: GREEN_SOFT, color: INK },
  ];
  for (const row of summaryRows) {
    x = MARGIN;
    drawCell(page, resources.bold, row.label, x, y, identityTotal, ROW_HEIGHT, { align: "left", fill: row.fill, color: row.color, size: 5.4 });
    x += identityTotal;
    for (const week of weeks) {
      const values = registerTeacherValuesFor(section, week, row.kind);
      values.forEach((value, index) => { drawCell(page, resources.bold, value === null ? "" : String(value), x, y, dayWidth, ROW_HEIGHT, { fill: week.dates[index].teaching ? row.fill : GREY, color: row.color, size: 5.2 }); x += dayWidth; });
      drawCell(page, resources.bold, String(values.reduce<number>((sum, value) => sum + (value ?? 0), 0)), x, y, dayWidth, ROW_HEIGHT, { fill: row.fill, color: row.color, size: 5.2 });
      x += dayWidth;
    }
    const termValue = registerTeacherTermValue(section, row.kind);
    const termValues = row.kind === "attendance" ? [termValue, 0, 0] : row.kind === "absence" ? [0, termValue, 0] : [0, 0, termValue];
    termValues.forEach((value, termIndex) => { drawCell(page, resources.bold, value ? String(value) : "", x, y, termWidths[termIndex], ROW_HEIGHT, { fill: termIndex === 0 ? PURPLE_SOFT : termIndex === 1 ? RED_SOFT : GREEN_SOFT, color: termIndex === 1 ? RED : INK, size: 5.2 }); x += termWidths[termIndex]; });
    y -= ROW_HEIGHT;
  }

  const balance = registerTeacherBalance(section);
  const balanceLabel = `Attendance ${balance.attendance}    Absence ${balance.absence}    Possible ${balance.possible}    Balance: ${balance.accounted} / ${balance.possible}`;
  const balanceSize = 6;
  const balanceX = PAGE_WIDTH - MARGIN - resources.bold.widthOfTextAtSize(balanceLabel, balanceSize) - 9;
  const balanceY = Math.max(20, y - 10);
  page.drawText(balanceLabel, { x: balanceX, y: balanceY, size: balanceSize, font: resources.bold, color: RED });
  page.drawText(balance.balanced ? "✓" : "!", { x: PAGE_WIDTH - MARGIN - 6, y: balanceY + 1, size: 6, font: balance.balanced ? checkFont : resources.bold, color: RED });
  const governanceAlert = registerTeacherGovernanceAlert(document);
  if (governanceAlert) {
    page.drawText(fitOfficialDocumentPdfText(resources.bold, `Governance flag: ${governanceAlert}`, 5.2, CONTENT_WIDTH), {
      x: MARGIN,
      y: Math.max(20, y - 10),
      size: 5.2,
      font: resources.bold,
      color: RED,
    });
  }
}

export async function renderRegisterTeacherPdf(input: { header: OfficialDocumentHeaderModel; document: RegisterTeacherDocument; logoBytes?: Uint8Array | null }) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.header.schoolName} - ${input.document.className} register`);
  pdf.setAuthor("ScolaPro");
  pdf.setCreator("ScolaPro register renderer");
  pdf.setSubject("Issue 1234 revised register PDF layout");
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));
  const resources = await createOfficialDocumentPdfResources(pdf, input.header, input.logoBytes);
  const checkFont = await pdf.embedFont(StandardFonts.ZapfDingbats);

  for (const job of registerTeacherPageJobs(input.document)) {
    drawPage({
      page: pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
      header: input.header,
      resources,
      checkFont,
      document: input.document,
      section: job.section,
      weeks: job.weeks,
      learners: job.learners,
      pageNumber: job.pageNumber,
      pageCount: job.pageCount,
    });
  }

  const bytes = await pdf.save({ useObjectStreams: false, addDefaultPage: false, objectsPerTick: 50 });
  return { bytes, pageCount: pdf.getPageCount() };
}
