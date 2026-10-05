import "server-only";

import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { OFFICIAL_DOCUMENT_PDF_GEOMETRY } from "@/features/documents/server/official-document-chrome";
import { drawOfficialDocumentPdfFooter } from "@/features/documents/server/official-document-pdf-footer";
import {
  createOfficialDocumentPdfResources,
  drawOfficialDocumentPdfHeader,
  fitOfficialDocumentPdfText,
} from "@/features/documents/server/official-document-pdf-header";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";

const { pageWidth: PAGE_WIDTH, pageHeight: PAGE_HEIGHT, margin: MARGIN } = OFFICIAL_DOCUMENT_PDF_GEOMETRY;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const INK = rgb(0.07, 0.07, 0.08);
const LINE = rgb(0.26, 0.28, 0.31);
const MUTED = rgb(0.38, 0.4, 0.44);
const SOFT = rgb(0.965, 0.97, 0.98);
const GUARDIAN_PANEL_HEIGHT = 172;
const SCHOOL_USE_BOX_WIDTH = 112;
const SCHOOL_USE_BOX_HEIGHT = 76;

export type AdmissionApplicationPdfInput = {
  header: OfficialDocumentHeaderModel;
  academicYear: number;
  generatedAt: string;
};

function centered(page: PDFPage, font: PDFFont, text: string, size: number, y: number) {
  const rendered = fitOfficialDocumentPdfText(font, text, size, CONTENT_WIDTH);
  page.drawText(rendered, {
    x: MARGIN + Math.max(0, (CONTENT_WIDTH - font.widthOfTextAtSize(rendered, size)) / 2),
    y,
    size,
    font,
    color: INK,
  });
}

function sectionTitle(page: PDFPage, font: PDFFont, title: string, y: number, x = MARGIN, width = CONTENT_WIDTH) {
  page.drawText(title.toUpperCase(), { x, y, size: 7.4, font, color: INK });
  page.drawLine({
    start: { x, y: y - 3 },
    end: { x: x + width, y: y - 3 },
    thickness: 0.65,
    color: LINE,
  });
  return y - 21;
}

function fieldLine(
  page: PDFPage,
  bold: PDFFont,
  label: string,
  x: number,
  y: number,
  width: number,
  options: { height?: number; multiline?: boolean } = {},
) {
  const size = 6.6;
  const labelText = `${label}:`;
  const labelWidth = Math.min(width * 0.48, bold.widthOfTextAtSize(labelText, size) + 11);
  page.drawText(labelText, { x, y, size, font: bold, color: INK });
  const lineStart = x + labelWidth;
  page.drawLine({
    start: { x: lineStart, y: y - 1.8 },
    end: { x: x + width, y: y - 1.8 },
    thickness: 0.45,
    color: LINE,
  });
  const height = options.height ?? 18;
  if (options.multiline) {
    page.drawLine({
      start: { x: lineStart, y: y - 13 },
      end: { x: x + width, y: y - 13 },
      thickness: 0.35,
      color: LINE,
    });
  }
  return y - height;
}

function fieldPair(
  page: PDFPage,
  bold: PDFFont,
  leftLabel: string,
  rightLabel: string,
  x: number,
  y: number,
  width: number,
  height = 17,
) {
  const pairGap = 14;
  const fieldWidth = (width - pairGap) / 2;
  fieldLine(page, bold, leftLabel, x, y, fieldWidth, { height });
  fieldLine(page, bold, rightLabel, x + fieldWidth + pairGap, y, fieldWidth, { height });
  return y - height;
}

function guardianPanel(
  page: PDFPage,
  bold: PDFFont,
  title: string,
  x: number,
  topY: number,
  width: number,
) {
  page.drawRectangle({
    x,
    y: topY - 19,
    width,
    height: 19,
    color: SOFT,
  });
  page.drawRectangle({
    x,
    y: topY - GUARDIAN_PANEL_HEIGHT,
    width,
    height: GUARDIAN_PANEL_HEIGHT,
    borderWidth: 0.55,
    borderColor: LINE,
  });
  page.drawText(title.toUpperCase(), { x: x + 7, y: topY - 13, size: 7.2, font: bold, color: INK });

  let y = topY - 31;
  const innerX = x + 7;
  const innerWidth = width - 14;
  y = fieldLine(page, bold, "Name", innerX, y, innerWidth, { height: 18 });
  y = fieldLine(page, bold, "Relationship", innerX, y, innerWidth, { height: 18 });
  y = fieldLine(page, bold, "Cellphone / contact", innerX, y, innerWidth, { height: 18 });
  y = fieldLine(page, bold, "Residential address", innerX, y, innerWidth, { height: 24, multiline: true });
  y = fieldLine(page, bold, "Postal address", innerX, y, innerWidth, { height: 24, multiline: true });
  y = fieldLine(page, bold, "Occupation", innerX, y, innerWidth, { height: 18 });
  fieldLine(page, bold, "Work telephone / number", innerX, y, innerWidth, { height: 18 });
  return topY - GUARDIAN_PANEL_HEIGHT;
}

