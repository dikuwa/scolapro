import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  buildReportCardTemplateModel,
  isFailingResult,
  text,
  type ReportCardRenderInput,
  type ReportCardSubjectRow,
} from "@/features/reporting/server/report-card-template-model";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 34;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const INK = rgb(0.08, 0.08, 0.08);
const LINE = rgb(0.28, 0.28, 0.28);
const MUTED = rgb(0.38, 0.38, 0.38);

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

function drawCentered(page: PDFPage, font: PDFFont, value: unknown, size: number, x: number, width: number, y: number) {
  const safe = fitText(font, value, size, width - 6);
  const textWidth = font.widthOfTextAtSize(safe, size);
  page.drawText(safe, { x: x + Math.max(3, (width - textWidth) / 2), y, size, font, color: INK });
}

function drawCellBorder(page: PDFPage, x: number, y: number, width: number, height: number) {
  page.drawRectangle({ x, y: y - height, width, height, borderWidth: 0.55, borderColor: LINE });
}

function drawSignatureBox(page: PDFPage, regular: PDFFont, bold: PDFFont, x: number, y: number, width: number, label: string, name: string) {
  page.drawLine({ start: { x: x + 8, y: y - 27 }, end: { x: x + width - 8, y: y - 27 }, thickness: 0.6, color: LINE });
  page.drawText(label, { x: x + 8, y: y - 38, size: 6.4, font: regular, color: MUTED });
  page.drawText(fitText(bold, `${label}: ${name || "________________"}`, 6.8, width - 16), { x: x + 8, y: y - 50, size: 6.8, font: bold, color: INK });
}

function rowSubjectLabel(row: ReportCardSubjectRow): string {
  return `${row.promotional ? "" : "* "}${row.name}`;
}

