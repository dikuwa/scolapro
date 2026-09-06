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
const PANEL = rgb(0.93, 0.95, 0.96);

function fontSafeText(font: PDFFont, value: unknown): string {
  const source = text(value)
    .replaceAll("—", "-")
    .replaceAll("–", "-")
    .replaceAll("’", "'")
    .replaceAll("“", '"')
    .replaceAll("”", '"');
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

function wrapText(font: PDFFont, value: unknown, size: number, maxWidth: number, maxLines: number): string[] {
  const source = fontSafeText(font, value).trim();
  if (!source || maxLines <= 0) return [];
  const words = source.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length >= maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length > maxLines) lines.splice(maxLines);
  if (lines.length === maxLines && words.length > lines.join(" ").split(/\s+/).length) {
    lines[lines.length - 1] = fitText(font, `${lines.at(-1) ?? ""}...`, size, maxWidth);
  }
  return lines;
}

function drawCentered(page: PDFPage, font: PDFFont, value: unknown, size: number, x: number, width: number, y: number) {
  const safe = fitText(font, value, size, width - 6);
  const textWidth = font.widthOfTextAtSize(safe, size);
  page.drawText(safe, { x: x + Math.max(3, (width - textWidth) / 2), y, size, font, color: INK });
}

function drawBox(page: PDFPage, x: number, y: number, width: number, height: number, fill = false) {
  page.drawRectangle({
    x,
    y: y - height,
    width,
    height,
    borderWidth: 0.55,
    borderColor: LINE,
    ...(fill ? { color: PANEL } : {}),
  });
}

function drawLabelValue(
  page: PDFPage,
  regular: PDFFont,
  bold: PDFFont,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
) {
  const labelText = `${label}:`;
  page.drawText(labelText, { x: x + 7, y: y - 16, size: 6.8, font: bold, color: INK });
  const labelWidth = bold.widthOfTextAtSize(labelText, 6.8);
  page.drawText(fitText(regular, value || "-", 6.8, width - labelWidth - 18), {
    x: x + 11 + labelWidth,
    y: y - 16,
    size: 6.8,
    font: regular,
    color: INK,
  });
}

function drawSignatureBox(
  page: PDFPage,
  regular: PDFFont,
  bold: PDFFont,
  x: number,
  y: number,
  width: number,
  label: string,
  name: string,
) {
  page.drawLine({ start: { x: x + 8, y: y - 26 }, end: { x: x + width - 8, y: y - 26 }, thickness: 0.6, color: LINE });
  page.drawText(label, { x: x + 8, y: y - 37, size: 6.2, font: regular, color: MUTED });
  page.drawText(fitText(bold, `${label}: ${name || "________________"}`, 6.6, width - 16), {
    x: x + 8,
    y: y - 49,
    size: 6.6,
    font: bold,
    color: INK,
  });
}

function rowSubjectLabel(row: ReportCardSubjectRow): string {
  return `${row.promotional ? "" : "* "}${row.name}`;
}

