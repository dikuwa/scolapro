import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

type JsonRecord = Record<string, unknown>;

type RenderReportCardPdfInput = {
  schoolName: string;
  schoolEmisNumber?: string | null;
  snapshotVersion: number;
  certifiedAt?: string | null;
  dataSnapshot: JsonRecord;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BODY_SIZE = 9.5;
const SMALL_SIZE = 7.5;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function fontSafeText(font: PDFFont, value: unknown): string {
  const source = text(value).replaceAll("—", "-").replaceAll("–", "-").replaceAll("’", "'").replaceAll("“", '"').replaceAll("”", '"');
  let result = "";
  for (const char of source) {
    try {
      font.encodeText(char);
      result += char;
    } catch {
      result += "?";
    }
  }
  return result;
}

function fitText(font: PDFFont, value: unknown, size: number, maxWidth: number): string {
  const safe = fontSafeText(font, value);
  if (font.widthOfTextAtSize(safe, size) <= maxWidth) return safe;
  let output = safe;
  while (output.length > 1 && font.widthOfTextAtSize(`${output}...`, size) > maxWidth) output = output.slice(0, -1);
  return `${output}...`;
}

function drawLabelValue(page: PDFPage, fonts: { regular: PDFFont; bold: PDFFont }, label: string, value: unknown, x: number, y: number, width: number) {
  page.drawText(fontSafeText(fonts.regular, label.toUpperCase()), { x, y, size: SMALL_SIZE, font: fonts.regular, color: rgb(0.38, 0.4, 0.46) });
  page.drawText(fitText(fonts.bold, value || "-", BODY_SIZE, width), { x, y: y - 13, size: BODY_SIZE, font: fonts.bold, color: rgb(0.09, 0.1, 0.14) });
}

function drawSectionHeading(page: PDFPage, font: PDFFont, title: string, y: number) {
  page.drawText(fontSafeText(font, title), { x: MARGIN, y, size: 10.5, font, color: rgb(0.09, 0.1, 0.14) });
  page.drawLine({ start: { x: MARGIN, y: y - 5 }, end: { x: PAGE_WIDTH - MARGIN, y: y - 5 }, thickness: 1.25, color: rgb(0.28, 0.32, 0.78) });
}

export async function renderReportCardPdf(input: RenderReportCardPdfInput): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.schoolName} report card`);
  pdf.setAuthor("ScolaPro");
  pdf.setCreator("ScolaPro certified report-card renderer");
  pdf.setProducer("ScolaPro");
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };

  const snapshot = record(input.dataSnapshot);
  const learner = record(snapshot.learner);
  const enrolment = record(snapshot.enrolment);
  const term = record(snapshot.term);
  const attendance = record(snapshot.attendance);
  const progression = record(snapshot.year_end_progression);
  const learnerName = [learner.first_names, learner.surname].map(text).filter(Boolean).join(" ");
  const results = Array.isArray(snapshot.results) ? snapshot.results.map(record) : [];

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const addPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
    return page;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < 66) addPage();
  };

  const schoolTitle = fontSafeText(bold, input.schoolName);
  page.drawText(schoolTitle, { x: (PAGE_WIDTH - bold.widthOfTextAtSize(schoolTitle, 16)) / 2, y, size: 16, font: bold, color: rgb(0.09, 0.1, 0.14) });
  y -= 20;
  const reportTitle = fontSafeText(bold, `${text(term.name) || `Term ${text(term.number)}`} Report Card`);
  page.drawText(reportTitle, { x: (PAGE_WIDTH - bold.widthOfTextAtSize(reportTitle, 11.5)) / 2, y, size: 11.5, font: bold, color: rgb(0.28, 0.32, 0.78) });
  y -= 15;
  if (input.schoolEmisNumber) {
    const emis = fontSafeText(regular, `EMIS: ${input.schoolEmisNumber}`);
    page.drawText(emis, { x: (PAGE_WIDTH - regular.widthOfTextAtSize(emis, SMALL_SIZE)) / 2, y, size: SMALL_SIZE, font: regular, color: rgb(0.38, 0.4, 0.46) });
    y -= 15;
  }
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.8, color: rgb(0.82, 0.83, 0.87) });
  y -= 22;

  const half = (CONTENT_WIDTH - 24) / 2;
  drawLabelValue(page, fonts, "Learner", learnerName, MARGIN, y, half);
  drawLabelValue(page, fonts, "Admission number", enrolment.admission_number, MARGIN + half + 24, y, half);
  y -= 34;
  drawLabelValue(page, fonts, "Grade", enrolment.grade, MARGIN, y, half);
  drawLabelValue(page, fonts, "Class", enrolment.register_class, MARGIN + half + 24, y, half);
  y -= 34;
  drawLabelValue(page, fonts, "Academic year", enrolment.academic_year, MARGIN, y, half);
  drawLabelValue(page, fonts, "Certified snapshot", `Version ${input.snapshotVersion}`, MARGIN + half + 24, y, half);
  y -= 42;

  drawSectionHeading(page, bold, "Academic Results", y);
  y -= 25;

  const colX = [MARGIN, MARGIN + 286, MARGIN + 356, MARGIN + 438];
  const colW = [276, 60, 72, 73];
  const drawResultsHeader = () => {
    page.drawRectangle({ x: MARGIN, y: y - 5, width: CONTENT_WIDTH, height: 20, color: rgb(0.95, 0.95, 0.98) });
    ["Subject", "Code", "Result", "Symbol"].forEach((label, index) => {
      page.drawText(label, { x: colX[index] + 4, y, size: SMALL_SIZE, font: bold, color: rgb(0.24, 0.26, 0.32) });
    });
    y -= 20;
  };
  drawResultsHeader();

  if (!results.length) {
    page.drawText("No approved results in this snapshot.", { x: MARGIN + 4, y, size: BODY_SIZE, font: regular, color: rgb(0.38, 0.4, 0.46) });
    y -= 20;
  } else {
    for (const item of results) {
      if (y < 92) {
        addPage();
        drawSectionHeading(page, bold, "Academic Results (continued)", y);
        y -= 25;
        drawResultsHeader();
      }
      const result = item.result_status === "numeric" ? item.result_value : item.result_status;
      const values = [item.subject_name, item.subject_code, result, item.symbol];
      values.forEach((value, index) => {
        page.drawText(fitText(index === 0 ? regular : bold, value || "-", BODY_SIZE, colW[index] - 8), {
          x: colX[index] + 4,
          y,
          size: BODY_SIZE,
          font: index === 0 ? regular : bold,
          color: rgb(0.09, 0.1, 0.14),
        });
      });
      page.drawLine({ start: { x: MARGIN, y: y - 5 }, end: { x: PAGE_WIDTH - MARGIN, y: y - 5 }, thickness: 0.4, color: rgb(0.86, 0.87, 0.9) });
      y -= 18;
    }
  }

  ensureSpace(100);
  y -= 10;
  drawSectionHeading(page, bold, "Attendance Summary", y);
  y -= 28;
  const attendanceItems: [string, unknown][] = [
    ["Recorded days", attendance.recorded_school_days ?? 0],
    ["Present", attendance.present ?? 0],
    ["Absent", attendance.absent ?? 0],
    ["Late", attendance.late ?? 0],
    ["Excused", attendance.excused ?? 0],
  ];
  const cardGap = 6;
  const cardWidth = (CONTENT_WIDTH - cardGap * 4) / 5;
  attendanceItems.forEach(([label, value], index) => {
    const x = MARGIN + index * (cardWidth + cardGap);
    page.drawRectangle({ x, y: y - 22, width: cardWidth, height: 34, borderWidth: 0.6, borderColor: rgb(0.82, 0.83, 0.87) });
    page.drawText(fitText(regular, label, SMALL_SIZE, cardWidth - 10), { x: x + 5, y: y + 1, size: SMALL_SIZE, font: regular, color: rgb(0.38, 0.4, 0.46) });
    page.drawText(fontSafeText(bold, value), { x: x + 5, y: y - 14, size: 11, font: bold, color: rgb(0.09, 0.1, 0.14) });
  });
  y -= 52;

  if (Object.keys(progression).length) {
    ensureSpace(70);
    drawSectionHeading(page, bold, "Year-end Progression", y);
    y -= 22;
    const progressionText = [progression.outcome, progression.rationale].map(text).filter(Boolean).join(" - ") || "Pending";
    page.drawText(fitText(regular, progressionText, BODY_SIZE, CONTENT_WIDTH), { x: MARGIN, y, size: BODY_SIZE, font: regular, color: rgb(0.09, 0.1, 0.14) });
    y -= 24;
  }

  const pages = pdf.getPages();
  pages.forEach((currentPage, index) => {
    currentPage.drawLine({ start: { x: MARGIN, y: 48 }, end: { x: PAGE_WIDTH - MARGIN, y: 48 }, thickness: 0.5, color: rgb(0.75, 0.76, 0.8) });
    currentPage.drawText("Generated from a certified ScolaPro snapshot; later rule changes do not recalculate this document.", {
      x: MARGIN,
      y: 34,
      size: 6.5,
      font: regular,
      color: rgb(0.38, 0.4, 0.46),
    });
    const pageText = `Page ${index + 1} of ${pages.length}`;
    currentPage.drawText(pageText, { x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(pageText, 6.5), y: 34, size: 6.5, font: regular, color: rgb(0.38, 0.4, 0.46) });
    if (input.certifiedAt) {
      const certified = fitText(regular, `Certified ${input.certifiedAt}`, 6.5, 160);
      currentPage.drawText(certified, { x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(certified, 6.5), y: 22, size: 6.5, font: regular, color: rgb(0.38, 0.4, 0.46) });
    }
  });

  const bytes = await pdf.save({ useObjectStreams: false, addDefaultPage: false, objectsPerTick: 50 });
  return { bytes, pageCount: pages.length };
}