async function drawSchoolLogo(pdf: PDFDocument, page: PDFPage, bytes: Uint8Array | null | undefined, x: number, y: number, width: number, height: number) {
  if (!bytes?.length) return false;
  let image;
  try {
    image = await pdf.embedPng(bytes);
  } catch {
    try {
      image = await pdf.embedJpg(bytes);
    } catch {
      return false;
    }
  }
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  page.drawImage(image, {
    x: x + (width - drawWidth) / 2,
    y: y + (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  });
  return true;
}

export async function renderReportCardPdf(input: ReportCardRenderInput): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const model = buildReportCardTemplateModel(input);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${model.schoolName} report card`);
  pdf.setAuthor("ScolaPro");
  pdf.setCreator("ScolaPro certified report-card renderer");
  pdf.setProducer("ScolaPro");
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const schoolDisplayFont = model.schoolNameFont === "old_english"
    ? await pdf.embedFont(StandardFonts.TimesRomanBold)
    : bold;

  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const headerHeight = 84;
  page.drawRectangle({ x: MARGIN, y: y - headerHeight, width: CONTENT_WIDTH, height: headerHeight, borderWidth: 0.85, borderColor: LINE });
  const logoWidth = 82;
  const postalWidth = 116;
  const centreX = MARGIN + logoWidth;
  const centreWidth = CONTENT_WIDTH - logoWidth - postalWidth;
  const logoX = MARGIN + 8;
  const logoY = y - 72;
  page.drawRectangle({ x: logoX, y: logoY, width: 66, height: 64, borderWidth: 0.4, borderColor: rgb(0.75, 0.75, 0.75) });
  const logoDrawn = await drawSchoolLogo(pdf, page, input.logoBytes, logoX + 4, logoY + 4, 58, 56);
  if (!logoDrawn) drawCentered(page, regular, model.logoStoragePath || model.logoUrl ? "School logo unavailable" : "Logo", 5.7, logoX, 66, y - 43);

  const titleSize = model.schoolNameFont === "old_english" ? 19 : 16;
  drawCentered(page, schoolDisplayFont, model.schoolName, titleSize, centreX, centreWidth, y - 22);
  if (model.formerName) drawCentered(page, regular, `(${model.formerName})`, 6.8, centreX, centreWidth, y - 34);
  const contacts = [
    model.physicalAddress,
    model.telephone ? `Tel. ${model.telephone}` : "",
    model.fax ? `Fax ${model.fax}` : "",
    model.email ? `E-mail: ${model.email}` : "",
  ].filter(Boolean);
  contacts.slice(0, 4).forEach((line, index) => {
    drawCentered(page, regular, line, 5.8, centreX, centreWidth, y - 47 - index * 8);
  });
  if (model.schoolEmisNumber) drawCentered(page, regular, `EMIS: ${model.schoolEmisNumber}`, 5.4, centreX, centreWidth, y - 78);

  const postalX = PAGE_WIDTH - MARGIN - postalWidth + 8;
  const postalLines = [model.postalAddress, model.town].filter(Boolean);
  postalLines.forEach((line, index) => {
    page.drawText(fitText(regular, line, 6.2, postalWidth - 16), { x: postalX, y: y - 48 - index * 9, size: 6.2, font: regular, color: INK });
  });
  y -= headerHeight;

  const learnerHeight = 22;
  page.drawRectangle({ x: MARGIN, y: y - learnerHeight, width: CONTENT_WIDTH, height: learnerHeight, borderWidth: 0.55, borderColor: LINE });
  const learnerText = `Learner: ${model.learnerName || "-"}${model.admissionNumber ? ` (${model.admissionNumber})` : ""}`;
  page.drawText(fitText(bold, learnerText, 7.2, CONTENT_WIDTH * 0.58), { x: MARGIN + 6, y: y - 14, size: 7.2, font: bold, color: INK });
  const reportText = `Progress Report: ${model.currentTermName} ${model.academicYear}`;
  const reportSafe = fitText(bold, reportText, 7.2, CONTENT_WIDTH * 0.4 - 8);
  page.drawText(reportSafe, { x: PAGE_WIDTH - MARGIN - bold.widthOfTextAtSize(reportSafe, 7.2) - 6, y: y - 14, size: 7.2, font: bold, color: INK });
  y -= learnerHeight;

  const classHeight = 18;
  page.drawRectangle({ x: MARGIN, y: y - classHeight, width: CONTENT_WIDTH, height: classHeight, borderWidth: 0.55, borderColor: LINE });
  page.drawText(`Grade: ${fontSafeText(bold, model.grade || "-")}`, { x: MARGIN + 6, y: y - 12, size: 6.8, font: bold, color: INK });
  page.drawText(`Class: ${fontSafeText(bold, model.registerClass || "-")}`, { x: MARGIN + 150, y: y - 12, size: 6.8, font: bold, color: INK });
  y -= classHeight;

  const detailColumns = model.showPercentages ? 3 : 2;
  const termCount = Math.max(1, model.terms.length);
  const subjectWidth = Math.min(184, Math.max(145, CONTENT_WIDTH * (termCount === 1 ? 0.42 : termCount === 2 ? 0.34 : 0.29)));
  const resultAreaWidth = CONTENT_WIDTH - subjectWidth;
  const termWidth = resultAreaWidth / termCount;
  const detailWidth = termWidth / detailColumns;
  const header1Height = 17;
  const header2Height = 15;

  drawCellBorder(page, MARGIN, y, subjectWidth, header1Height + header2Height);
  page.drawText("Subject", { x: MARGIN + 5, y: y - 20, size: 6.8, font: bold, color: INK });
  model.terms.forEach((term, termIndex) => {
    const x = MARGIN + subjectWidth + termIndex * termWidth;
    drawCellBorder(page, x, y, termWidth, header1Height);
    drawCentered(page, bold, term.name, 6.5, x, termWidth, y - 11);
    const subY = y - header1Height;
    const labels = model.showPercentages ? ["Mark", "%", "Symbol"] : ["Mark", "Symbol"];
    labels.forEach((label, detailIndex) => {
      const detailX = x + detailIndex * detailWidth;
      drawCellBorder(page, detailX, subY, detailWidth, header2Height);
      drawCentered(page, bold, label, 5.7, detailX, detailWidth, subY - 10);
    });
  });
  y -= header1Height + header2Height;

  const rows = model.subjectRows;
  const reservedBottom = 44 + 76 + 22 + 38;
  const availableForRows = Math.max(0, y - MARGIN - reservedBottom);
  const minimumRowHeight = 9.5;
  const naturalRowHeight = rows.length ? availableForRows / rows.length : 18;
  if (rows.length && naturalRowHeight < minimumRowHeight) {
    throw new Error(`Report card has ${rows.length} visible subjects, which cannot fit safely on the configured single-page PDF template.`);
  }
  const rowHeight = Math.min(18, Math.max(minimumRowHeight, naturalRowHeight));
  if (!rows.length) {
    drawCellBorder(page, MARGIN, y, CONTENT_WIDTH, 25);
    drawCentered(page, regular, "No approved results in this snapshot.", 7, MARGIN, CONTENT_WIDTH, y - 16);
    y -= 25;
  } else {
    for (const row of rows) {
      drawCellBorder(page, MARGIN, y, subjectWidth, rowHeight);
      page.drawText(fitText(regular, rowSubjectLabel(row), 6.2, subjectWidth - 8), { x: MARGIN + 4, y: y - rowHeight + 4.4, size: 6.2, font: regular, color: INK });
      model.terms.forEach((term, termIndex) => {
        const result = row.termResults.get(term.number);
        const x = MARGIN + subjectWidth + termIndex * termWidth;
        const values = model.showPercentages
          ? [result?.resultValue || "-", result?.percentageValue || "-", result?.symbol || "-"]
          : [result?.resultValue || "-", result?.symbol || "-"];
        values.forEach((value, detailIndex) => {
          const detailX = x + detailIndex * detailWidth;
          drawCellBorder(page, detailX, y, detailWidth, rowHeight);
          const valueFont = detailIndex === values.length - 1 ? bold : regular;
          drawCentered(page, valueFont, value, 6.2, detailX, detailWidth, y - rowHeight + 4.4);
          if (detailIndex === 0 && isFailingResult(result, row.minimumPassMark)) {
            const safe = fitText(valueFont, value, 6.2, detailWidth - 6);
            const width = valueFont.widthOfTextAtSize(safe, 6.2);
            const starX = detailX + (detailWidth + width) / 2 + 1;
            page.drawText("*", { x: Math.min(detailX + detailWidth - 5, starX), y: y - 5.5, size: 4.2, font: bold, color: INK });
          }
        });
      });
      y -= rowHeight;
    }
  }

  const remarksHeight = 44;
  page.drawRectangle({ x: MARGIN, y: y - remarksHeight, width: CONTENT_WIDTH, height: remarksHeight, borderWidth: 0.55, borderColor: LINE });
  page.drawText("Remarks:", { x: MARGIN + 5, y: y - 11, size: 6.5, font: bold, color: INK });
  const remark = fitText(regular, model.remarks || "", 6.6, CONTENT_WIDTH - 12);
  if (remark) page.drawText(remark, { x: MARGIN + 5, y: y - 25, size: 6.6, font: regular, color: INK });
  y -= remarksHeight;

  const signoffHeight = 76;
  const teacherWidth = CONTENT_WIDTH * 0.4;
  const centreWidth2 = CONTENT_WIDTH * 0.25;
  const principalWidth = CONTENT_WIDTH - teacherWidth - centreWidth2;
  page.drawRectangle({ x: MARGIN, y: y - signoffHeight, width: CONTENT_WIDTH, height: signoffHeight, borderWidth: 0.55, borderColor: LINE });
  page.drawLine({ start: { x: MARGIN + teacherWidth, y }, end: { x: MARGIN + teacherWidth, y: y - signoffHeight }, thickness: 0.55, color: LINE });
  page.drawLine({ start: { x: MARGIN + teacherWidth + centreWidth2, y }, end: { x: MARGIN + teacherWidth + centreWidth2, y: y - signoffHeight }, thickness: 0.55, color: LINE });
  drawSignatureBox(page, regular, bold, MARGIN, y, teacherWidth, "Register Teacher", model.registerTeacherName);
  const centreX2 = MARGIN + teacherWidth;
  drawCentered(page, regular, "Days Absent", 6, centreX2, centreWidth2, y - 17);
  drawCentered(page, bold, model.absentDays || "0", 9, centreX2, centreWidth2, y - 31);
  if (model.nextTermStartsOn) {
    drawCentered(page, regular, "School re-opens / next term", 5.5, centreX2, centreWidth2, y - 49);
    drawCentered(page, bold, model.nextTermStartsOn, 6.3, centreX2, centreWidth2, y - 61);
  }
  const principalX = centreX2 + centreWidth2;
  drawSignatureBox(page, regular, bold, principalX, y, principalWidth, "Principal", model.principalName);
  drawCentered(page, regular, "School Stamp", 5.8, principalX, principalWidth, y - 69);
  y -= signoffHeight;

  const legendHeight = 22;
  page.drawRectangle({ x: MARGIN, y: y - legendHeight, width: CONTENT_WIDTH, height: legendHeight, borderWidth: 0.55, borderColor: LINE });
  const legendParts: string[] = [];
  if (model.subjectRows.some((row) => !row.promotional)) legendParts.push("* Non-promotional subject");
  if (model.showPassMarkLegend && model.subjectRows.some((row) => row.minimumPassMark !== null)) legendParts.push("Raised * beside a mark = below configured subject pass mark");
  page.drawText(fitText(regular, legendParts.join("     ") || " ", 5.6, CONTENT_WIDTH - 10), { x: MARGIN + 5, y: y - 14, size: 5.6, font: regular, color: MUTED });

  const pages = pdf.getPages();
  pages.forEach((currentPage, index) => {
    const meta = `ScolaPro snapshot v${model.snapshotVersion} - historical marks and report rules are frozen at generation.`;
    currentPage.drawText(fitText(regular, meta, 5.2, 350), { x: MARGIN, y: 19, size: 5.2, font: regular, color: MUTED });
    const pageText = `Page ${index + 1} of ${pages.length}`;
    currentPage.drawText(pageText, { x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(pageText, 5.2), y: 19, size: 5.2, font: regular, color: MUTED });
    if (model.certifiedAt) {
      const certified = fitText(regular, `Certified ${model.certifiedAt}`, 5.2, 180);
      currentPage.drawText(certified, { x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(certified, 5.2), y: 10, size: 5.2, font: regular, color: MUTED });
    }
  });

  const bytes = await pdf.save({ useObjectStreams: false, addDefaultPage: false, objectsPerTick: 50 });
  return { bytes, pageCount: pages.length };
}
