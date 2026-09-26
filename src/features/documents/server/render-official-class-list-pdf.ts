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
const CLASS_LIST_HEADER_HEIGHT = 58;
const TABLE_HEADER_HEIGHT = 18;
const ROW_HEIGHT = 13;
const FOOTER_RESERVE = 28;


function normalizedSex(value: string | null): "M" | "F" | "" {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "male" || normalized === "m") return "M";
  if (normalized === "female" || normalized === "f") return "F";
  return "";
}

function drawRightAlignedText(page: PDFPage, font: PDFFont, value: string, size: number, x: number, width: number, y: number) {
  const rendered = fitOfficialDocumentPdfText(font, value, size, width);
  const renderedWidth = font.widthOfTextAtSize(rendered, size);
  page.drawText(rendered, { x: x + Math.max(0, width - renderedWidth), y, size, font, color: INK });
}

function drawClassListHeader(
  page: PDFPage,
  input: OfficialClassListPdfInput,
  resources: Awaited<ReturnType<typeof createOfficialDocumentPdfResources>>,
  tableWidth: number,
  documentX: number,
): number {
  const { regular, bold, schoolNameFont, logo } = resources;
  const topY = PAGE_HEIGHT - MARGIN;
  page.drawRectangle({
    x: documentX,
    y: topY - CLASS_LIST_HEADER_HEIGHT,
    width: tableWidth,
    height: CLASS_LIST_HEADER_HEIGHT,
    borderWidth: 0.65,
    borderColor: LINE,
  });

  const logoBoxWidth = logo ? 48 : 0;
  if (logo) {
    const scale = Math.min(40 / logo.width, 42 / logo.height);
    const width = logo.width * scale;
    const height = logo.height * scale;
    page.drawImage(logo, {
      x: documentX + 5 + Math.max(0, (logoBoxWidth - width) / 2),
      y: topY - 50 + Math.max(0, (42 - height) / 2),
      width,
      height,
    });
  }

  const metaWidth = Math.min(175, Math.max(135, tableWidth * 0.4));
  const metaX = documentX + tableWidth - metaWidth - 7;
  const schoolX = documentX + 7 + logoBoxWidth;
  const schoolWidth = Math.max(90, metaX - schoolX - 8);
  let schoolSize = input.header.schoolNameFont === "old_english" ? 17 : 14;
  while (schoolSize > 10 && schoolNameFont.widthOfTextAtSize(input.header.schoolName, schoolSize) > schoolWidth) schoolSize -= 0.5;
  page.drawText(fitOfficialDocumentPdfText(schoolNameFont, input.header.schoolName, schoolSize, schoolWidth), {
    x: schoolX,
    y: topY - 31,
    size: schoolSize,
    font: schoolNameFont,
    color: INK,
  });

  const maleCount = input.rows.filter((row) => normalizedSex(row.sex) === "M").length;
  const femaleCount = input.rows.filter((row) => normalizedSex(row.sex) === "F").length;
  drawRightAlignedText(page, bold, classListDocumentName(input.registerClass, input.rosterTitle), 10.5, metaX, metaWidth, topY - 16);
  drawRightAlignedText(page, regular, `${input.grade || "—"} · ${input.registerClass || "—"} · ${input.academicYear}`, 6.2, metaX, metaWidth, topY - 29);
  drawRightAlignedText(page, regular, `Male ${maleCount} · Female ${femaleCount} · ${input.rows.length} learners`, 5.9, metaX, metaWidth, topY - 40);
  if (input.registerTeacherName) {
    drawRightAlignedText(page, regular, `Register teacher: ${input.registerTeacherName}`, 5.5, metaX, metaWidth, topY - 50);
  }
  return topY - CLASS_LIST_HEADER_HEIGHT;
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
  if (key === "emergencyContact") return 128;
  if (key.startsWith("blank-")) return 62;
  return 72;
}

function fitColumnWidths(keys: string[]): number[] {
  const preferred = keys.map(preferredColumnWidth);
  const total = preferred.reduce((sum, width) => sum + width, 0);
  if (total <= CONTENT_WIDTH) return preferred;
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

function drawRow(page: PDFPage, regular: PDFFont, index: number, row: OfficialClassListRow, y: number, widths: number[], values: string[], documentX: number) {
  let x = documentX;
  values.forEach((value, columnIndex) => {
    const width = widths[columnIndex];
    page.drawRectangle({ x, y: y - ROW_HEIGHT, width, height: ROW_HEIGHT, borderWidth: 0.45, borderColor: LINE });
    const rendered = fitOfficialDocumentPdfText(regular, value, 5.9, width - 8);
    const textX = columnIndex === 0
      ? x + Math.max(4, (width - regular.widthOfTextAtSize(rendered, 5.9)) / 2)
      : x + 4;
    page.drawText(rendered, { x: textX, y: y - 9.3, size: 5.9, font: regular, color: INK });
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

  const documentColumns = buildOfficialClassListColumns(input.columns ?? ["admissionNumber", "sex", "status"], input.blankColumns ?? 0);
  const columns = fitColumnWidths(documentColumns.map((column) => column.key));
  const tableWidth = columns.reduce((sum, width) => sum + width, 0);
  const documentX = Math.max(MARGIN, (PAGE_WIDTH - tableWidth) / 2);
  const availableRowsHeight = PAGE_HEIGHT - MARGIN * 2 - CLASS_LIST_HEADER_HEIGHT - TABLE_HEADER_HEIGHT - FOOTER_RESERVE;
  const rowsPerPage = Math.max(1, Math.floor(availableRowsHeight / ROW_HEIGHT));
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
      page.drawRectangle({ x: documentX, y: y - ROW_HEIGHT * 2, width: tableWidth, height: ROW_HEIGHT * 2, borderWidth: 0.45, borderColor: LINE });
      drawOfficialDocumentPdfCentered(page, regular, "No learners in this class list.", 7, MARGIN, tableWidth, y - 20);
    } else {
      chunk.forEach((row, index) => {
        drawRow(page, regular, chunkStart + index, row, y, columns, documentColumns.map((column) => column.value(row, chunkStart + index)), documentX);
        y -= ROW_HEIGHT;
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
