import "server-only";

import QRCode from "qrcode";
import { PDFDocument, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { drawOfficialDocumentPdfFooter } from "@/features/documents/server/official-document-pdf-footer";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import {
  OFFICIAL_DOCUMENT_PDF_HEADER_HEIGHT,
  createOfficialDocumentPdfResources,
  drawOfficialDocumentPdfHeader,
  fitOfficialDocumentPdfText,
  officialDocumentPdfSafeText,
} from "@/features/documents/server/official-document-pdf-header";
import type {
  OfficialAttendanceSummary,
  OfficialSexSplit,
  OfficialSummaryClassRow,
  OfficialSummaryGradeRow,
} from "@/features/attendance/server/official-summary";

export type OfficialAttendanceSummaryPdfInput = {
  header: OfficialDocumentHeaderModel;
  summary: OfficialAttendanceSummary;
  revision?: number;
  scolaproReference?: string;
  verificationToken?: string;
  verificationUrl?: string;
  finalizedAt?: string;
  generatedAt?: string | null;
  isDraft?: boolean;
  logoBytes?: Uint8Array | null;
};

const PAGE_WIDTH = 1190.55;
const PAGE_HEIGHT = 841.89;
const MARGIN = 32;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const INK = rgb(0.08, 0.08, 0.08);
const LINE = rgb(0.28, 0.28, 0.28);
const MUTED = rgb(0.38, 0.38, 0.38);
const TINT = rgb(0.95, 0.96, 0.98);
const TINT_STRONG = rgb(0.9, 0.93, 0.97);
const META_HEIGHT = 18;
const HEADER_ROW_HEIGHT = 20;
const ROW_HEIGHT = 14;
const FOOTER_RESERVE = 34;
const CLASS_WIDTH = 112;
const TERM_WEEKS_PER_PANEL = 8;

type SummarySourceRow = OfficialSummaryClassRow | OfficialSummaryGradeRow;
type SummaryColumn = {
  key: string;
  label: string;
  possibleAttendances: number;
  percentAbsence: number | null;
  split: (row: SummarySourceRow) => OfficialSexSplit;
};
type SummaryRow = {
  kind: "grade" | "class" | "gradeTotal" | "schoolTotal" | "possible" | "percent";
  label: string;
  source?: SummarySourceRow;
};

function emptySplit(): OfficialSexSplit {
  return { boys: 0, girls: 0, total: 0 };
}

function addSplit(target: OfficialSexSplit, value: OfficialSexSplit) {
  target.boys += value.boys;
  target.girls += value.girls;
  target.total += value.total;
  return target;
}

function formatPercent(value: number | null) {
  return value === null ? "n.a." : `${value.toFixed(1)}%`;
}

function conciseClassLabel(className: string) {
  return className.trim().replace(/^grade\s+/i, "");
}

function mondayFor(date: string) {
  const value = new Date(`${date}T12:00:00`);
  const day = value.getDay();
  value.setDate(value.getDate() + (day === 0 ? -6 : 1 - day));
  return value.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function splitForWeek(row: SummarySourceRow, weekId: string) {
  return row.weekly.find((week) => week.weekId === weekId)?.absences ?? emptySplit();
}

function splitForDate(row: SummarySourceRow, date: string) {
  return row.daily.find((day) => day.date === date)?.absences ?? emptySplit();
}

function groupedRows(summary: OfficialAttendanceSummary) {
  const grades = summary.gradeRows.map((grade) => ({
    grade,
    classes: summary.classRows.filter((row) =>
      grade.gradeId ? row.gradeId === grade.gradeId : row.gradeId === null && row.gradeName === grade.gradeName,
    ),
  }));
  const covered = new Set(grades.flatMap((group) => group.classes.map((row) => row.classId)));
  return { grades, ungrouped: summary.classRows.filter((row) => !covered.has(row.classId)) };
}

function buildRows(summary: OfficialAttendanceSummary): SummaryRow[] {
  const groups = groupedRows(summary);
  const rows: SummaryRow[] = [];
  for (const group of groups.grades) {
    rows.push({ kind: "grade", label: group.grade.gradeName });
    for (const row of group.classes) rows.push({ kind: "class", label: conciseClassLabel(row.className), source: row });
    rows.push({ kind: "gradeTotal", label: `${group.grade.gradeName} total`, source: group.grade });
  }
  for (const row of groups.ungrouped) rows.push({ kind: "class", label: conciseClassLabel(row.className), source: row });
  rows.push({ kind: "schoolTotal", label: "SCHOOL TOTAL" });
  rows.push({ kind: "possible", label: "POSSIBLE ATTENDANCES" });
  rows.push({ kind: "percent", label: "% ABSENCE" });
  return rows;
}

function weeklyColumns(summary: OfficialAttendanceSummary): SummaryColumn[] {
  const monday = mondayFor(summary.scopeEnd);
  const totals = summary.schoolTotals.daily ?? [];
  const days = Array.from({ length: 5 }, (_, offset) => {
    const date = addDays(monday, offset);
    const dayTotal = totals.find((item) => item.date === date);
    const weekday = new Intl.DateTimeFormat("en-NA", { weekday: "long" }).format(new Date(`${date}T12:00:00`));
    return {
      key: date,
      label: weekday,
      possibleAttendances: dayTotal?.possibleAttendances ?? 0,
      percentAbsence: dayTotal?.percentAbsence ?? null,
      split: (row: SummarySourceRow) => splitForDate(row, date),
    };
  });
  return [...days, {
    key: "weekly-total",
    label: "Total Absent",
    possibleAttendances: summary.schoolTotals.possibleAttendances,
    percentAbsence: summary.schoolTotals.percentAbsence,
    split: (row: SummarySourceRow) => row.daily.reduce((total, day) => addSplit(total, day.absences), emptySplit()),
  }];
}

function termPanels(summary: OfficialAttendanceSummary): SummaryColumn[][] {
  const weeks = summary.schoolTotals.weekly;
  const panels: SummaryColumn[][] = [];
  for (let index = 0; index < weeks.length; index += TERM_WEEKS_PER_PANEL) {
    const panelWeeks = weeks.slice(index, index + TERM_WEEKS_PER_PANEL);
    const columns: SummaryColumn[] = panelWeeks.map((week) => ({
      key: week.weekId,
      label: week.weekLabel,
      possibleAttendances: week.possibleAttendances,
      percentAbsence: week.percentAbsence,
      split: (row) => splitForWeek(row, week.weekId),
    }));
    columns.push({
      key: "term-total",
      label: "Term Absent",
      possibleAttendances: summary.schoolTotals.possibleAttendances,
      percentAbsence: summary.schoolTotals.percentAbsence,
      split: (row) => row.absences,
    });
    panels.push(columns);
  }
  if (!panels.length) panels.push([{
    key: "term-total",
    label: "Term Absent",
    possibleAttendances: summary.schoolTotals.possibleAttendances,
    percentAbsence: summary.schoolTotals.percentAbsence,
    split: (row) => row.absences,
  }]);
  return panels;
}

function drawCell(
  page: PDFPage,
  font: PDFFont,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options?: { align?: "left" | "center" | "right"; fill?: ReturnType<typeof rgb>; size?: number },
) {
  if (options?.fill) page.drawRectangle({ x, y: y - height, width, height, color: options.fill });
  page.drawRectangle({ x, y: y - height, width, height, borderWidth: 0.45, borderColor: LINE });
  const size = options?.size ?? 6;
  const rendered = fitOfficialDocumentPdfText(font, value, size, Math.max(6, width - 7));
  const textWidth = font.widthOfTextAtSize(rendered, size);
  const align = options?.align ?? "center";
  const tx = align === "left" ? x + 4 : align === "right" ? x + width - 4 - textWidth : x + Math.max(3, (width - textWidth) / 2);
  page.drawText(rendered, { x: tx, y: y - height + Math.max(3, (height - size) / 2), size, font, color: INK });
}

function drawSplitCell(page: PDFPage, fonts: { regular: PDFFont; bold: PDFFont }, split: OfficialSexSplit, x: number, y: number, width: number, fill?: ReturnType<typeof rgb>) {
  if (fill) page.drawRectangle({ x, y: y - ROW_HEIGHT, width, height: ROW_HEIGHT, color: fill });
  page.drawRectangle({ x, y: y - ROW_HEIGHT, width, height: ROW_HEIGHT, borderWidth: 0.45, borderColor: LINE });
  const total = String(split.total);
  const detail = `${split.boys}B / ${split.girls}G`;
  const totalSize = 7.2;
  const detailSize = 4.8;
  const gap = 5;
  const totalWidth = fonts.bold.widthOfTextAtSize(total, totalSize);
  const detailWidth = fonts.regular.widthOfTextAtSize(detail, detailSize);
  const start = x + Math.max(4, (width - totalWidth - gap - detailWidth) / 2);
  page.drawText(total, { x: start, y: y - 9.8, size: totalSize, font: fonts.bold, color: INK });
  page.drawText(detail, { x: start + totalWidth + gap, y: y - 9.1, size: detailSize, font: fonts.regular, color: MUTED });
}

function schoolSplit(summary: OfficialAttendanceSummary, column: SummaryColumn) {
  return summary.classRows.reduce((total, row) => addSplit(total, column.split(row)), emptySplit());
}

function drawTableHeader(page: PDFPage, fonts: { regular: PDFFont; bold: PDFFont }, columns: SummaryColumn[], y: number, metricWidth: number) {
  drawCell(page, fonts.bold, "REGISTER CLASS", MARGIN, y, CLASS_WIDTH, HEADER_ROW_HEIGHT, { align: "left", fill: TINT_STRONG, size: 6.1 });
  let x = MARGIN + CLASS_WIDTH;
  for (const column of columns) {
    drawCell(page, fonts.bold, column.label, x, y, metricWidth, HEADER_ROW_HEIGHT, { fill: TINT_STRONG, size: 6.1 });
    x += metricWidth;
  }
  return y - HEADER_ROW_HEIGHT;
}

function drawSummaryRow(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  summary: OfficialAttendanceSummary,
  row: SummaryRow,
  columns: SummaryColumn[],
  y: number,
  metricWidth: number,
) {
  const fill = row.kind === "grade" || row.kind === "schoolTotal" ? TINT_STRONG : row.kind === "gradeTotal" ? TINT : undefined;
  const font = row.kind === "class" ? fonts.regular : fonts.bold;
  drawCell(page, font, row.label, MARGIN, y, CLASS_WIDTH, ROW_HEIGHT, { align: "left", fill, size: 5.8 });
  let x = MARGIN + CLASS_WIDTH;
  for (const column of columns) {
    if (row.kind === "grade") drawCell(page, fonts.regular, "", x, y, metricWidth, ROW_HEIGHT, { fill });
    else if (row.kind === "possible") drawCell(page, fonts.bold, String(column.possibleAttendances), x, y, metricWidth, ROW_HEIGHT, { size: 5.8 });
    else if (row.kind === "percent") drawCell(page, fonts.bold, formatPercent(column.percentAbsence), x, y, metricWidth, ROW_HEIGHT, { size: 5.8 });
    else drawSplitCell(page, fonts, row.kind === "schoolTotal" ? schoolSplit(summary, column) : column.split(row.source!), x, y, metricWidth, fill);
    x += metricWidth;
  }
}

export async function renderOfficialAttendanceSummaryPdf(
  input: OfficialAttendanceSummaryPdfInput,
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.header.schoolName} - ${input.summary.mode === "term" ? "Term" : "Weekly"} Summary of Absentees`);
  pdf.setAuthor("ScolaPro");
  pdf.setCreator("ScolaPro official document renderer");
  pdf.setProducer("ScolaPro");
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));

  const resources = await createOfficialDocumentPdfResources(pdf, input.header, input.logoBytes);
  const summary = input.summary;
  const rows = buildRows(summary);
  const columnPanels = summary.mode === "term" ? termPanels(summary) : [weeklyColumns(summary)];
  const isDraft = input.isDraft === true;
  const statusDate = input.finalizedAt ?? input.generatedAt ?? new Date().toISOString();
  const statusDateLabel = new Intl.DateTimeFormat("en-NA", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(statusDate));
  const rowsPerPage = Math.max(1, Math.floor((PAGE_HEIGHT - MARGIN * 2 - OFFICIAL_DOCUMENT_PDF_HEADER_HEIGHT - META_HEIGHT - HEADER_ROW_HEIGHT - FOOTER_RESERVE) / ROW_HEIGHT));
  const rowChunks: SummaryRow[][] = [];
  for (let index = 0; index < rows.length; index += rowsPerPage) rowChunks.push(rows.slice(index, index + rowsPerPage));
  if (!rowChunks.length) rowChunks.push([]);

  const qrPng = !isDraft && input.verificationUrl ? await (async () => {
    try {
      const dataUrl = await QRCode.toDataURL(input.verificationUrl!, { errorCorrectionLevel: "M", margin: 1, width: 160 });
      return await pdf.embedPng(Buffer.from(dataUrl.split(",")[1], "base64"));
    } catch {
      return null;
    }
  })() : null;

  for (let panelIndex = 0; panelIndex < columnPanels.length; panelIndex += 1) {
    const columns = columnPanels[panelIndex];
    const metricWidth = (CONTENT_WIDTH - CLASS_WIDTH) / columns.length;
    for (let chunkIndex = 0; chunkIndex < rowChunks.length; chunkIndex += 1) {
      const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      const panelLabel = columnPanels.length > 1 ? ` · Panel ${panelIndex + 1}/${columnPanels.length}` : "";
      let y = drawOfficialDocumentPdfHeader(page, input.header, resources, PAGE_HEIGHT - MARGIN, {
        documentX: MARGIN,
        documentWidth: CONTENT_WIDTH,
        context: {
          title: summary.mode === "term" ? "TERM SUMMARY OF ABSENTEES" : "WEEKLY SUMMARY OF ABSENTEES",
          primaryContext: `${summary.term?.displayName ?? (summary.mode === "week" ? "Weekly register" : "Selected term")}${panelLabel}`,
          secondaryContext: `Academic year ${new Date(`${summary.scopeEnd}T12:00:00`).getFullYear()}`,
          summary: `${officialDocumentPdfSafeText(summary.scopeStart)} · ${officialDocumentPdfSafeText(summary.scopeEnd)}`,
        },
      });
      page.drawText(`Reporting period: ${summary.scopeStart} - ${summary.scopeEnd}`, { x: MARGIN, y: y - 11, size: 5.4, font: resources.regular, color: MUTED });
      const revisionText = isDraft
        ? `DRAFT · NOT FINALIZED · Generated ${statusDateLabel}`
        : `Revision ${input.revision ?? 1} · Ref ${input.scolaproReference ?? ""} · Finalized ${statusDateLabel}`;
      const fittedRevision = fitOfficialDocumentPdfText(resources.regular, revisionText, 5.4, CONTENT_WIDTH * 0.55);
      page.drawText(fittedRevision, { x: PAGE_WIDTH - MARGIN - resources.regular.widthOfTextAtSize(fittedRevision, 5.4), y: y - 11, size: 5.4, font: resources.regular, color: MUTED });
      y -= META_HEIGHT;

      if (isDraft) {
        const watermark = "DRAFT - NOT FINALIZED";
        const size = 42;
        page.drawText(watermark, {
          x: (PAGE_WIDTH - resources.bold.widthOfTextAtSize(watermark, size)) / 2,
          y: PAGE_HEIGHT / 2 - 10,
          size,
          font: resources.bold,
          color: rgb(0.55, 0.12, 0.12),
          opacity: 0.12,
          rotate: degrees(18),
        });
      }

      y = drawTableHeader(page, resources, columns, y, metricWidth);
      for (const row of rowChunks[chunkIndex]) {
        drawSummaryRow(page, resources, summary, row, columns, y, metricWidth);
        y -= ROW_HEIGHT;
      }

      if (qrPng && panelIndex === columnPanels.length - 1 && chunkIndex === rowChunks.length - 1) {
        const size = 38;
        const qrX = PAGE_WIDTH - MARGIN - size;
        const qrY = 34;
        page.drawImage(qrPng, { x: qrX, y: qrY, width: size, height: size });
        page.drawText("Verification QR", { x: qrX - 54, y: qrY + 15, size: 4.8, font: resources.regular, color: MUTED });
      }
    }
  }

  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    drawOfficialDocumentPdfFooter({
      page,
      font: resources.regular,
      pageNumber: index + 1,
      pageCount: pages.length,
      primaryLeft: `Absent learner-days: ${summary.schoolTotals.absentLearnerDays} · Possible attendances: ${summary.schoolTotals.possibleAttendances} · Overall % absence: ${formatPercent(summary.schoolTotals.percentAbsence)}`,
      secondaryLeft: isDraft ? "DRAFT · NOT FINALIZED · ScolaPro summary of absentees" : "ScolaPro official summary of absentees",
      secondaryRight: isDraft ? "Preview only" : `Rev ${input.revision ?? 1} · ${officialDocumentPdfSafeText(input.scolaproReference ?? "")}`,
      primaryLeftMaxWidth: 760,
      secondaryLeftMaxWidth: 650,
      secondaryRightMaxWidth: 300,
    });
  });

  return { bytes: await pdf.save({ useObjectStreams: false, addDefaultPage: false, objectsPerTick: 50 }), pageCount: pages.length };
}
