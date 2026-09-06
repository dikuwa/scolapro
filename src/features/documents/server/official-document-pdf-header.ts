import "server-only";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFFont, type PDFPage } from "pdf-lib";
import {
  OFFICIAL_DOCUMENT_PDF_GEOMETRY,
  officialDocumentPdfContentWidth,
} from "@/features/documents/server/official-document-chrome";
import { loadOfficialOldEnglishFontBytes } from "@/features/documents/server/official-document-fonts";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";

const {
  pageWidth: PAGE_WIDTH,
  pageHeight: PAGE_HEIGHT,
  margin: MARGIN,
  logoColumnWidth: LOGO_WIDTH,
  postalColumnWidth: POSTAL_WIDTH,
} = OFFICIAL_DOCUMENT_PDF_GEOMETRY;
const CONTENT_WIDTH = officialDocumentPdfContentWidth();
const INK = rgb(0.08, 0.08, 0.08);
const LINE = rgb(0.28, 0.28, 0.28);

export const OFFICIAL_DOCUMENT_PDF_HEADER_HEIGHT = 84;

export type OfficialDocumentPdfResources = {
  regular: PDFFont;
  bold: PDFFont;
  schoolNameFont: PDFFont;
  logo: PDFImage | null;
};

export function officialDocumentPdfSafeText(value: unknown): string {
  return String(value ?? "").replaceAll("—", "-").replaceAll("–", "-").replaceAll("’", "'");
}

export function fitOfficialDocumentPdfText(font: PDFFont, value: unknown, size: number, maxWidth: number): string {
  const source = officialDocumentPdfSafeText(value);
  if (font.widthOfTextAtSize(source, size) <= maxWidth) return source;
  let output = source;
  while (output.length > 1 && font.widthOfTextAtSize(`${output}...`, size) > maxWidth) output = output.slice(0, -1);
  return `${output}...`;
}

export function drawOfficialDocumentPdfCentered(
  page: PDFPage,
  font: PDFFont,
  value: unknown,
  size: number,
  x: number,
  width: number,
  y: number,
) {
  const rendered = fitOfficialDocumentPdfText(font, value, size, width - 6);
  const renderedWidth = font.widthOfTextAtSize(rendered, size);
  page.drawText(rendered, { x: x + Math.max(3, (width - renderedWidth) / 2), y, size, font, color: INK });
}

async function embedOfficialDocumentLogo(pdf: PDFDocument, bytes: Uint8Array | null | undefined): Promise<PDFImage | null> {
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

export async function createOfficialDocumentPdfResources(
  pdf: PDFDocument,
  header: OfficialDocumentHeaderModel,
  logoBytes?: Uint8Array | null,
): Promise<OfficialDocumentPdfResources> {
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let schoolNameFont = bold;
  if (header.schoolNameFont === "old_english") {
    pdf.registerFontkit(fontkit);
    schoolNameFont = await pdf.embedFont(await loadOfficialOldEnglishFontBytes(), { subset: true });
  }
  return {
    regular,
    bold,
    schoolNameFont,
    logo: await embedOfficialDocumentLogo(pdf, logoBytes),
  };
}

/** Draws the canonical school identity block and returns the next content Y. */
export function drawOfficialDocumentPdfHeader(
  page: PDFPage,
  header: OfficialDocumentHeaderModel,
  resources: OfficialDocumentPdfResources,
  topY = PAGE_HEIGHT - MARGIN,
): number {
  const { regular, schoolNameFont, logo } = resources;
  page.drawRectangle({
    x: MARGIN,
    y: topY - OFFICIAL_DOCUMENT_PDF_HEADER_HEIGHT,
    width: CONTENT_WIDTH,
    height: OFFICIAL_DOCUMENT_PDF_HEADER_HEIGHT,
    borderWidth: 0.85,
    borderColor: LINE,
  });

  const centreX = MARGIN + LOGO_WIDTH;
  const centreWidth = CONTENT_WIDTH - LOGO_WIDTH - POSTAL_WIDTH;
  const logoX = MARGIN + 8;
  const logoY = topY - 72;
  if (logo) {
    const scale = Math.min(58 / logo.width, 56 / logo.height);
    const width = logo.width * scale;
    const height = logo.height * scale;
    page.drawImage(logo, { x: logoX + (66 - width) / 2, y: logoY + (64 - height) / 2, width, height });
  }

  let schoolFontSize = header.schoolNameFont === "old_english" ? 19 : 16;
  while (schoolFontSize > 11 && schoolNameFont.widthOfTextAtSize(header.schoolName, schoolFontSize) > centreWidth - 8) {
    schoolFontSize -= 0.5;
  }
  drawOfficialDocumentPdfCentered(page, schoolNameFont, header.schoolName, schoolFontSize, centreX, centreWidth, topY - 22);
  if (header.formerName) drawOfficialDocumentPdfCentered(page, regular, `(${header.formerName})`, 6.8, centreX, centreWidth, topY - 34);
  header.contactLines.slice(0, 4).forEach((line, index) => {
    drawOfficialDocumentPdfCentered(page, regular, line.text, 5.8, centreX, centreWidth, topY - 47 - index * 8);
  });
  if (header.schoolEmisNumber) {
    drawOfficialDocumentPdfCentered(page, regular, `EMIS: ${header.schoolEmisNumber}`, 5.4, centreX, centreWidth, topY - 78);
  }

  const postalX = PAGE_WIDTH - MARGIN - POSTAL_WIDTH + 8;
  header.postalLines.slice(0, 3).forEach((line, index) => {
    page.drawText(fitOfficialDocumentPdfText(regular, line, 6.2, POSTAL_WIDTH - 16), {
      x: postalX,
      y: topY - 48 - index * 9,
      size: 6.2,
      font: regular,
      color: INK,
    });
  });

  return topY - OFFICIAL_DOCUMENT_PDF_HEADER_HEIGHT;
}
