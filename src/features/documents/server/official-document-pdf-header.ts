import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFFont, type PDFPage } from "pdf-lib";
import {
  OFFICIAL_DOCUMENT_BACKDROP_OPACITY,
  OFFICIAL_DOCUMENT_BACKDROP_URL,
  OFFICIAL_DOCUMENT_PDF_GEOMETRY,
  officialDocumentPdfContentWidth,
} from "@/features/documents/server/official-document-chrome";
import { loadOfficialOldEnglishFontBytes } from "@/features/documents/server/official-document-fonts";
import { isBoundedDecodablePng } from "@/features/documents/server/official-document-png";
import {
  normalizeInternalSchoolDocumentHeaderContext,
  type InternalSchoolDocumentHeaderContext,
  type OfficialDocumentHeaderModel,
} from "@/features/documents/server/official-document-header";

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
export const INTERNAL_SCHOOL_DOCUMENT_PDF_HEADER_HEIGHT = 72;

export type OfficialDocumentPdfResources = {
  regular: PDFFont;
  bold: PDFFont;
  schoolNameFont: PDFFont;
  logo: PDFImage | null;
  coatOfArms: PDFImage | null;
  backdrop: PDFImage | null;
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

function drawRightAligned(
  page: PDFPage,
  font: PDFFont,
  value: unknown,
  size: number,
  x: number,
  width: number,
  y: number,
) {
  const rendered = fitOfficialDocumentPdfText(font, value, size, width);
  page.drawText(rendered, {
    x: x + Math.max(0, width - font.widthOfTextAtSize(rendered, size)),
    y,
    size,
    font,
    color: INK,
  });
}

async function embedOfficialDocumentLogo(
  pdf: PDFDocument,
  bytes: Uint8Array | null | undefined,
  asset: "logo" | "coat-of-arms" | "backdrop",
): Promise<PDFImage | null> {
  if (!bytes?.length) return null;

  // The bundled PNG decoder can loop forever on a truncated or geometry-mismatched
  // payload, which stalls the request and blocks the Node.js event loop (#863).
  // Prove the payload is complete before handing it over; a rejected asset falls
  // back to the JPEG path and then to "no logo" instead of hanging.
  if (isBoundedDecodablePng(bytes)) {
    try {
      return await pdf.embedPng(bytes);
    } catch {
      // Fall through: a PNG-signature asset can still be an embedded JPEG payload.
    }
  } else {
    console.warn("official document PNG asset skipped: payload is not decodable within bounds", { asset });
  }

  try {
    return await pdf.embedJpg(bytes);
  } catch {
    return null;
  }
}

async function loadPublicBrandBytes(url: string): Promise<Uint8Array | null> {
  if (!url.startsWith("/brand/")) return null;
  try {
    return new Uint8Array(await readFile(join(process.cwd(), "public", ...url.split("/").filter(Boolean))));
  } catch {
    return null;
  }
}

async function loadGovernedCoatOfArmsBytes(): Promise<Uint8Array | null> {
  return loadPublicBrandBytes("/brand/governed/namibia-coat-of-arms.png");
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
    logo: await embedOfficialDocumentLogo(
      pdf,
      logoBytes?.length ? logoBytes : await loadPublicBrandBytes(header.logoUrl),
      "logo",
    ),
    coatOfArms: header.mode === "external_correspondence"
      ? await embedOfficialDocumentLogo(pdf, await loadGovernedCoatOfArmsBytes(), "coat-of-arms")
      : null,
    backdrop: await embedOfficialDocumentLogo(pdf, await loadPublicBrandBytes(OFFICIAL_DOCUMENT_BACKDROP_URL), "backdrop"),
  };
}