function checkbox(page: PDFPage, font: PDFFont, label: string, x: number, y: number, maxWidth: number) {
  const box = 10;
  page.drawRectangle({ x, y: y - 1, width: box, height: box, borderWidth: 0.7, borderColor: INK });
  page.drawText(fitOfficialDocumentPdfText(font, label, 7, maxWidth - box - 8), {
    x: x + box + 5,
    y,
    size: 7,
    font,
    color: INK,
  });
}

function drawSchoolUseBox(
  page: PDFPage,
  regular: PDFFont,
  bold: PDFFont,
  x: number,
  topY: number,
) {
  page.drawRectangle({
    x,
    y: topY - SCHOOL_USE_BOX_HEIGHT,
    width: SCHOOL_USE_BOX_WIDTH,
    height: SCHOOL_USE_BOX_HEIGHT,
    borderWidth: 0.65,
    borderColor: LINE,
  });
  const title = "SCHOOL STAMP / OFFICIAL USE";
  const titleSize = 6.1;
  const titleWidth = bold.widthOfTextAtSize(title, titleSize);
  page.drawText(title, {
    x: x + Math.max(7, (SCHOOL_USE_BOX_WIDTH - titleWidth) / 2),
    y: topY - 14,
    size: titleSize,
    font: bold,
    color: INK,
  });
  const note = "Leave clear for school use";
  const noteSize = 5.4;
  const noteWidth = regular.widthOfTextAtSize(note, noteSize);
  page.drawText(note, {
    x: x + Math.max(7, (SCHOOL_USE_BOX_WIDTH - noteWidth) / 2),
    y: topY - 27,
    size: noteSize,
    font: regular,
    color: MUTED,
  });
}

