import "server-only";

import QRCode from "qrcode";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import {
  OFFICIAL_DOCUMENT_PDF_GEOMETRY,
  officialDocumentPdfContentWidth,
} from "@/features/documents/server/official-document-chrome";
import {
  createOfficialDocumentPdfResources,
  drawOfficialDocumentPdfHeader,
  fitOfficialDocumentPdfText,
} from "@/features/documents/server/official-document-pdf-header";
import { drawOfficialDocumentPdfFooter } from "@/features/documents/server/official-document-pdf-footer";
import type { VerifiedRoomInventorySheet } from "@/features/room-inventory/server/verified-sheet";

const { pageWidth: PAGE_WIDTH, pageHeight: PAGE_HEIGHT, margin: MARGIN } = OFFICIAL_DOCUMENT_PDF_GEOMETRY;
const CONTENT_WIDTH = officialDocumentPdfContentWidth();
const INK = rgb(0.08, 0.08, 0.08);
const LINE = rgb(0.3, 0.3, 0.3);
const TINT = rgb(0.95, 0.95, 0.95);
const ROW_HEIGHT = 18;
const TABLE_HEADER_HEIGHT = 20;
const FOOTER_RESERVE = 42;
const widths = [22, 126, 84, 58, 34, 58, CONTENT_WIDTH - 382];

function drawCell(page: PDFPage, font: PDFFont, value: string, x: number, y: number, width: number, height: number, size = 6.2, right = false) {
  page.drawRectangle({ x, y: y - height, width, height, borderWidth: 0.45, borderColor: LINE });
  const text = fitOfficialDocumentPdfText(font, value || "—", size, width - 8);
  page.drawText(text, {
    x: right ? x + width - 4 - font.widthOfTextAtSize(text, size) : x + 4,
    y: y - 12,
    size,
    font,
    color: INK,
  });
}

function drawTableHeader(page: PDFPage, bold: PDFFont, y: number) {
  const labels = ["#", "Item", "Asset / GRN No.", "Ownership", "Qty", "Condition", "Notes / location"];
  let x = MARGIN;
  labels.forEach((label, index) => {
    const width = widths[index];
    page.drawRectangle({ x, y: y - TABLE_HEADER_HEIGHT, width, height: TABLE_HEADER_HEIGHT, color: TINT, borderWidth: 0.5, borderColor: LINE });
    page.drawText(label, { x: x + 4, y: y - 13, size: 6, font: bold, color: INK });
    x += width;
  });
  return y - TABLE_HEADER_HEIGHT;
}

