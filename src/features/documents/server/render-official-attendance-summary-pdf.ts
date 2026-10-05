import "server-only";

import QRCode from "qrcode";
import { PDFDocument, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { OFFICIAL_DOCUMENT_PDF_GEOMETRY } from "@/features/documents/server/official-document-chrome";
import { drawOfficialDocumentPdfFooter } from "@/features/documents/server/official-document-pdf-footer";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import {
  INTERNAL_SCHOOL_DOCUMENT_PDF_HEADER_HEIGHT,
  createOfficialDocumentPdfResources,
  drawOfficialDocumentPdfHeader,
  fitOfficialDocumentPdfText,
  officialDocumentPdfSafeText,
} from "@/features/documents/server/official-document-pdf-header";
import type {
  OfficialAttendanceSummary,
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

const PAGE_WIDTH = OFFICIAL_DOCUMENT_PDF_GEOMETRY.pageHeight;
const PAGE_HEIGHT = OFFICIAL_DOCUMENT_PDF_GEOMETRY.pageWidth;
const MARGIN = 28;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const INK = rgb(0.08, 0.08, 0.08);
const LINE = rgb(0.28, 0.28, 0.28);
const MUTED = rgb(0.38, 0.38, 0.38);
const TINT = rgb(0.95, 0.96, 0.98);
const TINT_STRONG = rgb(0.9, 0.93, 0.97);
const META_HEIGHT = 15;
const HEADER_ROW_HEIGHT = 13;
const ROW_HEIGHT = 11.8;
const FOOTER_RESERVE = 30;
const CLASS_WIDTH = 88;

function formatPercent(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function conciseClassLabel(className: string) {
  return className.trim().replace(/^grade\s+/i, "");
}

function weekEnding(summary: OfficialAttendanceSummary, weekId: string) {
  return summary.weeks.find((week) => week.weekId === weekId)?.weekEndingReportedOn ?? null;
}

function shortDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-NA", { day: "2-digit", month: "2-digit" }).format(new Date(`${value}T12:00:00`));
}

function splitForWeek(row: OfficialSummaryClassRow | OfficialSummaryGradeRow, weekId: string) {
  return row.weekly.find((week) => week.weekId === weekId)?.absences ?? { boys: 0, girls: 0, total: 0 };
}

function schoolSplit(summary: OfficialAttendanceSummary, weekId: string) {
  return summary.classRows.reduce(
    (total, row) => {
      const split = splitForWeek(row, weekId);
      total.boys += split.boys;
      total.girls += split.girls;
      total.total += split.total;
      return total;
    },
    { boys: 0, girls: 0, total: 0 },
  );
}

function groupedRows(summary: OfficialAttendanceSummary) {
  const grades = summary.gradeRows.map((grade) => ({
    grade,
    classes: summary.classRows.filter((row) =>
      grade.gradeId ? row.gradeId === grade.gradeId : row.gradeId === null && row.gradeName === grade.gradeName,
    ),
  }));
  const covered = new Set(grades.flatMap((group) => group.classes.map((row) => row.classId)));
  return {
    grades,
    ungrouped: summary.classRows.filter((row) => !covered.has(row.classId)),
  };
}

function drawCell(
  page: PDFPage,
  font: PDFFont,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options?: { bold?: boolean; align?: "left" | "center" | "right"; fill?: ReturnType<typeof rgb>; size?: number },
) {
  if (options?.fill) page.drawRectangle({ x, y: y - height, width, height, color: options.fill });
  page.drawRectangle({ x, y: y - height, width, height, borderWidth: 0.4, borderColor: LINE });
  const size = options?.size ?? 5.2;
  const rendered = fitOfficialDocumentPdfText(font, value, size, Math.max(6, width - 5));
  const textWidth = font.widthOfTextAtSize(rendered, size);
  const align = options?.align ?? "center";
  const tx = align === "left" ? x + 3 : align === "right" ? x + width - 3 - textWidth : x + Math.max(2, (width - textWidth) / 2);
  page.drawText(rendered, { x: tx, y: y - height + Math.max(2.2, (height - size) / 2), size, font, color: INK });
}

function drawRegisterHeader(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  summary: OfficialAttendanceSummary,
  y: number,
  weekWidth: number,
) {
  const weeks = summary.schoolTotals.weekly;
  drawCell(page, fonts.bold, "WEEK", MARGIN, y, CLASS_WIDTH, HEADER_ROW_HEIGHT, { align: "left", fill: TINT_STRONG, size: 5.3 });
  let x = MARGIN + CLASS_WIDTH;
  for (const week of weeks) {
    drawCell(page, fonts.bold, week.weekLabel.replace(/^Week\s*/i, ""), x, y, weekWidth, HEADER_ROW_HEIGHT, { fill: TINT_STRONG, size: 5.3 });
    x += weekWidth;
  }
  y -= HEADER_ROW_HEIGHT;

  drawCell(page, fonts.bold, "DATE OF WEEK ENDING", MARGIN, y, CLASS_WIDTH, HEADER_ROW_HEIGHT, { align: "left", fill: TINT_STRONG, size: 4.8 });
  x = MARGIN + CLASS_WIDTH;
  for (const week of weeks) {
    drawCell(page, fonts.bold, shortDate(weekEnding(summary, week.weekId)), x, y, weekWidth, HEADER_ROW_HEIGHT, { fill: TINT_STRONG, size: 4.8 });
    x += weekWidth;
  }
  y -= HEADER_ROW_HEIGHT;

  drawCell(page, fonts.bold, "GRADE / CLASS", MARGIN, y, CLASS_WIDTH, HEADER_ROW_HEIGHT, { align: "left", fill: TINT_STRONG, size: 5 });
  x = MARGIN + CLASS_WIDTH;
  const subWidth = weekWidth / 3;
  for (let weekIndex = 0; weekIndex < weeks.length; weekIndex += 1) {
    drawCell(page, fonts.bold, "B", x, y, subWidth, HEADER_ROW_HEIGHT, { fill: TINT_STRONG, size: 4.6 });
    drawCell(page, fonts.bold, "G", x + subWidth, y, subWidth, HEADER_ROW_HEIGHT, { fill: TINT_STRONG, size: 4.6 });
    drawCell(page, fonts.bold, "TOTAL", x + subWidth * 2, y, subWidth, HEADER_ROW_HEIGHT, { fill: TINT_STRONG, size: 4.4 });
    x += weekWidth;
  }
  return y - HEADER_ROW_HEIGHT;
}

type RegisterRow = {
  kind: "grade" | "class" | "gradeTotal" | "schoolTotal" | "possible" | "percent";
  label: string;
  source?: OfficialSummaryClassRow | OfficialSummaryGradeRow;
};

function buildRows(summary: OfficialAttendanceSummary): RegisterRow[] {
  const groups = groupedRows(summary);
  const rows: RegisterRow[] = [];
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

function drawRegisterRow(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  summary: OfficialAttendanceSummary,
  row: RegisterRow,
  y: number,
  weekWidth: number,
) {
  const weeks = summary.schoolTotals.weekly;
  const fill = row.kind === "grade" || row.kind === "schoolTotal" ? TINT_STRONG : row.kind === "gradeTotal" ? TINT : undefined;
  const font = row.kind === "class" ? fonts.regular : fonts.bold;
  drawCell(page, font, row.label, MARGIN, y, CLASS_WIDTH, ROW_HEIGHT, { align: "left", fill, size: row.kind === "grade" ? 5.1 : 4.9 });

  let x = MARGIN + CLASS_WIDTH;
  const subWidth = weekWidth / 3;
  for (const week of weeks) {
    if (row.kind === "grade") {
      drawCell(page, fonts.regular, "", x, y, weekWidth, ROW_HEIGHT, { fill });
    } else if (row.kind === "possible") {
      drawCell(page, fonts.regular, "", x, y, subWidth * 2, ROW_HEIGHT);
      drawCell(page, fonts.bold, String(week.possibleAttendances), x + subWidth * 2, y, subWidth, ROW_HEIGHT, { size: 4.8 });
    } else if (row.kind === "percent") {
      drawCell(page, fonts.regular, "", x, y, subWidth * 2, ROW_HEIGHT);
      drawCell(page, fonts.bold, formatPercent(week.percentAbsence), x + subWidth * 2, y, subWidth, ROW_HEIGHT, { size: 4.7 });
    } else {
      const split = row.kind === "schoolTotal"
        ? schoolSplit(summary, week.weekId)
        : splitForWeek(row.source!, week.weekId);
      drawCell(page, font, String(split.boys), x, y, subWidth, ROW_HEIGHT, { fill, size: 4.8 });
      drawCell(page, font, String(split.girls), x + subWidth, y, subWidth, ROW_HEIGHT, { fill, size: 4.8 });
      drawCell(page, fonts.bold, String(split.total), x + subWidth * 2, y, subWidth, ROW_HEIGHT, { fill, size: 4.8 });
    }
    x += weekWidth;
  }
}

export async function renderOfficialAttendanceSummaryPdf(
  input: OfficialAttendanceSummaryPdfInput,
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.header.schoolName} - Summary of Absentees`);
  pdf.setAuthor("ScolaPro");
  pdf.setCreator("ScolaPro official document renderer");
  pdf.setProducer("ScolaPro");
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));

  const resources = await createOfficialDocumentPdfResources(pdf, input.header, input.logoBytes);
  const { regular } = resources;
  const summary = input.summary;
  const weeks = summary.schoolTotals.weekly;
  const weekWidth = weeks.length ? (CONTENT_WIDTH - CLASS_WIDTH) / weeks.length : CONTENT_WIDTH - CLASS_WIDTH;
  const isDraft = input.isDraft === true;
  const statusDate = input.finalizedAt ?? input.generatedAt ?? new Date().toISOString();
  const statusDateLabel = new Intl.DateTimeFormat("en-NA", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(statusDate));
  const titleText = summary.mode === "term"
    ? `Term-to-date${summary.term ? ` - ${summary.term.displayName}` : ""}`
    : `Current week${weeks[0] ? ` - ${weeks[0].weekLabel}` : ""}`;
  const rows = buildRows(summary);

  const availableRowsHeight =
    PAGE_HEIGHT - MARGIN * 2 - INTERNAL_SCHOOL_DOCUMENT_PDF_HEADER_HEIGHT - META_HEIGHT - HEADER_ROW_HEIGHT * 3 - FOOTER_RESERVE;
  const rowsPerPage = Math.max(1, Math.floor(availableRowsHeight / ROW_HEIGHT));
  const chunks: RegisterRow[][] = [];
  for (let index = 0; index < rows.length; index += rowsPerPage) chunks.push(rows.slice(index, index + rowsPerPage));
  if (!chunks.length) chunks.push([]);

  const qrPng = !isDraft && input.verificationUrl ? await (async () => {
    try {
      const dataUrl = await QRCode.toDataURL(input.verificationUrl, { errorCorrectionLevel: "M", margin: 1, width: 160 });
      return await pdf.embedPng(Buffer.from(dataUrl.split(",")[1], "base64"));
    } catch {
      return null;
    }
  })() : null;

  for (let pageIndex = 0; pageIndex < chunks.length; pageIndex += 1) {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = drawOfficialDocumentPdfHeader(page, input.header, resources, PAGE_HEIGHT - MARGIN, {
      documentX: MARGIN,
      documentWidth: CONTENT_WIDTH,
      context: {
        title: "SUMMARY OF ABSENTEES",
        primaryContext: officialDocumentPdfSafeText(titleText),
        secondaryContext: `Academic year ${new Date(`${summary.scopeEnd}T12:00:00`).getFullYear()}`,
        summary: `${officialDocumentPdfSafeText(summary.scopeStart)} · ${officialDocumentPdfSafeText(summary.scopeEnd)}`,
      },
    });

    page.drawText(
      `Reporting period: ${officialDocumentPdfSafeText(summary.scopeStart)} - ${officialDocumentPdfSafeText(summary.scopeEnd)}`,
      { x: MARGIN, y: y - 10, size: 5.2, font: regular, color: MUTED },
    );
    const rev = isDraft
      ? `DRAFT · NOT FINALIZED · Generated ${officialDocumentPdfSafeText(statusDateLabel)}`
      : `Revision ${input.revision ?? 1} · Ref ${officialDocumentPdfSafeText(input.scolaproReference ?? "")} · Finalized ${officialDocumentPdfSafeText(statusDateLabel)}`;
    const revText = fitOfficialDocumentPdfText(regular, rev, 5.2, CONTENT_WIDTH * 0.58);
    page.drawText(revText, {
      x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(revText, 5.2),
      y: y - 10,
      size: 5.2,
      font: regular,
      color: MUTED,
    });
    y -= META_HEIGHT;

    if (isDraft) {
      const watermark = "DRAFT - NOT FINALIZED";
      const watermarkSize = 34;
      const watermarkWidth = resources.bold.widthOfTextAtSize(watermark, watermarkSize);
      page.drawText(watermark, {
        x: (PAGE_WIDTH - watermarkWidth) / 2,
        y: PAGE_HEIGHT / 2 - 10,
        size: watermarkSize,
        font: resources.bold,
        color: rgb(0.55, 0.12, 0.12),
        opacity: 0.12,
        rotate: degrees(18),
      });
    }

    y = drawRegisterHeader(page, resources, summary, y, weekWidth);
    for (const row of chunks[pageIndex]) {
      drawRegisterRow(page, resources, summary, row, y, weekWidth);
      y -= ROW_HEIGHT;
    }

    if (qrPng && pageIndex === chunks.length - 1) {
      const size = 34;
      const qrX = PAGE_WIDTH - MARGIN - size;
      const qrY = 31;
      page.drawImage(qrPng, { x: qrX, y: qrY, width: size, height: size });
      page.drawText("Verification QR", { x: qrX - 48, y: qrY + 13, size: 4.5, font: regular, color: MUTED });
    }
  }

  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    drawOfficialDocumentPdfFooter({
      page,
      font: regular,
      pageNumber: index + 1,
      pageCount: pages.length,
      primaryLeft: `Absent learner-days: ${summary.schoolTotals.absentLearnerDays} · Overall % absence: ${formatPercent(summary.schoolTotals.percentAbsence)}`,
      secondaryLeft: isDraft ? "DRAFT · NOT FINALIZED · ScolaPro summary of absentees" : "ScolaPro official summary of absentees",
      secondaryRight: isDraft ? "Preview only" : `Rev ${input.revision ?? 1} · ${officialDocumentPdfSafeText(input.scolaproReference ?? "")}`,
      primaryLeftMaxWidth: 470,
      secondaryLeftMaxWidth: 470,
      secondaryRightMaxWidth: 220,
    });
  });

  return {
    bytes: await pdf.save({ useObjectStreams: false, addDefaultPage: false, objectsPerTick: 50 }),
    pageCount: pages.length,
  };
}