function drawInternalHeader(
  page: PDFPage,
  header: OfficialDocumentHeaderModel,
  resources: OfficialDocumentPdfResources,
  topY: number,
  options: {
    context?: InternalSchoolDocumentHeaderContext;
    documentX?: number;
    documentWidth?: number;
  },
): number {
  const { regular, bold, schoolNameFont, logo } = resources;
  const x = options.documentX ?? MARGIN;
  const width = options.documentWidth ?? CONTENT_WIDTH;
  const height = INTERNAL_SCHOOL_DOCUMENT_PDF_HEADER_HEIGHT;
  const logoColumn = Math.min(LOGO_WIDTH, Math.max(54, width * 0.14));
  const contextWidth = Math.min(190, Math.max(130, width * 0.34));
  const identityX = x + logoColumn;
  const identityWidth = Math.max(90, width - logoColumn - contextWidth - 12);
  const contextX = x + width - contextWidth - 6;

  const bottomY = topY - height;
  // Shared document headers are open on the top/sides and use one strong
  // bottom rule, matching the canonical Class List/document treatment.
  page.drawLine({
    start: { x, y: bottomY },
    end: { x: x + width, y: bottomY },
    thickness: 0.75,
    color: LINE,
  });

  if (logo) {
    const maxLogoWidth = Math.max(48, logoColumn - 4);
    const scale = Math.min(maxLogoWidth / logo.width, 64 / logo.height);
    const imageWidth = logo.width * scale;
    const imageHeight = logo.height * scale;
    page.drawImage(logo, {
      x: x + Math.max(2, (logoColumn - imageWidth) / 2),
      y: topY - 4 - imageHeight,
      width: imageWidth,
      height: imageHeight,
    });
  }

  let schoolFontSize = header.schoolNameFont === "old_english" ? 17.5 : 14.5;
  while (schoolFontSize > 10 && schoolNameFont.widthOfTextAtSize(header.schoolName, schoolFontSize) > identityWidth) {
    schoolFontSize -= 0.5;
  }
  page.drawText(fitOfficialDocumentPdfText(schoolNameFont, header.schoolName, schoolFontSize, identityWidth), {
    x: identityX + 2,
    y: topY - 16,
    size: schoolFontSize,
    font: schoolNameFont,
    color: INK,
  });

  let lineY = topY - 27;
  if (header.formerName) {
    page.drawText(fitOfficialDocumentPdfText(regular, `(${header.formerName})`, 5.8, identityWidth), {
      x: identityX + 2,
      y: lineY,
      size: 5.8,
      font: regular,
      color: INK,
    });
    lineY -= 8;
  }

  header.contactLines.slice(0, 4).forEach((line) => {
    const label = `${line.label}:`;
    page.drawText(label, { x: identityX + 2, y: lineY, size: 5.7, font: bold, color: INK });
    const labelWidth = bold.widthOfTextAtSize(label, 5.7);
    page.drawText(fitOfficialDocumentPdfText(regular, line.value, 5.7, Math.max(18, identityWidth - labelWidth - 5)), {
      x: identityX + 5 + labelWidth,
      y: lineY,
      size: 5.7,
      font: regular,
      color: INK,
    });
    lineY -= 7;
  });

  if (options.context) {
    const context = normalizeInternalSchoolDocumentHeaderContext(options.context);
    drawRightAligned(page, bold, context.title, 10.2, contextX, contextWidth, topY - 17);
    let contextY = topY - 29;
    if (context.primaryContext) {
      drawRightAligned(page, regular, context.primaryContext, 6.2, contextX, contextWidth, contextY);
      contextY -= 8;
    }
    if (context.secondaryContext) {
      drawRightAligned(page, regular, context.secondaryContext, 5.9, contextX, contextWidth, contextY);
      contextY -= 8;
    }
    if (context.summary) {
      drawRightAligned(page, regular, context.summary, 5.8, contextX, contextWidth, contextY);
    }
  }

  return topY - height;
}

