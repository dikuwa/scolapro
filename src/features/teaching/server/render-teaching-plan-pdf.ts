import "server-only";

import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { OFFICIAL_DOCUMENT_PDF_GEOMETRY, officialDocumentPdfContentWidth } from "@/features/documents/server/official-document-chrome";
import { drawOfficialDocumentPdfFooter } from "@/features/documents/server/official-document-pdf-footer";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import { createOfficialDocumentPdfResources, drawOfficialDocumentPdfCentered, drawOfficialDocumentPdfHeader, officialDocumentPdfSafeText } from "@/features/documents/server/official-document-pdf-header";
import type { TeachingPlanDocument } from "./teaching-plan-document";

const { pageWidth: PAGE_WIDTH, pageHeight: PAGE_HEIGHT, margin: MARGIN } = OFFICIAL_DOCUMENT_PDF_GEOMETRY;
const CONTENT_WIDTH = officialDocumentPdfContentWidth();
const INK = rgb(0.08, 0.08, 0.08);
const LINE = rgb(0.28, 0.28, 0.28);
const TITLE_HEIGHT = 40;
const HEADER_HEIGHT = 22;
const FOOTER_TOP = 42;

function wrap(font: PDFFont, value: string, size: number, width: number, maxLines = 8): string[] {
  const words = officialDocumentPdfSafeText(value || "-").split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) current = next;
    else {
      if (current) lines.push(current);
      current = word;
      if (lines.length >= maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (!lines.length) lines.push("-");
  return lines;
}

function drawCell(page: PDFPage, font: PDFFont, text: string, x: number, top: number, width: number, height: number, size = 5.4) {
  page.drawRectangle({ x, y: top - height, width, height, borderWidth: 0.45, borderColor: LINE });
  wrap(font, text, size, width - 7, Math.max(1, Math.floor((height - 5) / 7))).forEach((line, index) => {
    page.drawText(line, { x: x + 3.5, y: top - 10 - index * 7, size, font, color: INK });
  });
}

export async function renderTeachingPlanPdf(input: { header: OfficialDocumentHeaderModel; document: TeachingPlanDocument; view: "year-planner" | "scheme"; generatedAt: string; logoBytes?: Uint8Array | null }): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const pdf = await PDFDocument.create();
  const yearPlanner = input.view === "year-planner";
  pdf.setTitle(`${input.document.subject} ${yearPlanner ? "Year Planner" : "Scheme of Work"}`);
  pdf.setAuthor("ScolaPro"); pdf.setCreator("ScolaPro official document renderer"); pdf.setProducer("ScolaPro"); pdf.setCreationDate(new Date(0)); pdf.setModificationDate(new Date(0));
  const resources = await createOfficialDocumentPdfResources(pdf, input.header, input.logoBytes);
  const { regular, bold } = resources;
  const headings = yearPlanner
    ? ["Term", "Week", "Date range", "Topic / No.", "General Objective", "Planning note / event"]
    : ["Topic / No.", "General Objective", "Specific Objectives / Basic Competencies", "Planned Date", "Completed Date"];
  const widths = yearPlanner
    ? [55, 30, 67, 100, 150, CONTENT_WIDTH - 402]
    : [110, 135, CONTENT_WIDTH - 355, 55, 55];

  let page: PDFPage;
  let y = 0;
  const addPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = drawOfficialDocumentPdfHeader(page, input.header, resources);
    page.drawRectangle({ x: MARGIN, y: y - TITLE_HEIGHT, width: CONTENT_WIDTH, height: TITLE_HEIGHT, borderWidth: 0.55, borderColor: LINE });
    drawOfficialDocumentPdfCentered(page, bold, yearPlanner ? "Year Planner" : "Scheme of Work", 10, MARGIN, CONTENT_WIDTH, y - 14);
    drawOfficialDocumentPdfCentered(page, regular, `${input.document.subject} | ${input.document.grade} | ${input.document.academicYear} | Classes: ${input.document.classes.join(", ") || "-"}`, 6, MARGIN, CONTENT_WIDTH, y - 28);
    y -= TITLE_HEIGHT;
    let x = MARGIN;
    headings.forEach((heading, index) => { drawCell(page, bold, heading, x, y, widths[index], HEADER_HEIGHT, 5.5); x += widths[index]; });
    y -= HEADER_HEIGHT;
  };
  addPage();

  for (const row of input.document.rows) {
    const values = yearPlanner
      ? [row.term, row.week, row.dateRange, `${row.topicNumber}\n${row.topic}`, row.generalObjectives.join("; ") || "-", row.note || "-"]
      : [`${row.topicNumber}\n${row.topic}`, row.generalObjectives.join("; ") || "-", row.competencies.join("; ") || "-", row.plannedDate || "-", row.completedDate || "-"];
    const lines = values.map((value, index) => wrap(regular, value, 5.4, widths[index] - 7));
    const height = Math.max(22, Math.min(72, Math.max(...lines.map((item) => item.length)) * 7 + 6));
    if (y - height < FOOTER_TOP) addPage();
    let x = MARGIN;
    values.forEach((value, index) => { drawCell(page, regular, value, x, y, widths[index], height); x += widths[index]; });
    y -= height;
  }

  if (!input.document.rows.length) {
    drawCell(page!, regular, "No plan items available.", MARGIN, y, CONTENT_WIDTH, 34, 7);
    y -= 34;
  }

  if (yearPlanner && input.document.events.length) {
    const eventHeadingHeight = 24;
    if (y - eventHeadingHeight < FOOTER_TOP) addPage();
    drawCell(page!, bold, "Planning events and notes", MARGIN, y, CONTENT_WIDTH, eventHeadingHeight, 7);
    y -= eventHeadingHeight;

    for (const event of input.document.events) {
      const value = `${event.term} | ${event.dateRange} | ${event.title}${event.note ? ` — ${event.note}` : ""}`;
      const height = Math.max(24, Math.min(58, wrap(regular, value, 5.8, CONTENT_WIDTH - 7).length * 8 + 8));
      if (y - height < FOOTER_TOP) addPage();
      drawCell(page!, regular, value, MARGIN, y, CONTENT_WIDTH, height, 5.8);
      y -= height;
    }
  }

  const pages = pdf.getPages();
  pages.forEach((current, index) => drawOfficialDocumentPdfFooter({ page: current, font: regular, pageNumber: index + 1, pageCount: pages.length, primaryLeft: `Generated ${input.generatedAt}`, secondaryLeft: `Plan ${input.document.planId}`, primaryFontSize: 5.2, secondaryFontSize: 4.8 }));
  return { bytes: await pdf.save({ useObjectStreams: false, addDefaultPage: false, objectsPerTick: 50 }), pageCount: pages.length };
}
