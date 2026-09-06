import "server-only";

import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  OFFICIAL_DOCUMENT_PDF_GEOMETRY,
  officialDocumentPdfContentWidth,
} from "@/features/documents/server/official-document-chrome";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import {
  OFFICIAL_DOCUMENT_PDF_HEADER_HEIGHT,
  createOfficialDocumentPdfResources,
  drawOfficialDocumentPdfCentered,
  drawOfficialDocumentPdfHeader,
  fitOfficialDocumentPdfText,
  officialDocumentPdfSafeText,
} from "@/features/documents/server/official-document-pdf-header";
import type { OfficialClassListRow } from "@/features/documents/server/render-official-class-list-html";

export type OfficialClassListPdfInput = {
  header: OfficialDocumentHeaderModel;
  academicYear: number;
  grade: string;
  registerClass: string;
  rows: OfficialClassListRow[];
  generatedAt?: string | null;
  registerTeacherName?: string | null;
  logoBytes?: Uint8Array | null;
};

const {
  pageWidth: PAGE_WIDTH,
  pageHeight: PAGE_HEIGHT,
  margin: MARGIN,
  metadataPrimaryBaselineY: META_PRIMARY_Y,
  metadataSecondaryBaselineY: META_SECONDARY_Y,
} = OFFICIAL_DOCUMENT_PDF_GEOMETRY;
const CONTENT_WIDTH = officialDocumentPdfContentWidth();
const INK = rgb(0.08, 0.08, 0.08);
const LINE = rgb(0.28, 0.28, 0.28);
const MUTED = rgb(0.38, 0.38, 0.38);
const TITLE_HEIGHT = 34;
const TABLE_HEADER_HEIGHT = 20;
const ROW_HEIGHT = 16;
const FOOTER_RESERVE = 36;

function drawTableHeader(page: PDFPage, bold: PDFFont, y: number, columns: number[]) {
  const labels = ["No.", "Learner", "Admission No.", "Sex", "Status"];
  let x = MARGIN;
  labels.forEach((label, index) => {
    const width = columns[index];
    page.drawRectangle({ x, y: y - TABLE_HEADER_HEIGHT, width, height: TABLE_HEADER_HEIGHT, borderWidth: 0.55, borderColor: LINE });
    page.drawText(label, { x: x + 4, y: y - 13, size: 6.2, font: bold, color: INK });
    x += width;
  });
}

function drawRow(page: PDFPage, regular: PDFFont, index: number, row: OfficialClassListRow, y: number, columns: number[]) {
  const values = [String(index + 1), row.learnerName, row.admissionNumber || "-", row.sex || "-", row.status || "-"];
  let x = MARGIN;
  values.forEach((value, columnIndex) => {
    const width = columns[columnIndex];
    page.drawRectangle({ x, y: y - ROW_HEIGHT, width, height: ROW_HEIGHT, borderWidth: 0.45, borderColor: LINE });
    const rendered = fitOfficialDocumentPdfText(regular, value, 6.2, width - 8);
    const textX = columnIndex === 0
      ? x + Math.max(4, (width - regular.widthOfTextAtSize(rendered, 6.2)) / 2)
      : x + 4;
    page.drawText(rendered, { x: textX, y: y - 11, size: 6.2, font: regular, color: INK });
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

  const numberWidth = 34;
  const learnerWidth = CONTENT_WIDTH * 0.39;
  const admissionWidth = CONTENT_WIDTH * 0.22;
  const sexWidth = 58;
  const statusWidth = CONTENT_WIDTH - numberWidth - learnerWidth - admissionWidth - sexWidth;
  const columns = [numberWidth, learnerWidth, admissionWidth, sexWidth, statusWidth];
  const availableRowsHeight = PAGE_HEIGHT - MARGIN * 2 - OFFICIAL_DOCUMENT_PDF_HEADER_HEIGHT - TITLE_HEIGHT - TABLE_HEADER_HEIGHT - FOOTER_RESERVE;
  const rowsPerPage = Math.max(1, Math.floor(availableRowsHeight / ROW_HEIGHT));
  const chunks: OfficialClassListRow[][] = [];
  if (!input.rows.length) chunks.push([]);
  for (let index = 0; index < input.rows.length; index += rowsPerPage) chunks.push(input.rows.slice(index, index + rowsPerPage));

  for (let pageIndex = 0; pageIndex < chunks.length; pageIndex += 1) {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = drawOfficialDocumentPdfHeader(page, input.header, resources);

    page.drawRectangle({ x: MARGIN, y: y - TITLE_HEIGHT, width: CONTENT_WIDTH, height: TITLE_HEIGHT, borderWidth: 0.55, borderColor: LINE });
    drawOfficialDocumentPdfCentered(page, bold, "Class List", 10, MARGIN, CONTENT_WIDTH, y - 13);
    const context = `${input.grade} | ${input.registerClass} | ${input.academicYear}${input.registerTeacherName ? ` | Register Teacher: ${input.registerTeacherName}` : ""}`;
    drawOfficialDocumentPdfCentered(page, regular, context, 6.3, MARGIN, CONTENT_WIDTH, y - 26);
    y -= TITLE_HEIGHT;

    drawTableHeader(page, bold, y, columns);
    y -= TABLE_HEADER_HEIGHT;
    const chunkStart = pageIndex * rowsPerPage;
    const chunk = chunks[pageIndex];
    if (!chunk.length) {
      page.drawRectangle({ x: MARGIN, y: y - ROW_HEIGHT * 2, width: CONTENT_WIDTH, height: ROW_HEIGHT * 2, borderWidth: 0.45, borderColor: LINE });
      drawOfficialDocumentPdfCentered(page, regular, "No learners in this class list.", 7, MARGIN, CONTENT_WIDTH, y - 20);
    } else {
      chunk.forEach((row, index) => {
        drawRow(page, regular, chunkStart + index, row, y, columns);
        y -= ROW_HEIGHT;
      });
    }
  }

  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    const totalLine = `Total learners: ${input.rows.length}${input.generatedAt ? ` | Generated ${officialDocumentPdfSafeText(input.generatedAt)}` : ""}`;
    page.drawText(fitOfficialDocumentPdfText(regular, totalLine, 5.4, 360), { x: MARGIN, y: META_PRIMARY_Y, size: 5.4, font: regular, color: MUTED });
    const pageText = `Page ${index + 1} of ${pages.length}`;
    page.drawText(pageText, { x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(pageText, 5.4), y: META_PRIMARY_Y, size: 5.4, font: regular, color: MUTED });
    page.drawText("ScolaPro official class list", { x: MARGIN, y: META_SECONDARY_Y, size: 5, font: regular, color: MUTED });
  });

  return {
    bytes: await pdf.save({ useObjectStreams: false, addDefaultPage: false, objectsPerTick: 50 }),
    pageCount: pages.length,
  };
}
