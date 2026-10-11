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

  const meta = [
    `${section.label} · Page ${input.pageNumber}/${input.pageCount}`,
    `Register teacher: ${document.registerTeacherName}`,
    `Total school days: ${document.teachingDayCount}`,
  ];
  const metaWidth = CONTENT_WIDTH / meta.length;
  meta.forEach((value, index) => drawCell(page, resources.bold, value, MARGIN + index * metaWidth, y, metaWidth, 18, { align: "left", fill: RED_SOFT, color: RED, size: 5.8 }));
  y -= 22;

  page.drawText("I = Present   a = Absent   a", { x: MARGIN, y: y - 5, size: 5.4, font: resources.regular, color: MUTED });
  page.drawText("✓", { x: MARGIN + 76, y: y - 3, size: 4.2, font: checkFont, color: RED });
  page.drawText(" = Absent with reason   Grey = non-teaching / inactive", { x: MARGIN + 82, y: y - 5, size: 5.4, font: resources.regular, color: MUTED });
  y -= 11;

  // Column geometry comes from the shared layout contract so the drawn PDF grid
  // matches the HTML/print preview exactly.
  const plan = registerTeacherColumnPlan(weeks);
  const identityWidths = plan.identityWidths;
  const attendanceColumns = plan.attendanceColumns;
  const termWidths = plan.termWidths;
  const identityTotal = identityWidths.reduce((sum, width) => sum + width, 0);
  const dayWidth = plan.dayWidth;
  const widths = [...identityWidths, ...Array.from({ length: attendanceColumns }, () => dayWidth), ...termWidths];
  const labels = REGISTER_TEACHER_LAYOUT.identityColumns.map((column) => column.header);
  let x = MARGIN;
  labels.forEach((label, index) => { drawCell(page, resources.bold, label, x, y, widths[index], 22, { fill: RED_SOFT, color: RED, size: 5 }); x += widths[index]; });
  for (const week of weeks) {
    for (const day of week.dates) {
      const dayLabel = day.teaching
        ? `${day.weekday} ${day.dayNumber}`
        : day.reason ?? `Non-teaching · ${day.weekday} ${day.dayNumber}`;
      drawCell(page, resources.bold, dayLabel, x, y, dayWidth, 22, { fill: day.teaching ? RED_SOFT : GREY, color: day.teaching ? RED : MUTED, size: day.teaching ? 5 : 4 });
      x += dayWidth;
    }
    drawCell(page, resources.bold, "WEEK", x, y, dayWidth, 22, { fill: RED_SOFT, color: RED, size: 4.8 });
    x += dayWidth;
  }
  REGISTER_TEACHER_LAYOUT.termColumns.map((column) => column.header).forEach((label, index) => { drawCell(page, resources.bold, label, x, y, termWidths[index], 22, { fill: index === 0 ? PURPLE_SOFT : index === 1 ? RED_SOFT : GREEN_SOFT, color: index === 1 ? RED : INK, size: 5 }); x += termWidths[index]; });
  y -= 22;

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
          page.drawText("✓", { x: x + dayWidth - 5, y: y - 5, size: 3.8, font: checkFont, color: RED });
        }
        x += dayWidth;
      }
      drawCell(page, resources.bold, `${weekPresent}/${weekPresent + weekAbsent}`, x, y, dayWidth, ROW_HEIGHT, { fill: RED_SOFT, size: 5.2 });
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
  const balanceLabel = `Attendance ${balance.attendance}   Absence ${balance.absence}   Possible ${balance.possible}   Balance: ${balance.accounted} / ${balance.possible} ${balance.balanced ? "OK" : "!"}`;
  page.drawText(balanceLabel, { x: PAGE_WIDTH - MARGIN - resources.bold.widthOfTextAtSize(balanceLabel, 6), y: Math.max(20, y - 10), size: 6, font: resources.bold, color: RED });
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
