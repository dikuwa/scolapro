import "server-only";

import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  OFFICIAL_DOCUMENT_PDF_GEOMETRY,
  officialDocumentPdfContentWidth,
} from "@/features/documents/server/official-document-chrome";
import { drawOfficialDocumentPdfFooter } from "@/features/documents/server/official-document-pdf-footer";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import {
  createOfficialDocumentPdfResources,
  drawOfficialDocumentPdfCentered,
  drawOfficialDocumentPdfHeader,
  fitOfficialDocumentPdfText,
  officialDocumentPdfSafeText,
} from "@/features/documents/server/official-document-pdf-header";
import type { OfficialClassListRow } from "@/features/documents/server/render-official-class-list-html";
import { buildOfficialClassListColumns, classListDocumentName } from "@/features/documents/server/class-list-document";
import type { ClassListColumnId } from "@/features/learners/class-list-types";

export type OfficialClassListPdfInput = {
  header: OfficialDocumentHeaderModel;
  academicYear: number;
  grade: string;
  registerClass: string;
  rows: OfficialClassListRow[];
  columns?: ClassListColumnId[];
  blankColumns?: number;
  rosterTitle?: string | null;
  generatedAt?: string | null;
  registerTeacherName?: string | null;
  roomName?: string | null;
  responsibleTeacherName?: string | null;
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
const CLASS_LIST_HEADER_RESERVE = 88;
const TABLE_HEADER_HEIGHT = 18;
const ROW_HEIGHT = 13;
const FOOTER_RESERVE = 28;

function normalizedSex(value: string | null): "M" | "F" | "" {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "male" || normalized === "m") return "M";
  if (normalized === "female" || normalized === "f") return "F";
  return "";
}

function drawClassListHeader(
  page: PDFPage,
  input: OfficialClassListPdfInput,
  resources: Awaited<ReturnType<typeof createOfficialDocumentPdfResources>>,
  tableWidth: number,
  documentX: number,
): number {
  const { regular, bold } = resources;
  const maleCount = input.rows.filter((row) => normalizedSex(row.sex) === "M").length;
  const femaleCount = input.rows.filter((row) => normalizedSex(row.sex) === "F").length;
  let y = drawOfficialDocumentPdfHeader(page, input.header, resources, PAGE_HEIGHT - MARGIN, {
    documentX,
    documentWidth: tableWidth,
    context: {
      title: classListDocumentName(input.registerClass, input.rosterTitle),
      primaryContext: `${input.grade || "—"} · ${input.registerClass || "—"} · ${input.academicYear}`,
      summary: `Male ${maleCount} · Female ${femaleCount} · ${input.rows.length} learners`,
    },
  });

  if (input.roomName || input.responsibleTeacherName) {
    const stripHeight = 14;
    page.drawRectangle({
      x: documentX,
      y: y - stripHeight,
      width: tableWidth,
      height: stripHeight,
      borderWidth: 0.55,
      borderColor: LINE,
    });
    const half = tableWidth / 2;
    if (input.roomName) {
      page.drawText("Room:", { x: documentX + 5, y: y - 9.5, size: 5.7, font: bold, color: INK });
      page.drawText(fitOfficialDocumentPdfText(regular, input.roomName, 5.7, half - 34), {
        x: documentX + 31,
        y: y - 9.5,
        size: 5.7,
        font: regular,
        color: INK,
      });
    }
    if (input.responsibleTeacherName) {
      const label = "Responsible teacher:";
      const labelWidth = bold.widthOfTextAtSize(label, 5.7);
      const x = documentX + half;
      page.drawText(label, { x: x + 5, y: y - 9.5, size: 5.7, font: bold, color: INK });
      page.drawText(fitOfficialDocumentPdfText(regular, input.responsibleTeacherName, 5.7, half - labelWidth - 14), {
        x: x + 8 + labelWidth,
        y: y - 9.5,
        size: 5.7,
        font: regular,
        color: INK,
      });
    }
    y -= stripHeight;
  }

  return y;
}

function preferredColumnWidth(key: string): number {
  if (key === "number") return 28;
  if (key === "admissionNumber") return 68;
  if (key === "learner") return 150;
  if (key === "sex") return 34;
  if (key === "status") return 58;
  if (key === "registerClass") return 78;
  if (key === "guardianName") return 118;
  if (key === "guardianPhone") return 92;
  if (key === "guardianAddress") return 122;
  if (key === "emergencyContact") return 128;
  if (key.startsWith("blank-")) return 62;
  return 72;
}

function fitColumnWidths(keys: string[]): number[] {
  const preferred = keys.map(preferredColumnWidth);
  const total = preferred.reduce((sum, width) => sum + width, 0);
  const scale = CONTENT_WIDTH / total;
  return preferred.map((width) => width * scale);
}

