import "server-only";

import QRCode from "qrcode";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  OFFICIAL_DOCUMENT_PDF_GEOMETRY,
  officialDocumentPdfContentWidth,
} from "@/features/documents/server/official-document-chrome";
import { drawOfficialDocumentPdfFooter } from "@/features/documents/server/official-document-pdf-footer";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import {
  OFFICIAL_DOCUMENT_PDF_HEADER_HEIGHT,
  createOfficialDocumentPdfResources,
  drawOfficialDocumentPdfCentered,
  drawOfficialDocumentPdfHeader,
  fitOfficialDocumentPdfText,
  officialDocumentPdfSafeText,
} from "@/features/documents/server/official-document-pdf-header";
import type { OfficialAttendanceSummary } from "@/features/attendance/server/official-summary";

export type OfficialAttendanceSummaryPdfInput = {
  header: OfficialDocumentHeaderModel;
  summary: OfficialAttendanceSummary;
  revision: number;
  scolaproReference: string;
  verificationToken: string;
  verificationUrl: string;
  finalizedAt: string;
  generatedAt?: string | null;
  logoBytes?: Uint8Array | null;
};

const {
  pageWidth: PAGE_WIDTH,
  pageHeight: PAGE_HEIGHT,
  margin: MARGIN,
} = OFFICIAL_DOCUMENT_PDF_GEOMETRY;
const CONTENT_WIDTH = officialDocumentPdfContentWidth();
const INK = rgb(0.08, 0.08, 0.08);
const LINE = rgb(0.28, 0.28, 0.28);
const MUTED = rgb(0.38, 0.38, 0.38);
const TINT = rgb(0.95, 0.96, 0.98);
const TINT_STRONG = rgb(0.9, 0.93, 0.97);
const TITLE_HEIGHT = 40;
const META_HEIGHT = 16;
const TABLE_HEADER_HEIGHT = 20;
const ROW_HEIGHT = 16;
const FOOTER_RESERVE = 36;

