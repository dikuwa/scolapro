import "server-only";

import { PDFDocument, degrees, rgb } from "pdf-lib";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import {
  createOfficialDocumentPdfResources,
  drawOfficialDocumentPdfHeader,
  fitOfficialDocumentPdfText,
} from "@/features/documents/server/official-document-pdf-header";
import { OFFICIAL_DOCUMENT_PDF_GEOMETRY } from "@/features/documents/server/official-document-chrome";
import {
  academicScheduleColumnWidth,
  academicScheduleHeadingOrientation,
} from "@/features/reporting/academic-schedule-column-layout";
import type { AcademicSchedulePayload } from "@/features/reporting/server/academic-schedules";
import type { AcademicScheduleIssuedLifecycle } from "@/features/reporting/server/render-academic-schedule-xlsx";

const LINE = rgb(0.18, 0.18, 0.18);
const INK = rgb(0.04, 0.04, 0.04);
const MUTED = rgb(0.35, 0.35, 0.35);
const HEADER_FILL = rgb(0.93, 0.94, 0.96);

function safeValue(value: string | number | null | undefined) {
  return String(value ?? "");
}

export async function renderAcademicSchedulePdf(
  payload: AcademicSchedulePayload,
  header: OfficialDocumentHeaderModel,
  lifecycle?: AcademicScheduleIssuedLifecycle,
  logoBytes: Uint8Array | null = null,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const resources = await createOfficialDocumentPdfResources(pdf, header, logoBytes);
  const pageWidth = OFFICIAL_DOCUMENT_PDF_GEOMETRY.pageHeight;
  const pageHeight = OFFICIAL_DOCUMENT_PDF_GEOMETRY.pageWidth;
  const margin = 24;
  const availableWidth = pageWidth - margin * 2;
  const subjectNames = (payload.subjects ?? []).map((subject) => subject.name);
  const widthUnits = payload.columns.map((column) => academicScheduleColumnWidth(column, subjectNames));
  const unitTotal = Math.max(1, widthUnits.reduce((sum, width) => sum + width, 0));
  const widths = widthUnits.map((width) => availableWidth * (width / unitTotal));
  const orientations = payload.columns.map((column) => academicScheduleHeadingOrientation(column, subjectNames));
  const headerHeight = orientations.some((orientation) => orientation === "vertical") ? 70 : 24;
  const rowHeight = 13;
  const { regular, bold } = resources;
  let pageNumber = 0;

  const headerContext = {
    title: payload.title,
    primaryContext: `${payload.grade || "Not recorded"} · ${(payload.classNames ?? []).join(", ") || "All classes in grade"} · ${payload.academicYear}`,
    secondaryContext: `${payload.periodLabel} · Basis: ${payload.basis.toUpperCase()}`,
    summary: lifecycle
      ? `Issued v${lifecycle.version} · ${lifecycle.status.toUpperCase()}`
      : `Generated ${payload.generatedAt}`,
  };

  const addPage = (continued = false) => {
    const page = pdf.addPage([pageWidth, pageHeight]);
    pageNumber += 1;
    let y = drawOfficialDocumentPdfHeader(page, header, resources, pageHeight - margin, {
      documentX: margin,
      documentWidth: availableWidth,
      context: continued ? { ...headerContext, summary: "Continued" } : headerContext,
    });
    y -= 9;
    if (!continued) {
      page.drawText("OFFICIAL SCHOOL ACADEMIC RECORD", { x: margin, y, size: 6.2, font: bold, color: INK });
      y -= 10;
    }
    const top = y;
    let x = margin;
    payload.columns.forEach((column, index) => {
      const width = widths[index];
      page.drawRectangle({ x, y: top - headerHeight, width, height: headerHeight, borderWidth: 0.55, borderColor: LINE, color: HEADER_FILL });
      if (orientations[index] === "vertical") {
        const size = 5.4;
        const text = fitOfficialDocumentPdfText(bold, column, size, headerHeight - 8);
        const textLength = bold.widthOfTextAtSize(text, size);
        page.drawText(text, {
          x: x + width / 2 + size * 0.35,
          y: top - headerHeight / 2 - textLength / 2,
          size,
          font: bold,
          color: INK,
          rotate: degrees(90),
        });
      } else {
        const size = 5.4;
        const text = fitOfficialDocumentPdfText(bold, column, size, width - 5);
        page.drawText(text, {
          x: x + 2.5,
          y: top - headerHeight / 2 - size * 0.34,
          size,
          font: bold,
          color: INK,
        });
      }
      x += width;
    });
    y = top - headerHeight;
    return { page, y };
  };

  let current = addPage(false);
  const allRows = [...payload.rows, ...(payload.footerRows ?? [])];
  allRows.forEach((row, rowIndex) => {
    if (current.y - rowHeight < margin + 28) current = addPage(true);
    let x = margin;
    payload.columns.forEach((column, columnIndex) => {
      const width = widths[columnIndex];
      current.page.drawRectangle({
        x,
        y: current.y - rowHeight,
        width,
        height: rowHeight,
        borderWidth: 0.45,
        borderColor: LINE,
      });
      const value = safeValue(row[column]);
      const centered = orientations[columnIndex] === "vertical" || /^No\.?$|^Sex$|^Rank$|^Average %$|^Overall %$/.test(column);
      const size = 5.2;
      const text = fitOfficialDocumentPdfText(regular, value, size, width - 4);
      const textWidth = regular.widthOfTextAtSize(text, size);
      current.page.drawText(text, {
        x: centered ? x + Math.max(2, (width - textWidth) / 2) : x + 2,
        y: current.y - rowHeight / 2 - size * 0.34,
        size,
        font: regular,
        color: INK,
      });
      x += width;
    });
    current.y -= rowHeight;
    if (rowIndex === payload.rows.length - 1 && payload.footerRows?.length) current.y -= 1;
  });

  if (!allRows.length) {
    current.page.drawText("No canonical rows available.", { x: margin, y: current.y - 24, size: 8, font: regular, color: MUTED });
    current.y -= 32;
  }

  if (payload.scheduleType !== "term_schedule") {
    if (current.y < margin + 100) current = addPage(true);
    current.y -= 12;
    current.page.drawText("Certification", { x: margin, y: current.y, size: 7, font: bold, color: INK });
    current.y -= 16;
    const roles = ["Class Teacher", "Principal", "Regional Director"];
    const roleWidth = availableWidth / roles.length;
    roles.forEach((role, index) => {
      const x = margin + index * roleWidth;
      current.page.drawText(role, { x, y: current.y, size: 6, font: bold, color: INK });
      current.page.drawText("Signature: ____________________", { x, y: current.y - 15, size: 5.5, font: regular, color: INK });
      current.page.drawText("Name: ________________________", { x, y: current.y - 28, size: 5.5, font: regular, color: INK });
      current.page.drawText("Date: _________________________", { x, y: current.y - 41, size: 5.5, font: regular, color: INK });
    });
  }

  for (let index = 0; index < pdf.getPageCount(); index += 1) {
    const page = pdf.getPage(index);
    page.drawLine({ start: { x: margin, y: 18 }, end: { x: pageWidth - margin, y: 18 }, thickness: 0.45, color: LINE });
    const footer = `${header.schoolName} · ${payload.academicYear} · Page ${index + 1} of ${pdf.getPageCount()}`;
    page.drawText(footer, { x: margin, y: 8, size: 4.8, font: regular, color: MUTED });
  }

  return pdf.save();
}

export function academicSchedulePdfFilename(payload: AcademicSchedulePayload, lifecycle?: AcademicScheduleIssuedLifecycle) {
  const issued = lifecycle ? `-v${lifecycle.version}-${lifecycle.status}` : "";
  const period = (payload.period ?? (payload.scheduleType === "promotion_all_terms" ? "all_terms" : "term")) === "all_terms"
    ? "all-terms"
    : `term-${payload.termNumber}`;
  return `${payload.scheduleType}-${payload.academicYear}-${period}-${payload.basis}${issued}.pdf`;
}