export async function renderVerifiedRoomInventoryPdf(input: {
  header: OfficialDocumentHeaderModel;
  sheet: VerifiedRoomInventorySheet;
  verificationUrl: string;
  generatedAt?: string | null;
  logoBytes?: Uint8Array | null;
}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.header.schoolName} - Verified Room Inventory - ${input.sheet.roomDisplayName}`);
  pdf.setAuthor("ScolaPro");
  pdf.setCreator("ScolaPro official document renderer");
  pdf.setProducer("ScolaPro");
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));

  const resources = await createOfficialDocumentPdfResources(pdf, input.header, input.logoBytes);
  const { regular, bold } = resources;
  const pages: PDFPage[] = [];
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  const newPage = () => {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    let y = drawOfficialDocumentPdfHeader(page, input.header, resources);
    const title = "VERIFIED ROOM INVENTORY SHEET";
    const titleWidth = bold.widthOfTextAtSize(title, 12);
    page.drawText(title, { x: (PAGE_WIDTH - titleWidth) / 2, y: y - 22, size: 12, font: bold, color: INK });
    const room = fitOfficialDocumentPdfText(regular, input.sheet.roomDisplayName, 8, CONTENT_WIDTH);
    page.drawText(room, { x: MARGIN + (CONTENT_WIDTH - regular.widthOfTextAtSize(room, 8)) / 2, y: y - 35, size: 8, font: regular, color: INK });
    y -= 48;
    return { page, y };
  };

  let { page, y } = newPage();

  const classLabel = input.sheet.linkedClasses.length
    ? input.sheet.linkedClasses.map((item) => item.displayName).join(", ")
    : "None";
  const sourceLabel = input.sheet.custodian.source === "manual"
    ? "Manual override"
    : input.sheet.custodian.source === "inherited"
      ? "Home room default"
      : input.sheet.custodian.source === "ambiguous"
        ? "Shared home room"
        : "No custodian";

  const meta = [
    [`Room: ${input.sheet.roomDisplayName}`, `Block / section: ${input.sheet.blockName || "—"}`],
    [`Linked register class: ${classLabel}`, `Responsible custodian: ${input.sheet.custodian.staffName || "Not assigned"}`],
    [`Custodian source: ${sourceLabel}`, `Verified: ${input.sheet.verifiedOn} · ${input.sheet.verificationStatus.replaceAll("_", " ")}`],
  ];
  for (const [left, right] of meta) {
    page.drawText(fitOfficialDocumentPdfText(regular, left, 6.5, CONTENT_WIDTH / 2 - 8), { x: MARGIN, y, size: 6.5, font: regular, color: INK });
    page.drawText(fitOfficialDocumentPdfText(regular, right, 6.5, CONTENT_WIDTH / 2 - 8), { x: MARGIN + CONTENT_WIDTH / 2, y, size: 6.5, font: regular, color: INK });
    y -= 11;
  }
  y -= 4;
  y = drawTableHeader(page, bold, y);

  input.sheet.inventory.forEach((item, index) => {
    if (y - ROW_HEIGHT < FOOTER_RESERVE + 18) {
      ({ page, y } = newPage());
      y = drawTableHeader(page, bold, y);
    }
    let x = MARGIN;
    const values = [
      String(index + 1),
      item.itemName,
      item.assetNumber || "—",
      item.ownership,
      String(item.quantity),
      item.condition,
      item.notes || "—",
    ];
    values.forEach((value, column) => {
      drawCell(page, regular, value, x, y, widths[column], ROW_HEIGHT, 6.1, column === 0 || column === 4);
      x += widths[column];
    });
    y -= ROW_HEIGHT;
  });

  if (y < 160) ({ page, y } = newPage());
  y -= 8;
  page.drawText(`Item-line total: ${input.sheet.verifiedItemCount}`, { x: MARGIN, y, size: 7, font: bold, color: INK });
  y -= 16;
  if (input.sheet.verificationNotes) {
    page.drawText(fitOfficialDocumentPdfText(regular, `Verification note: ${input.sheet.verificationNotes}`, 6.5, CONTENT_WIDTH), { x: MARGIN, y, size: 6.5, font: regular, color: INK });
    y -= 18;
  }

  page.drawLine({ start: { x: MARGIN, y: y - 20 }, end: { x: MARGIN + 180, y: y - 20 }, thickness: 0.5, color: LINE });
  page.drawText("Responsible staff signature / date", { x: MARGIN, y: y - 30, size: 6.2, font: regular, color: INK });
  page.drawLine({ start: { x: MARGIN + 270, y: y - 20 }, end: { x: MARGIN + 450, y: y - 20 }, thickness: 0.5, color: LINE });
  page.drawText("Management verification / date", { x: MARGIN + 270, y: y - 30, size: 6.2, font: regular, color: INK });

  const qrDataUrl = await QRCode.toDataURL(input.verificationUrl, { errorCorrectionLevel: "M", margin: 1, width: 180 });
  const qrBytes = Buffer.from(qrDataUrl.split(",")[1], "base64");
  const qr = await pdf.embedPng(qrBytes);
  const qrY = Math.max(54, y - 112);
  page.drawImage(qr, { x: PAGE_WIDTH - MARGIN - 76, y: qrY, width: 72, height: 72 });
  page.drawText(fitOfficialDocumentPdfText(bold, `ScolaPro reference: ${input.sheet.scolaproReference}`, 6.6, CONTENT_WIDTH - 90), {
    x: MARGIN,
    y: qrY + 52,
    size: 6.6,
    font: bold,
    color: INK,
  });
  page.drawText(fitOfficialDocumentPdfText(regular, input.verificationUrl, 5.8, CONTENT_WIDTH - 90), {
    x: MARGIN,
    y: qrY + 38,
    size: 5.8,
    font: regular,
    color: INK,
  });

  pages.forEach((target, index) => {
    drawOfficialDocumentPdfFooter({
      page: target,
      font: regular,
      pageNumber: index + 1,
      pageCount: pages.length,
      primaryLeft: `ScolaPro verified room inventory · ${input.sheet.scolaproReference}`,
      secondaryLeft: `Generated ${generatedAt}`,
      secondaryRight: `Revision ${input.sheet.revision}`,
      clearArea: true,
    });
  });

  return { bytes: await pdf.save(), pageCount: pages.length };
}