function drawTableHeader(page: PDFPage, bold: PDFFont, y: number, widths: number[], labels: string[], documentX: number) {
  let x = documentX;
  labels.forEach((label, index) => {
    const width = widths[index];
    page.drawRectangle({ x, y: y - TABLE_HEADER_HEIGHT, width, height: TABLE_HEADER_HEIGHT, borderWidth: 0.55, borderColor: LINE });
    page.drawText(label, { x: x + 4, y: y - 12, size: 6.1, font: bold, color: INK });
    x += width;
  });
}

function drawRow(page: PDFPage, regular: PDFFont, index: number, row: OfficialClassListRow, y: number, widths: number[], values: string[], documentX: number, rowHeight: number) {
  let x = documentX;
  values.forEach((value, columnIndex) => {
    const width = widths[columnIndex];
    page.drawRectangle({ x, y: y - rowHeight, width, height: rowHeight, borderWidth: 0.45, borderColor: LINE });
    const lines = value.split(/\r?\n/).filter(Boolean).slice(0, 2);
    const renderedLines = (lines.length ? lines : [""]).map((line) => fitOfficialDocumentPdfText(regular, line, 5.7, width - 8));
    renderedLines.forEach((rendered, lineIndex) => {
      const textX = columnIndex === 0
        ? x + Math.max(4, (width - regular.widthOfTextAtSize(rendered, 5.7)) / 2)
        : x + 4;
      const lineY = rowHeight > ROW_HEIGHT ? y - 8.2 - lineIndex * 8 : y - 9.3;
      page.drawText(rendered, { x: textX, y: lineY, size: 5.7, font: regular, color: INK });
    });
    x += width;
  });
}

export async function renderOfficialClassListPdf(
  input: OfficialClassListPdfInput,
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.header.schoolName} - ${input.registerClass} class list`);
  pdf.setAuthor("ScolaPro");
  pdf.setCreator("ScolaPro official document renderer");
  pdf.setProducer("ScolaPro");
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));

  const resources = await createOfficialDocumentPdfResources(pdf, input.header, input.logoBytes);
  const { regular, bold } = resources;

  const documentColumns = buildOfficialClassListColumns(input.columns ?? ["admissionNumber", "sex", "status"], input.blankColumns ?? 3);
  const columns = fitColumnWidths(documentColumns.map((column) => column.key));
  const tableWidth = columns.reduce((sum, width) => sum + width, 0);
  const documentX = MARGIN;
  const availableRowsHeight = PAGE_HEIGHT - MARGIN * 2 - CLASS_LIST_HEADER_RESERVE - TABLE_HEADER_HEIGHT - FOOTER_RESERVE;
  const rowHeight = documentColumns.some((column) => column.key === "guardianAddress") ? 22 : ROW_HEIGHT;
  const rowsPerPage = Math.max(1, Math.floor(availableRowsHeight / rowHeight));
  const chunks: OfficialClassListRow[][] = [];
  if (!input.rows.length) chunks.push([]);
  for (let index = 0; index < input.rows.length; index += rowsPerPage) chunks.push(input.rows.slice(index, index + rowsPerPage));

  for (let pageIndex = 0; pageIndex < chunks.length; pageIndex += 1) {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = drawClassListHeader(page, input, resources, tableWidth, documentX);
    drawTableHeader(page, bold, y, columns, documentColumns.map((column) => column.label), documentX);
    y -= TABLE_HEADER_HEIGHT;
    const chunkStart = pageIndex * rowsPerPage;
    const chunk = chunks[pageIndex];
    if (!chunk.length) {
      page.drawRectangle({ x: documentX, y: y - rowHeight * 2, width: tableWidth, height: rowHeight * 2, borderWidth: 0.45, borderColor: LINE });
      drawOfficialDocumentPdfCentered(page, regular, "No learners in this class list.", 7, documentX, tableWidth, y - rowHeight - 7);
    } else {
      chunk.forEach((row, index) => {
        drawRow(page, regular, chunkStart + index, row, y, columns, documentColumns.map((column) => column.value(row, chunkStart + index)), documentX, rowHeight);
        y -= rowHeight;
      });
    }
  }

  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    const totalLine = `Total learners: ${input.rows.length}${input.generatedAt ? ` | Generated ${officialDocumentPdfSafeText(input.generatedAt)}` : ""}`;
    drawOfficialDocumentPdfFooter({
      page,
      font: regular,
      pageNumber: index + 1,
      pageCount: pages.length,
      primaryLeft: totalLine,
      secondaryLeft: "ScolaPro official class list",
      primaryFontSize: 5.4,
      secondaryFontSize: 5,
      primaryLeftMaxWidth: 360,
    });
  });

  return {
    bytes: await pdf.save({ useObjectStreams: false, addDefaultPage: false, objectsPerTick: 50 }),
    pageCount: pages.length,
  };
}
