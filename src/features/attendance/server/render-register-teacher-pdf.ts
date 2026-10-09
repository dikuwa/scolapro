import "server-only";

import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import {
  createOfficialDocumentPdfResources,
  drawOfficialDocumentPdfHeader,
  fitOfficialDocumentPdfText,
} from "@/features/documents/server/official-document-pdf-header";
import type { RegisterTeacherDocument, RegisterTeacherSection, RegisterTeacherWeek } from "@/features/attendance/server/register-teacher-document";

const PAGE_WIDTH = 1190.55;
const PAGE_HEIGHT = 841.89;
const MARGIN = 32;
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
const LEARNERS_PER_PAGE = 40;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NA", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
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

function valuesFor(section: RegisterTeacherSection, week: RegisterTeacherWeek, kind: "attendance" | "absence" | "possible") {
  const byDate = kind === "attendance" ? section.attendanceByDate : kind === "absence" ? section.absenceByDate : section.possibleByDate;
  return week.dates.map((day) => day.teaching ? byDate[day.date] ?? 0 : null);
}

function drawPage(input: {
  page: PDFPage;
  header: OfficialDocumentHeaderModel;
  resources: Awaited<ReturnType<typeof createOfficialDocumentPdfResources>>;
  document: RegisterTeacherDocument;
  section: RegisterTeacherSection;
  weeks: RegisterTeacherWeek[];
  learners: RegisterTeacherSection["learners"];
  pageNumber: number;
  pageCount: number;
}) {
  const { page, header, resources, document, section, weeks, learners } = input;
  const title = document.mode === "week" ? "WEEKLY REGISTER" : document.mode === "range" ? "WEEK RANGE REGISTER" : "TERM REGISTER";
  let y = drawOfficialDocumentPdfHeader(page, header, resources, PAGE_HEIGHT - MARGIN, {
    documentX: MARGIN,
    documentWidth: CONTENT_WIDTH,
    context: {
      title,
      primaryContext: `${document.gradeName} · ${document.className} · ${document.academicYear}`,
      secondaryContext: document.termName,
      summary: `${formatDate(document.scopeStart)} - ${formatDate(document.scopeEnd)}`,
    },
  });

  const meta = [
    `${section.label} · Page ${input.pageNumber}/${input.pageCount}`,
    `Register teacher: ${document.registerTeacherName}`,
    `Total school days: ${document.teachingDayCount}`,
  ];
  const metaWidth = CONTENT_WIDTH / meta.length;
  meta.forEach((value, index) => drawCell(page, resources.bold, value, MARGIN + index * metaWidth, y, metaWidth, 18, { align: "left", fill: RED_SOFT, color: RED, size: 5.8 }));
  y -= 22;

  const identityWidths = [50, 24, 112, 112, 52];
  const attendanceColumns = weeks.reduce((count, week) => count + week.dates.length + 1, 0);
  const termWidths = [42, 42, 42];
  const identityTotal = identityWidths.reduce((sum, width) => sum + width, 0);
  const termTotal = termWidths.reduce((sum, width) => sum + width, 0);
  const dayWidth = (CONTENT_WIDTH - identityTotal - termTotal) / Math.max(1, attendanceColumns);
  const widths = [...identityWidths, ...Array.from({ length: attendanceColumns }, () => dayWidth), ...termWidths];
  const labels = ["ADMIN NO.", "NO.", "SURNAME", "GIVEN NAMES", "DATE OF BIRTH"];
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
  ["ATTEND.", "ABSENT", "DAYS"].forEach((label, index) => { drawCell(page, resources.bold, label, x, y, termWidths[index], 22, { fill: index === 0 ? PURPLE_SOFT : index === 1 ? RED_SOFT : GREEN_SOFT, color: index === 1 ? RED : INK, size: 5 }); x += termWidths[index]; });
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

  const summaryRows: Array<{ label: string; kind: "attendance" | "absence" | "possible"; fill: ReturnType<typeof rgb>; color: ReturnType<typeof rgb> }> = [
    { label: "Total number of attendances", kind: "attendance", fill: PURPLE_SOFT, color: INK },
    { label: "Total number of absentees", kind: "absence", fill: RED_SOFT, color: RED },
    { label: "Total number of possible attendances", kind: "possible", fill: GREEN_SOFT, color: INK },
  ];
  for (const row of summaryRows) {
    x = MARGIN;
    drawCell(page, resources.bold, row.label, x, y, identityTotal, ROW_HEIGHT, { align: "left", fill: row.fill, color: row.color, size: 5.4 });
    x += identityTotal;
    for (const week of weeks) {
      const values = valuesFor(section, week, row.kind);
      values.forEach((value, index) => { drawCell(page, resources.bold, value === null ? "" : String(value), x, y, dayWidth, ROW_HEIGHT, { fill: week.dates[index].teaching ? row.fill : GREY, color: row.color, size: 5.2 }); x += dayWidth; });
      drawCell(page, resources.bold, String(values.reduce<number>((sum, value) => sum + (value ?? 0), 0)), x, y, dayWidth, ROW_HEIGHT, { fill: row.fill, color: row.color, size: 5.2 });
      x += dayWidth;
    }
    const termValues = row.kind === "attendance" ? [section.termAttendanceTotal, 0, 0] : row.kind === "absence" ? [0, section.termAbsenceTotal, 0] : [0, 0, section.termPossibleTotal];
    termValues.forEach((value, termIndex) => { drawCell(page, resources.bold, value ? String(value) : "", x, y, termWidths[termIndex], ROW_HEIGHT, { fill: termIndex === 0 ? PURPLE_SOFT : termIndex === 1 ? RED_SOFT : GREEN_SOFT, color: termIndex === 1 ? RED : INK, size: 5.2 }); x += termWidths[termIndex]; });
    y -= ROW_HEIGHT;
  }

  const balance = `${section.termAttendanceTotal + section.termAbsenceTotal} / ${section.termPossibleTotal}`;
  page.drawText(`Balance: ${balance}`, { x: PAGE_WIDTH - MARGIN - resources.bold.widthOfTextAtSize(`Balance: ${balance}`, 6), y: Math.max(20, y - 10), size: 6, font: resources.bold, color: RED });
}

