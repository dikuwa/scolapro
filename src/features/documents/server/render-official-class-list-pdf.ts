import "server-only";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  OFFICIAL_DOCUMENT_PDF_GEOMETRY,
  officialDocumentPdfContentWidth,
} from "@/features/documents/server/official-document-chrome";
import { loadOfficialOldEnglishFontBytes } from "@/features/documents/server/official-document-fonts";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
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
const HEADER_HEIGHT = 84;
const TITLE_HEIGHT = 34;
const TABLE_HEADER_HEIGHT = 20;
const ROW_HEIGHT = 16;
const FOOTER_RESERVE = 36;

function safeText(value: unknown): string {
  return String(value ?? "").replaceAll("—", "-").replaceAll("–", "-").replaceAll("’", "'");
}

function fitText(font: PDFFont, value: unknown, size: number, maxWidth: number): string {
  const source = safeText(value);
  if (font.widthOfTextAtSize(source, size) <= maxWidth) return source;
  let output = source;
  while (output.length > 1 && font.widthOfTextAtSize(`${output}...`, size) > maxWidth) output = output.slice(0, -1);
  return `${output}...`;
}

function drawCentered(page: PDFPage, font: PDFFont, value: unknown, size: number, x: number, width: number, y: number) {
  const rendered = fitText(font, value, size, width - 6);
  const renderedWidth = font.widthOfTextAtSize(rendered, size);
  page.drawText(rendered, { x: x + Math.max(3, (width - renderedWidth) / 2), y, size, font, color: INK });
}

async function embedLogo(pdf: PDFDocument, bytes: Uint8Array | null | undefined) {
  if (!bytes?.length) return null;
  try {
    return await pdf.embedPng(bytes);
  } catch {
    try {
      return await pdf.embedJpg(bytes);
    } catch {
      return null;
    }
  }
}

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
    const rendered = fitText(regular, value, 6.2, width - 8);
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

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let schoolNameFont = bold;
  if (input.header.schoolNameFont === "old_english") {
    pdf.registerFontkit(fontkit);
    schoolNameFont = await pdf.embedFont(await loadOfficialOldEnglishFontBytes(), { subset: true });
  }
  const logo = await embedLogo(pdf, input.logoBytes);

  const numberWidth = 34;
  const learnerWidth = CONTENT_WIDTH * 0.39;
  const admissionWidth = CONTENT_WIDTH * 0.22;
  const sexWidth = 58;
  const statusWidth = CONTENT_WIDTH - numberWidth - learnerWidth - admissionWidth - sexWidth;
  const columns = [numberWidth, learnerWidth, admissionWidth, sexWidth, statusWidth];
  const availableRowsHeight = PAGE_HEIGHT - MARGIN * 2 - HEADER_HEIGHT - TITLE_HEIGHT - TABLE_HEADER_HEIGHT - FOOTER_RESERVE;
  const rowsPerPage = Math.max(1, Math.floor(availableRowsHeight / ROW_HEIGHT));
  const chunks: OfficialClassListRow[][] = [];
  if (!input.rows.length) chunks.push([]);
  for (let index = 0; index < input.rows.length; index += rowsPerPage) chunks.push(input.rows.slice(index, index + rowsPerPage));

  for (let pageIndex = 0; pageIndex < chunks.length; pageIndex += 1) {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;

    page.drawRectangle({ x: MARGIN, y: y - HEADER_HEIGHT, width: CONTENT_WIDTH, height: HEADER_HEIGHT, borderWidth: 0.85, borderColor: LINE });
    const logoColumnWidth = 82;
    const postalWidth = 116;
    const centreX = MARGIN + logoColumnWidth;
    const centreWidth = CONTENT_WIDTH - logoColumnWidth - postalWidth;
    const logoX = MARGIN + 8;
    const logoY = y - 72;

    if (logo) {
      const scale = Math.min(58 / logo.width, 56 / logo.height);
      const width = logo.width * scale;
      const height = logo.height * scale;
      page.drawImage(logo, { x: logoX + (66 - width) / 2, y: logoY + (64 - height) / 2, width, height });
    }

    let schoolFontSize = input.header.schoolNameFont === "old_english" ? 19 : 16;
    while (schoolFontSize > 11 && schoolNameFont.widthOfTextAtSize(input.header.schoolName, schoolFontSize) > centreWidth - 8) schoolFontSize -= 0.5;
    drawCentered(page, schoolNameFont, input.header.schoolName, schoolFontSize, centreX, centreWidth, y - 22);
    if (input.header.formerName) drawCentered(page, regular, `(${input.header.formerName})`, 6.8, centreX, centreWidth, y - 34);
    input.header.contactLines.slice(0, 4).forEach((line, index) => {
      drawCentered(page, regular, line.text, 5.8, centreX, centreWidth, y - 47 - index * 8);
    });
    if (input.header.schoolEmisNumber) drawCentered(page, regular, `EMIS: ${input.header.schoolEmisNumber}`, 5.4, centreX, centreWidth, y - 78);
    const postalX = PAGE_WIDTH - MARGIN - postalWidth + 8;
    input.header.postalLines.slice(0, 3).forEach((line, index) => {
      page.drawText(fitText(regular, line, 6.2, postalWidth - 16), { x: postalX, y: y - 48 - index * 9, size: 6.2, font: regular, color: INK });
    });
    y -= HEADER_HEIGHT;

    page.drawRectangle({ x: MARGIN, y: y - TITLE_HEIGHT, width: CONTENT_WIDTH, height: TITLE_HEIGHT, borderWidth: 0.55, borderColor: LINE });
    drawCentered(page, bold, "Class List", 10, MARGIN, CONTENT_WIDTH, y - 13);
    const context = `${input.grade} | ${input.registerClass} | ${input.academicYear}${input.registerTeacherName ? ` | Register Teacher: ${input.registerTeacherName}` : ""}`;
    drawCentered(page, regular, context, 6.3, MARGIN, CONTENT_WIDTH, y - 26);
    y -= TITLE_HEIGHT;

    drawTableHeader(page, bold, y, columns);
    y -= TABLE_HEADER_HEIGHT;
    const chunkStart = pageIndex * rowsPerPage;
    const chunk = chunks[pageIndex];
    if (!chunk.length) {
      page.drawRectangle({ x: MARGIN, y: y - ROW_HEIGHT * 2, width: CONTENT_WIDTH, height: ROW_HEIGHT * 2, borderWidth: 0.45, borderColor: LINE });
      drawCentered(page, regular, "No learners in this class list.", 7, MARGIN, CONTENT_WIDTH, y - 20);
    } else {
      chunk.forEach((row, index) => {
        drawRow(page, regular, chunkStart + index, row, y, columns);
        y -= ROW_HEIGHT;
      });
    }
  }

  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    const totalLine = `Total learners: ${input.rows.length}${input.generatedAt ? ` | Generated ${safeText(input.generatedAt)}` : ""}`;
    page.drawText(fitText(regular, totalLine, 5.4, 360), { x: MARGIN, y: META_PRIMARY_Y, size: 5.4, font: regular, color: MUTED });
    const pageText = `Page ${index + 1} of ${pages.length}`;
    page.drawText(pageText, { x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(pageText, 5.4), y: META_PRIMARY_Y, size: 5.4, font: regular, color: MUTED });
    page.drawText("ScolaPro official class list", { x: MARGIN, y: META_SECONDARY_Y, size: 5, font: regular, color: MUTED });
  });

  return {
    bytes: await pdf.save({ useObjectStreams: false, addDefaultPage: false, objectsPerTick: 50 }),
    pageCount: pages.length,
  };
}