export async function renderAdmissionApplicationPdf(
  input: AdmissionApplicationPdfInput,
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.header.schoolName} - Learner Application Form`);
  pdf.setAuthor("ScolaPro");
  pdf.setCreator("ScolaPro official document renderer");
  pdf.setProducer("ScolaPro");
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));

  const resources = await createOfficialDocumentPdfResources(pdf, input.header);
  const { regular, bold } = resources;
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  let y = drawOfficialDocumentPdfHeader(page, input.header, resources, PAGE_HEIGHT - MARGIN);
  y -= 15;
  centered(page, bold, "LEARNER APPLICATION FORM", 13.5, y);
  y -= 12;
  centered(page, regular, `Admission application · Academic year ${input.academicYear}`, 7.2, y);
  y -= 18;

  y = sectionTitle(page, bold, "Learner", y);

  const photoWidth = 104;
  const gap = 12;
  const learnerWidth = CONTENT_WIDTH - photoWidth - gap;
  const learnerTop = y;
  let learnerY = learnerTop;
  learnerY = fieldLine(page, bold, "Surname", MARGIN, learnerY, learnerWidth, { height: 17 });
  learnerY = fieldLine(page, bold, "First names", MARGIN, learnerY, learnerWidth, { height: 17 });
  learnerY = fieldLine(page, bold, "Preferred name", MARGIN, learnerY, learnerWidth, { height: 17 });
  learnerY = fieldPair(page, bold, "Date of birth", "Sex", MARGIN, learnerY, learnerWidth);
  learnerY = fieldLine(page, bold, "Citizenship", MARGIN, learnerY, learnerWidth, { height: 17 });
  learnerY = fieldLine(page, bold, "Home language", MARGIN, learnerY, learnerWidth, { height: 17 });
  learnerY = fieldLine(page, bold, "Current / previous school", MARGIN, learnerY, learnerWidth, { height: 17 });
  learnerY = fieldPair(page, bold, "Current / last grade", "Intended grade / year", MARGIN, learnerY, learnerWidth);

  const photoX = MARGIN + learnerWidth + gap;
  const photoHeight = 136;
  page.drawRectangle({
    x: photoX,
    y: learnerTop - photoHeight + 4,
    width: photoWidth,
    height: photoHeight,
    borderWidth: 0.75,
    borderColor: LINE,
  });
  page.drawText("LEARNER PASSPORT PHOTO", {
    x: photoX + 8,
    y: learnerTop - 18,
    size: 6.1,
    font: bold,
    color: INK,
  });
  page.drawText("Affix recent photo here", {
    x: photoX + 16,
    y: learnerTop - 72,
    size: 6.2,
    font: regular,
    color: MUTED,
  });
  page.drawText("Do not cover school use area", {
    x: photoX + 11,
    y: learnerTop - 85,
    size: 5.5,
    font: regular,
    color: MUTED,
  });

  y = Math.min(learnerY, learnerTop - photoHeight + 4) - 14;
  y = sectionTitle(page, bold, "Parent / Guardian Details", y);

  const guardianGap = 10;
  const guardianWidth = (CONTENT_WIDTH - guardianGap) / 2;
  const guardianBottom1 = guardianPanel(page, bold, "Guardian 1", MARGIN, y, guardianWidth);
  const guardianBottom2 = guardianPanel(page, bold, "Guardian 2", MARGIN + guardianWidth + guardianGap, y, guardianWidth);
  y = Math.min(guardianBottom1, guardianBottom2) - 14;

  y = sectionTitle(page, bold, "Other Information", y);
  y = fieldLine(page, bold, "Siblings at school (optional)", MARGIN, y, CONTENT_WIDTH, { height: 20 });
  y = fieldLine(page, bold, "Declarations / relevant notes", MARGIN, y, CONTENT_WIDTH, { height: 30, multiline: true });
  y -= 5;

  y = sectionTitle(page, bold, "Document Checklist", y);
  const checkLeft = MARGIN + 2;
  const checkRight = MARGIN + CONTENT_WIDTH / 2 + 8;
  checkbox(page, regular, "Birth certificate", checkLeft, y, CONTENT_WIDTH / 2 - 12);
  checkbox(page, regular, "Passport / learner photo / ID", checkRight, y, CONTENT_WIDTH / 2 - 12);
  y -= 17;
  checkbox(page, regular, "Previous report", checkLeft, y, CONTENT_WIDTH / 2 - 12);
  checkbox(page, regular, "Transfer / support documents", checkRight, y, CONTENT_WIDTH / 2 - 12);
  y -= 17;
  checkbox(page, regular, "Other school-required document", checkLeft, y, CONTENT_WIDTH / 2 - 12);
  y -= 27;

  const signatureWidth = CONTENT_WIDTH * 0.58;
  page.drawText("Guardian signature:", { x: MARGIN, y, size: 6.7, font: bold, color: INK });
  page.drawLine({
    start: { x: MARGIN + 78, y: y - 2 },
    end: { x: MARGIN + signatureWidth, y: y - 2 },
    thickness: 0.45,
    color: LINE,
  });
  const dateX = MARGIN + signatureWidth + 18;
  page.drawText("Date:", { x: dateX, y, size: 6.7, font: bold, color: INK });
  page.drawLine({
    start: { x: dateX + 29, y: y - 2 },
    end: { x: MARGIN + CONTENT_WIDTH, y: y - 2 },
    thickness: 0.45,
    color: LINE,
  });

  const schoolUseX = MARGIN + CONTENT_WIDTH - SCHOOL_USE_BOX_WIDTH;
  const schoolUseTop = y - 16;
  drawSchoolUseBox(page, regular, bold, schoolUseX, schoolUseTop);

  const disclaimerWidth = CONTENT_WIDTH - SCHOOL_USE_BOX_WIDTH - 18;
  const disclaimer = fitOfficialDocumentPdfText(
    regular,
    "Submission of this form creates an application only. Admission and enrolment are subject to school review and the governed admissions process.",
    5.5,
    disclaimerWidth,
  );
  page.drawText(disclaimer, {
    x: MARGIN,
    y: y - 28,
    size: 5.5,
    font: regular,
    color: MUTED,
  });

  drawOfficialDocumentPdfFooter({
    page,
    font: regular,
    pageNumber: 1,
    pageCount: 1,
    primaryLeft: `Blank learner application form · Academic year ${input.academicYear}`,
    secondaryLeft: `Generated ${input.generatedAt}`,
    secondaryRight: "ScolaPro official document",
  });

  return {
    bytes: await pdf.save({ useObjectStreams: false, addDefaultPage: false, objectsPerTick: 50 }),
    pageCount: 1,
  };
}