export async function renderRegisterTeacherPdf(input: { header: OfficialDocumentHeaderModel; document: RegisterTeacherDocument; logoBytes?: Uint8Array | null }) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.header.schoolName} - ${input.document.className} register`);
  pdf.setAuthor("ScolaPro");
  pdf.setCreator("ScolaPro register renderer");
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));
  const resources = await createOfficialDocumentPdfResources(pdf, input.header, input.logoBytes);

  for (const section of input.document.sections) {
    const weekPanels = input.document.weeks.length > 3
      ? Array.from({ length: Math.ceil(input.document.weeks.length / 3) }, (_, index) => input.document.weeks.slice(index * 3, (index + 1) * 3))
      : [input.document.weeks];
    const learnerChunks = section.learners.length
      ? Array.from({ length: Math.ceil(section.learners.length / LEARNERS_PER_PAGE) }, (_, index) => section.learners.slice(index * LEARNERS_PER_PAGE, (index + 1) * LEARNERS_PER_PAGE))
      : [[]];
    const jobs = weekPanels.flatMap((weeks) => learnerChunks.map((learners) => ({ weeks, learners })));
    jobs.forEach((job, index) => drawPage({
      page: pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
      header: input.header,
      resources,
      document: input.document,
      section,
      weeks: job.weeks,
      learners: job.learners,
      pageNumber: index + 1,
      pageCount: jobs.length,
    }));
  }

  const bytes = await pdf.save({ useObjectStreams: false, addDefaultPage: false, objectsPerTick: 50 });
  return { bytes, pageCount: pdf.getPageCount() };
}