function drawExternalHeader(
  page: PDFPage,
  header: OfficialDocumentHeaderModel,
  resources: OfficialDocumentPdfResources,
  topY: number,
  options: {
    documentX?: number;
    documentWidth?: number;
  },
): number {
  const { regular, bold, schoolNameFont, logo, coatOfArms } = resources;
  const x = options.documentX ?? MARGIN;
  const width = options.documentWidth ?? Math.max(120, page.getWidth() - x - MARGIN);
  const externalBottomY = topY - OFFICIAL_DOCUMENT_PDF_HEADER_HEIGHT;
  const assetColumnWidth = Math.min(82, Math.max(62, width * 0.13));
  const gutter = Math.min(10, Math.max(6, width * 0.012));
  const centreX = x + assetColumnWidth + gutter;
  const centreWidth = Math.max(120, width - assetColumnWidth * 2 - gutter * 2);
  const leftAssetX = x;
  const rightAssetX = x + width - assetColumnWidth;

  page.drawLine({
    start: { x, y: externalBottomY },
    end: { x: x + width, y: externalBottomY },
    thickness: 0.75,
    color: LINE,
  });

  const drawCenteredAsset = (image: PDFImage | null, columnX: number) => {
    if (!image) return;
    const scale = Math.min(64 / image.width, 68 / image.height);
    const imageWidth = image.width * scale;
    const imageHeight = image.height * scale;
    page.drawImage(image, {
      x: columnX + Math.max(0, (assetColumnWidth - imageWidth) / 2),
      y: externalBottomY + Math.max(4, (OFFICIAL_DOCUMENT_PDF_HEADER_HEIGHT - imageHeight) / 2),
      width: imageWidth,
      height: imageHeight,
    });
  };

  drawCenteredAsset(coatOfArms, leftAssetX);
  drawCenteredAsset(logo, rightAssetX);

  let schoolFontSize = header.schoolNameFont === "old_english" ? 19 : 16;
  while (schoolFontSize > 11 && schoolNameFont.widthOfTextAtSize(header.schoolName, schoolFontSize) > centreWidth - 8) {
    schoolFontSize -= 0.5;
  }
  drawOfficialDocumentPdfCentered(page, schoolNameFont, header.schoolName, schoolFontSize, centreX, centreWidth, topY - 18.5);
  if (header.formerName) {
    drawOfficialDocumentPdfCentered(page, regular, `(${header.formerName})`, 6.5, centreX, centreWidth, topY - 30);
  }

  const contactStartY = topY - 39.5;
  header.contactLines.slice(0, 4).forEach((line, index) => {
    const size = 5.8;
    const label = `${line.label}:`;
    const gap = 2.2;
    const labelWidth = bold.widthOfTextAtSize(label, size);
    const availableValueWidth = Math.max(24, centreWidth - labelWidth - gap - 6);
    const value = fitOfficialDocumentPdfText(regular, line.value, size, availableValueWidth);
    const valueWidth = regular.widthOfTextAtSize(value, size);
    const totalWidth = labelWidth + gap + valueWidth;
    const lineX = centreX + Math.max(3, (centreWidth - totalWidth) / 2);
    const lineY = contactStartY - index * 6.2;
    page.drawText(label, { x: lineX, y: lineY, size, font: bold, color: INK });
    page.drawText(value, { x: lineX + labelWidth + gap, y: lineY, size, font: regular, color: INK });
  });

  const postalStartY = topY - 65;
  const postalLines = [
    ...header.postalLines,
    ...(header.schoolEmisNumber ? [`EMIS: ${header.schoolEmisNumber}`] : []),
  ].slice(0, 3);
  postalLines.forEach((line, index) => {
    drawOfficialDocumentPdfCentered(page, regular, line, 5.3, centreX, centreWidth, postalStartY - index * 6.1);
  });

  return externalBottomY;
}

/** Draws the canonical school identity block and returns the next content Y. */
export function drawOfficialDocumentPdfHeader(
  page: PDFPage,
  header: OfficialDocumentHeaderModel,
  resources: OfficialDocumentPdfResources,
  topY = PAGE_HEIGHT - MARGIN,
  options: {
    layout?: "standard" | "compact_left";
    context?: InternalSchoolDocumentHeaderContext;
    documentX?: number;
    documentWidth?: number;
  } = {},
): number {
  if (resources.backdrop) {
    page.drawImage(resources.backdrop, {
      x: 0,
      y: 0,
      width: page.getWidth(),
      height: page.getHeight(),
      opacity: OFFICIAL_DOCUMENT_BACKDROP_OPACITY,
    });
  }

  if (header.mode === "external_correspondence") {
    return drawExternalHeader(page, header, resources, topY, {
      documentX: options.documentX,
      documentWidth: options.documentWidth,
    });
  }
  return drawInternalHeader(page, header, resources, topY, options);
}