async function drawSchoolLogo(
  pdf: PDFDocument,
  page: PDFPage,
  bytes: Uint8Array | null | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
) {
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

  // Base header: render-report-card-pdf-with-school-font replaces this entire
  // region with the canonical shared official header, but keeping a complete
  // fallback makes direct renderer use deterministic and self-contained.
  const headerHeight = 84;
  drawBox(page, MARGIN, y, CONTENT_WIDTH, headerHeight);
  const logoWidth = 82;
  const postalWidth = 116;
  const centreX = MARGIN + logoWidth;
  const centreWidth = CONTENT_WIDTH - logoWidth - postalWidth;
  const logoX = MARGIN + 8;
  const logoY = y - 72;
  const logoDrawn = await drawSchoolLogo(pdf, page, input.logoBytes, logoX + 4, logoY + 4, 58, 56);
  if (!logoDrawn) drawCentered(page, regular, model.logoStoragePath || model.logoUrl ? "School logo" : "Logo", 5.5, logoX, 66, y - 43);
  drawCentered(page, schoolDisplayFont, model.schoolName, model.schoolNameFont === "old_english" ? 19 : 16, centreX, centreWidth, y - 22);
  if (model.formerName) drawCentered(page, regular, `(${model.formerName})`, 6.5, centreX, centreWidth, y - 34);
  const contacts = [
    model.physicalAddress,
    model.telephone ? `Tel. ${model.telephone}` : "",
    model.fax ? `Fax ${model.fax}` : "",
    model.email ? `E-mail: ${model.email}` : "",
  ].filter(Boolean);
  contacts.slice(0, 4).forEach((line, index) => drawCentered(page, regular, line, 5.7, centreX, centreWidth, y - 47 - index * 8));
  if (model.schoolEmisNumber) drawCentered(page, regular, `EMIS: ${model.schoolEmisNumber}`, 5.3, centreX, centreWidth, y - 78);
  const postalX = PAGE_WIDTH - MARGIN - postalWidth + 8;
  [model.postalAddress, model.town].filter(Boolean).forEach((line, index) => {
    page.drawText(fitText(regular, line, 6.1, postalWidth - 16), { x: postalX, y: y - 48 - index * 9, size: 6.1, font: regular, color: INK });
  });
  y -= headerHeight;

  const titleHeight = 30;
  drawBox(page, MARGIN, y, CONTENT_WIDTH, titleHeight, true);
  drawCentered(page, bold, "PROGRESS REPORT", 10.5, MARGIN, CONTENT_WIDTH, y - 12);
  drawCentered(page, bold, `${model.currentTermName}${model.academicYear ? ` - ${model.academicYear}` : ""}`, 6.4, MARGIN, CONTENT_WIDTH, y - 23);
  y -= titleHeight;

  const detailHeight = 24;
  const half = CONTENT_WIDTH / 2;
  for (let row = 0; row < 2; row += 1) {
    drawBox(page, MARGIN, y, half, detailHeight);
    drawBox(page, MARGIN + half, y, half, detailHeight);
    if (row === 0) {
      drawLabelValue(page, regular, bold, MARGIN, y, half, "Learner", `${model.learnerName || "-"}${model.admissionNumber ? ` (${model.admissionNumber})` : ""}`);
      drawLabelValue(page, regular, bold, MARGIN + half, y, half, "Academic Year", model.academicYear || "-");
    } else {
      drawLabelValue(page, regular, bold, MARGIN, y, half, "Grade", model.grade || "-");
      drawLabelValue(page, regular, bold, MARGIN + half, y, half, "Class", model.registerClass || "-");
    }
    y -= detailHeight;
  }

  const detailColumns = model.showPercentages ? 3 : 2;
  const termCount = Math.max(1, model.terms.length);
  const subjectWidth = Math.min(184, Math.max(145, CONTENT_WIDTH * (termCount === 1 ? 0.42 : termCount === 2 ? 0.34 : 0.29)));
  const resultAreaWidth = CONTENT_WIDTH - subjectWidth;
  const termWidth = resultAreaWidth / termCount;
  const detailWidth = termWidth / detailColumns;
  const header1Height = 17;
  const header2Height = 15;

  drawBox(page, MARGIN, y, subjectWidth, header1Height + header2Height, true);
  page.drawText("Subject", { x: MARGIN + 5, y: y - 20, size: 6.8, font: bold, color: INK });
  model.terms.forEach((term, termIndex) => {
    const x = MARGIN + subjectWidth + termIndex * termWidth;
    drawBox(page, x, y, termWidth, header1Height, true);
    drawCentered(page, bold, term.name, 6.5, x, termWidth, y - 11);
    const subY = y - header1Height;
    const labels = model.showPercentages ? ["Mark", "%", "Grade"] : ["Mark", "Grade"];
    labels.forEach((label, detailIndex) => {
      const detailX = x + detailIndex * detailWidth;
      drawBox(page, detailX, subY, detailWidth, header2Height, true);
      drawCentered(page, bold, label, 5.7, detailX, detailWidth, subY - 10);
    });
  });
  y -= header1Height + header2Height;

  const rows = model.subjectRows;
  const reservedBottom = 18 + 48 + 70 + 68 + 35;
  const availableForRows = Math.max(0, y - MARGIN - reservedBottom);
  const minimumRowHeight = 9.2;
  const naturalRowHeight = rows.length ? availableForRows / rows.length : 18;
  if (rows.length && naturalRowHeight < minimumRowHeight) {
    throw new Error(`Report card has ${rows.length} visible subjects, which cannot fit safely on the configured single-page PDF template.`);
  }
  const rowHeight = Math.min(18, Math.max(minimumRowHeight, naturalRowHeight));

  if (!rows.length) {
    drawBox(page, MARGIN, y, CONTENT_WIDTH, 25);
    drawCentered(page, regular, "No approved results in this snapshot.", 7, MARGIN, CONTENT_WIDTH, y - 16);
    y -= 25;
  } else {
    for (const row of rows) {
      drawBox(page, MARGIN, y, subjectWidth, rowHeight);
      page.drawText(fitText(regular, rowSubjectLabel(row), 6.2, subjectWidth - 8), {
        x: MARGIN + 4,
        y: y - rowHeight + 4.4,
        size: 6.2,
        font: regular,
        color: INK,
      });
      model.terms.forEach((term, termIndex) => {
        const result = row.termResults.get(term.number);
        const x = MARGIN + subjectWidth + termIndex * termWidth;
        const values = model.showPercentages
          ? [result?.resultValue || "-", result?.percentageValue || "-", result?.symbol || "-"]
          : [result?.resultValue || "-", result?.symbol || "-"];
        values.forEach((value, detailIndex) => {
          const detailX = x + detailIndex * detailWidth;
          drawBox(page, detailX, y, detailWidth, rowHeight);
          const valueFont = detailIndex === values.length - 1 ? bold : regular;
          drawCentered(page, valueFont, value, 6.2, detailX, detailWidth, y - rowHeight + 4.4);
          if (detailIndex === 0 && isFailingResult(result, row.minimumPassMark)) {
            const safe = fitText(valueFont, value, 6.2, detailWidth - 6);
            const width = valueFont.widthOfTextAtSize(safe, 6.2);
            page.drawText("*", {
              x: Math.min(detailX + detailWidth - 5, detailX + (detailWidth + width) / 2 + 1),
              y: y - 5.5,
              size: 4.2,
              font: bold,
              color: INK,
            });
          }
        });
      });
      y -= rowHeight;
    }
  }

  const averageHeight = 18;
  drawBox(page, MARGIN, y, CONTENT_WIDTH, averageHeight);
  const averageText = `Learner Average: ${model.learnerAverage || "-"}`;
  const averageWidth = bold.widthOfTextAtSize(fontSafeText(bold, averageText), 7);
  page.drawText(fontSafeText(bold, averageText), {
    x: PAGE_WIDTH - MARGIN - averageWidth - 7,
    y: y - 12,
    size: 7,
    font: bold,
    color: INK,
  });
  y -= averageHeight;

  const remarksHeight = 48;
  drawBox(page, MARGIN, y, CONTENT_WIDTH, remarksHeight);
  page.drawRectangle({ x: MARGIN, y: y - 14, width: CONTENT_WIDTH, height: 14, color: PANEL, borderWidth: 0.55, borderColor: LINE });
  page.drawText("Remarks", { x: MARGIN + 6, y: y - 10, size: 6.5, font: bold, color: INK });
  const remarkLines = wrapText(regular, model.remarks || "", 6.5, CONTENT_WIDTH - 12, 3);
  remarkLines.forEach((line, index) => page.drawText(line, { x: MARGIN + 6, y: y - 27 - index * 8, size: 6.5, font: regular, color: INK }));
  y -= remarksHeight;

  const signoffHeight = 70;
  const teacherWidth = CONTENT_WIDTH * 0.4;
  const centreWidth2 = CONTENT_WIDTH * 0.25;
  const stampWidth = CONTENT_WIDTH - teacherWidth - centreWidth2;
  drawBox(page, MARGIN, y, teacherWidth, signoffHeight);
  drawBox(page, MARGIN + teacherWidth, y, centreWidth2, signoffHeight);
  drawBox(page, MARGIN + teacherWidth + centreWidth2, y, stampWidth, signoffHeight);
  drawSignatureBox(page, regular, bold, MARGIN, y, teacherWidth, "Register Teacher", model.registerTeacherName);
  const centreX2 = MARGIN + teacherWidth;
  drawCentered(page, regular, "Days Absent", 6, centreX2, centreWidth2, y - 16);
  drawCentered(page, bold, model.absentDays || "0", 9, centreX2, centreWidth2, y - 31);
  if (model.nextTermStartsOn) {
    drawCentered(page, regular, "School Re-Opens Next Term", 5.4, centreX2, centreWidth2, y - 48);
    drawCentered(page, bold, model.nextTermStartsOn, 6.2, centreX2, centreWidth2, y - 60);
  }
  drawCentered(page, regular, "School Stamp", 6, centreX2 + centreWidth2, stampWidth, y - 38);
  y -= signoffHeight;

  const principalLegendHeight = 68;
  const principalWidth = CONTENT_WIDTH * 0.4;
  const legendWidth = CONTENT_WIDTH - principalWidth;
  drawBox(page, MARGIN, y, principalWidth, principalLegendHeight);
  drawBox(page, MARGIN + principalWidth, y, legendWidth, principalLegendHeight);
  drawSignatureBox(page, regular, bold, MARGIN, y, principalWidth, "Principal", model.principalName);
  page.drawRectangle({ x: MARGIN + principalWidth, y: y - 14, width: legendWidth, height: 14, color: PANEL, borderWidth: 0.55, borderColor: LINE });
  page.drawText("Symbols", { x: MARGIN + principalWidth + 6, y: y - 10, size: 6.5, font: bold, color: INK });
  const legendParts: string[] = [];
  if (model.subjectRows.some((row) => !row.promotional)) legendParts.push("* Subject name = Non-promotional subject");
  if (model.showPassMarkLegend && model.subjectRows.some((row) => row.minimumPassMark !== null)) {
    legendParts.push("Mark* = Learner mark below configured subject minimum");
  }
  if (!legendParts.length) legendParts.push("No additional symbol notes for this report.");
  legendParts.slice(0, 3).forEach((line, index) => {
    page.drawText(fitText(regular, line, 5.7, legendWidth - 12), {
      x: MARGIN + principalWidth + 6,
      y: y - 27 - index * 10,
      size: 5.7,
      font: regular,
      color: MUTED,
    });
  });

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