function formatPercent(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function drawTableHeader(page: PDFPage, bold: PDFFont, y: number, widths: number[], labels: string[]) {
  let x = MARGIN;
  labels.forEach((label, index) => {
    const width = widths[index];
    page.drawRectangle({ x, y: y - TABLE_HEADER_HEIGHT, width, height: TABLE_HEADER_HEIGHT, borderWidth: 0.55, borderColor: LINE });
    page.drawText(label, { x: x + 4, y: y - 13, size: 6.3, font: bold, color: INK });
    x += width;
  });
}

function drawRow(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  y: number,
  widths: number[],
  values: string[],
  options?: { tint?: boolean; bold?: boolean; alignRightFrom?: number },
) {
  let x = MARGIN;
  const height = ROW_HEIGHT;
  const font = options?.bold ? fonts.bold : fonts.regular;
  if (options?.tint) {
    page.drawRectangle({ x, y: y - height, width: CONTENT_WIDTH, height, color: options.bold ? TINT_STRONG : TINT });
  }
  values.forEach((value, index) => {
    const width = widths[index];
    page.drawRectangle({ x, y: y - height, width, height, borderWidth: 0.45, borderColor: LINE });
    const right = options?.alignRightFrom !== undefined && index >= options.alignRightFrom;
    const rendered = fitOfficialDocumentPdfText(font, value, 6.4, width - 8);
    page.drawText(rendered, {
      x: right ? x + width - 4 - font.widthOfTextAtSize(rendered, 6.4) : x + 4,
      y: y - 11,
      size: 6.4,
      font,
      color: INK,
    });
    x += width;
  });
}

export async function renderOfficialAttendanceSummaryPdf(
  input: OfficialAttendanceSummaryPdfInput,
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.header.schoolName} - Official Attendance Summary`);
  pdf.setAuthor("ScolaPro");
  pdf.setCreator("ScolaPro official document renderer");
  pdf.setProducer("ScolaPro");
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));

  const resources = await createOfficialDocumentPdfResources(pdf, input.header, input.logoBytes);
  const { regular, bold } = resources;

  const summary = input.summary;
  const isTerm = summary.mode === "term";
  const scopeLabel = `${officialDocumentPdfSafeText(summary.scopeStart)} – ${officialDocumentPdfSafeText(summary.scopeEnd)}`;
  const finalizedLabel = new Intl.DateTimeFormat("en-NA", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(input.finalizedAt));
  const generatedLabel = input.generatedAt
    ? new Intl.DateTimeFormat("en-NA", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(input.generatedAt))
    : null;

  const titleText = isTerm
    ? `Term Summary${summary.term ? ` — ${summary.term.displayName}` : ""}`
    : "Weekly Summary";

  const fixedCount = isTerm ? 4 : 3;
  const fixedWidth = isTerm ? 60 : 70;
  const classWidth = CONTENT_WIDTH - fixedCount * fixedWidth;
  const widths = isTerm
    ? [classWidth, 60, 60, 60, 60]
    : [classWidth, 70, 70, 70];
  const headers = isTerm
    ? ["Register class", "Boys", "Girls", "Total", "% absence"]
    : ["Register class", "Boys absent", "Girls absent", "Total absent"];

  const availableRowsHeight =
    PAGE_HEIGHT - MARGIN * 2 - OFFICIAL_DOCUMENT_PDF_HEADER_HEIGHT - TITLE_HEIGHT - META_HEIGHT - TABLE_HEADER_HEIGHT - FOOTER_RESERVE;
  const rowsPerPage = Math.max(1, Math.floor(availableRowsHeight / ROW_HEIGHT));

  const dataRows: { values: string[]; tint: boolean; bold: boolean }[] = [];
  for (const row of summary.classRows) {
    const a = row.absences;
    dataRows.push({
      values: isTerm
        ? [officialDocumentPdfSafeText(`${row.gradeName} ${row.className}`), String(a.boys), String(a.girls), String(a.total), ""]
        : [officialDocumentPdfSafeText(`${row.gradeName} ${row.className}`), String(a.boys), String(a.girls), String(a.total)],
      tint: false,
      bold: false,
    });
  }
  for (const row of summary.gradeRows) {
    const a = row.absences;
    dataRows.push({
      values: isTerm
        ? [officialDocumentPdfSafeText(`${row.gradeName} (grade total)`), String(a.boys), String(a.girls), String(a.total), ""]
        : [officialDocumentPdfSafeText(`${row.gradeName} (grade total)`), String(a.boys), String(a.girls), String(a.total)],
      tint: true,
      bold: false,
    });
  }
  const school = summary.schoolTotals;
  dataRows.push({
    values: isTerm
      ? ["School total", String(school.absentLearnerDays), "", "", formatPercent(school.percentAbsence)]
      : ["School total", "—", "—", String(school.absentLearnerDays)],
    tint: true,
    bold: true,
  });

  const chunks: typeof dataRows[] = [];
  for (let index = 0; index < dataRows.length; index += rowsPerPage) {
    chunks.push(dataRows.slice(index, index + rowsPerPage));
  }
  if (!chunks.length) chunks.push([]);

  const qrPng = await (async () => {
    try {
      const dataUrl = await QRCode.toDataURL(input.verificationUrl, { errorCorrectionLevel: "M", margin: 1, width: 240 });
      return await pdf.embedPng(Buffer.from(dataUrl.split(",")[1], "base64"));
    } catch {
      return null;
    }
  })();

  for (let pageIndex = 0; pageIndex < chunks.length; pageIndex += 1) {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = drawOfficialDocumentPdfHeader(page, input.header, resources);

    page.drawRectangle({ x: MARGIN, y: y - TITLE_HEIGHT, width: CONTENT_WIDTH, height: TITLE_HEIGHT, borderWidth: 0.55, borderColor: LINE });
    drawOfficialDocumentPdfCentered(page, bold, "OFFICIAL ATTENDANCE SUMMARY", 11, MARGIN, CONTENT_WIDTH, y - 14);
    drawOfficialDocumentPdfCentered(page, regular, officialDocumentPdfSafeText(titleText), 6.6, MARGIN, CONTENT_WIDTH, y - 26);
    y -= TITLE_HEIGHT;

    page.drawText(`Reporting period: ${scopeLabel}`, { x: MARGIN, y: y - 11, size: 6.2, font: regular, color: MUTED });
    drawOfficialDocumentPdfCentered(
      page,
      regular,
      `Revision ${input.revision} · Ref ${officialDocumentPdfSafeText(input.scolaproReference)} · Finalized ${officialDocumentPdfSafeText(finalizedLabel)}`,
      6.2,
      MARGIN,
      CONTENT_WIDTH,
      y - 11,
    );
    y -= META_HEIGHT;

    drawTableHeader(page, bold, y, widths, headers);
    y -= TABLE_HEADER_HEIGHT;

    const chunk = chunks[pageIndex];
    if (!chunk.length) {
      page.drawRectangle({ x: MARGIN, y: y - ROW_HEIGHT * 2, width: CONTENT_WIDTH, height: ROW_HEIGHT * 2, borderWidth: 0.45, borderColor: LINE });
      drawOfficialDocumentPdfCentered(page, regular, "No register classes are configured for this scope.", 7, MARGIN, CONTENT_WIDTH, y - 20);
    } else {
      chunk.forEach((row) => {
        drawRow(page, resources, y, widths, row.values, { tint: row.tint, bold: row.bold, alignRightFrom: 1 });
        y -= ROW_HEIGHT;
      });
    }

    if (qrPng && pageIndex === chunks.length - 1) {
      const size = 60;
      const qrX = PAGE_WIDTH - MARGIN - size;
      const qrY = MARGIN + 6;
      page.drawRectangle({ x: qrX - 3, y: qrY - 3, width: size + 6, height: size + 6, borderWidth: 0.45, borderColor: LINE });
      page.drawImage(qrPng, { x: qrX, y: qrY, width: size, height: size });
      page.drawText("Verify authenticity at", { x: MARGIN, y: qrY + size - 2, size: 5, font: regular, color: MUTED });
      const verifyLine = fitOfficialDocumentPdfText(regular, input.verificationUrl, 5, CONTENT_WIDTH - size - 16);
      page.drawText(verifyLine, { x: MARGIN, y: qrY + size - 9, size: 5, font: regular, color: MUTED });
    }
  }

  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    const totalLine = `Possible attendances: ${summary.schoolTotals.possibleAttendances} · Absent learner-days: ${summary.schoolTotals.absentLearnerDays}${
      generatedLabel ? ` · Generated ${officialDocumentPdfSafeText(generatedLabel)}` : ""
    }`;
    drawOfficialDocumentPdfFooter({
      page,
      font: regular,
      pageNumber: index + 1,
      pageCount: pages.length,
      primaryLeft: totalLine,
      secondaryLeft: "ScolaPro official attendance summary",
      secondaryRight: `Rev ${input.revision} · ${officialDocumentPdfSafeText(input.scolaproReference)}`,
      primaryFontSize: 5.2,
      secondaryFontSize: 5,
      primaryLeftMaxWidth: 360,
    });
  });

  return {
    bytes: await pdf.save({ useObjectStreams: false, addDefaultPage: false, objectsPerTick: 50 }),
    pageCount: pages.length,
  };
}
