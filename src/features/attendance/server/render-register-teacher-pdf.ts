import "server-only";

import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import {
  createOfficialDocumentPdfResources,
  drawOfficialDocumentPdfHeader,
  fitOfficialDocumentPdfText,
} from "@/features/documents/server/official-document-pdf-header";
import type { RegisterTeacherDocument, RegisterTeacherSection, RegisterTeacherWeek } from "@/features/attendance/server/register-teacher-document";
import {
  REGISTER_TEACHER_LAYOUT,
  formatRegisterTeacherDate,
  registerTeacherBalance,
  registerTeacherClosureLabel,
  registerTeacherColumnPlan,
  registerTeacherDocumentContext,
  registerTeacherGovernanceAlert,
  registerTeacherPageJobs,
  registerTeacherTermValue,
  registerTeacherValuesFor,
  type RegisterTeacherSummaryKind,
} from "@/features/attendance/server/register-teacher-layout";

const PAGE_WIDTH = REGISTER_TEACHER_LAYOUT.pageWidth;
const PAGE_HEIGHT = REGISTER_TEACHER_LAYOUT.pageHeight;
const MARGIN = REGISTER_TEACHER_LAYOUT.margin;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LINE = rgb(0.25, 0.25, 0.25);
const INK = rgb(0.08, 0.08, 0.08);
const MUTED = rgb(0.38, 0.38, 0.38);
const RED = rgb(0.64, 0.07, 0.09);
const RED_SOFT = rgb(1, 0.95, 0.95);
const GREY = rgb(0.92, 0.92, 0.92);
const PURPLE_SOFT = rgb(0.95, 0.93, 0.98);
const GREEN_SOFT = rgb(0.93, 0.96, 0.84);
// Row pitch and band heights come from the shared layout contract, so the
// downloaded PDF has the same page density as the approved preview.
const ROW_HEIGHT = REGISTER_TEACHER_LAYOUT.rowHeight;
const HEADER_TOP = REGISTER_TEACHER_LAYOUT.tableHeaderTop;
const HEADER_BOTTOM = REGISTER_TEACHER_LAYOUT.tableHeaderBottom;
const LEGEND_HEIGHT = REGISTER_TEACHER_LAYOUT.legendHeight;
const METADATA_HEIGHT = REGISTER_TEACHER_LAYOUT.metadataHeight;
// Mirrors the preview's governed closure label (`max-height:72mm` clip).
const CLOSURE_LABEL_MAX_SIZE = 5.6;
const CLOSURE_LABEL_MIN_SIZE = 3.4;
const SPARSE_CLOSURE_BAND_HEIGHT = 28;

function formatDate(value: string) {
  return formatRegisterTeacherDate(value);
}

function drawCell(page: PDFPage, font: PDFFont, value: string, x: number, top: number, width: number, height: number, options?: { fill?: ReturnType<typeof rgb>; color?: ReturnType<typeof rgb>; align?: "left" | "center"; size?: number; borderWidth?: number }) {
  if (options?.fill) page.drawRectangle({ x, y: top - height, width, height, color: options.fill });
  page.drawRectangle({ x, y: top - height, width, height, borderColor: LINE, borderWidth: options?.borderWidth ?? 0.42 });
  if (!value) return;
  const size = options?.size ?? 5.4;
  const rendered = fitOfficialDocumentPdfText(font, value, size, Math.max(4, width - 6));
  const tx = options?.align === "left" ? x + 3 : x + Math.max(2, (width - font.widthOfTextAtSize(rendered, size)) / 2);
  page.drawText(rendered, { x: tx, y: top - height + Math.max(2.5, (height - size) / 2), size, font, color: options?.color ?? INK });
}

function drawPage(input: {
  page: PDFPage;
  header: OfficialDocumentHeaderModel;
  resources: Awaited<ReturnType<typeof createOfficialDocumentPdfResources>>;
  checkFont: PDFFont;
  document: RegisterTeacherDocument;
  section: RegisterTeacherSection;
  weeks: RegisterTeacherWeek[];
  learners: RegisterTeacherSection["learners"];
  pageNumber: number;
  pageCount: number;
}) {
  const { page, header, resources, checkFont, document, section, weeks, learners } = input;
  const context = registerTeacherDocumentContext(document);
  let y = drawOfficialDocumentPdfHeader(page, header, resources, PAGE_HEIGHT - MARGIN, {
    documentX: MARGIN,
    documentWidth: CONTENT_WIDTH,
    context,
  });

  // Match the preview's visual order: official header, legend, five-cell
  // metadata band, then the register grid.
  const legendSize = 5.6;
  const legendY = y - 7;
  let legendX = MARGIN + 2;
  const legendPart = (label: string, font: PDFFont = resources.regular, color = MUTED) => {
    page.drawText(label, { x: legendX, y: legendY, size: legendSize, font, color });
    legendX += font.widthOfTextAtSize(label, legendSize);
  };
  legendPart("I", resources.bold, INK);
  legendPart(" = Present     ");
  legendPart("a", resources.italic, RED);
  legendPart(" = Absent     ");
  legendPart("a", resources.italic, RED);
  // Keep the red reason marker immediately above and to the right of its "a".
  page.drawText("✓", { x: legendX - 0.4, y: legendY + 3.2, size: 4.5, font: checkFont, color: RED });
  legendX += 5;
  legendPart(" = Absent with reason     Grey = non-teaching / inactive; governed holiday or closure name appears in the attendance area");
  y -= LEGEND_HEIGHT;

  const meta = [
    ["BOYS/GIRLS:", section.label],
    ["TERM:", `${document.termName}${input.pageCount > 1 ? ` · Page ${input.pageNumber}/${input.pageCount}` : ""}`],
    ["TOTAL SCHOOL DAYS:", String(document.teachingDayCount)],
    ["REGISTER CLASS:", document.className],
    ["REGISTER TEACHER:", document.registerTeacherName],
  ] as const;
  const metaWidth = CONTENT_WIDTH / meta.length;
  meta.forEach(([label, value], index) => {
    const x = MARGIN + index * metaWidth;
    drawCell(page, resources.regular, "", x, y, metaWidth, 17, { fill: RED_SOFT, borderWidth: 0.8 });
    const labelSize = 5.6;
    const valueSize = 5.6;
    const labelWidth = resources.bold.widthOfTextAtSize(label, labelSize);
    // Leave a real gap between the label and its value: drawn flush they read as
    // a single crowded token and metric rounding can touch the two spans.
    const valueX = x + 4 + labelWidth + 3;
    page.drawText(label, { x: x + 4, y: y - 11, size: labelSize, font: resources.bold, color: RED });
    // The leading space keeps PDF text extraction identical to the preview's
    // `LABEL: VALUE` metadata string.
    page.drawText(fitOfficialDocumentPdfText(resources.regular, ` ${value}`, valueSize, Math.max(8, x + metaWidth - 4 - valueX)), {
      x: valueX,
      y: y - 11,
      size: valueSize,
      font: resources.regular,
      color: INK,
    });
  });
  y -= METADATA_HEIGHT;

  // Column geometry comes from the shared layout contract so the drawn PDF grid
  // matches the HTML/print preview exactly.
  const plan = registerTeacherColumnPlan(weeks);
  const identityWidths = plan.identityWidths;
  const termWidths = plan.termWidths;
  const identityTotal = identityWidths.reduce((sum, width) => sum + width, 0);
  const dayWidth = plan.dayWidth;
  // Two-tier page heading mirrors the HTML table: identity cells span both
  // bands, each weekly group has a week-ending heading above daily dates,
  // and the right-hand total-per-term group spans its three metric columns.
  const headerTop = HEADER_TOP;
  const headerBottom = HEADER_BOTTOM;
  // Closed days carry the governed holiday/closure name in the attendance area,
  // exactly like the preview's rotated `.closure-label`. They are drawn after
  // the learner rows once the full row band is known.
  const closureColumns: Array<{ x: number; width: number; label: string }> = [];
  let x = MARGIN;
  // Match the HTML three-level identity heading: NAME is a grouped heading
  // above Surname and Given Names, while the other identity columns span it.
  drawCell(page, resources.bold, "ADMIN NO.", x, y, identityWidths[0], headerTop + headerBottom,
    { fill: RED_SOFT, color: RED, size: 5 });
  x += identityWidths[0];
  drawCell(page, resources.bold, "NO.", x, y, identityWidths[1], headerTop + headerBottom,
    { fill: RED_SOFT, color: RED, size: 5 });
  x += identityWidths[1];
  const nameWidth = identityWidths[2] + identityWidths[3];
  drawCell(page, resources.bold, "NAME", x, y, nameWidth, headerTop,
    { fill: RED_SOFT, color: RED, size: 5.4 });
  drawCell(page, resources.bold, "Surname", x, y - headerTop, identityWidths[2], headerBottom,
    { fill: RED_SOFT, color: RED, size: 5.1, align: "left" });
  drawCell(page, resources.bold, "Given Names", x + identityWidths[2], y - headerTop, identityWidths[3], headerBottom,
    { fill: RED_SOFT, color: RED, size: 5.1, align: "left" });
  x += nameWidth;
  drawCell(page, resources.bold, "DATE OF BIRTH", x, y, identityWidths[4], headerTop + headerBottom,
    { fill: RED_SOFT, color: RED, size: 5 });
  x += identityWidths[4];
  for (const week of weeks) {
    const groupWidth = (week.dates.length + 1) * dayWidth;
    drawCell(page, resources.bold, "", x, y, groupWidth, headerTop, { fill: RED_SOFT, color: RED });
    const weekLabel = "Week Ending Friday";
    const weekDate = formatDate(week.weekEnding);
    const weekLabelSize = 5.2;
    const weekDateSize = 5.5;
    page.drawText(weekLabel, {
      x: x + Math.max(2, (groupWidth - resources.bold.widthOfTextAtSize(weekLabel, weekLabelSize)) / 2),
      y: y - 7,
      size: weekLabelSize,
      font: resources.bold,
      color: RED,
    });
    page.drawText(weekDate, {
      x: x + Math.max(2, (groupWidth - resources.bold.widthOfTextAtSize(weekDate, weekDateSize)) / 2),
      y: y - 14,
      size: weekDateSize,
      font: resources.bold,
      color: RED,
    });
    for (const day of week.dates) {
      // The panel is filled here and its weekday/day number are drawn as the
      // preview's two stacked lines, so teaching and closed days share one
      // daily grid in both renderers.
      drawCell(page, resources.bold, "", x, y - headerTop, dayWidth, headerBottom, {
        fill: day.teaching ? RED_SOFT : GREY,
      });
      const weekdaySize = day.teaching ? 5.2 : 4.6;
      const dayNumberSize = day.teaching ? 4 : 3.6;
      const weekdayWidth = resources.bold.widthOfTextAtSize(day.weekday, weekdaySize);
      page.drawText(day.weekday, {
        x: x + Math.max(1.5, (dayWidth - weekdayWidth) / 2),
        y: y - headerTop - headerBottom + 7.4,
        size: weekdaySize,
        font: resources.bold,
        color: day.teaching ? RED : MUTED,
      });
      const dayNumberWidth = resources.bold.widthOfTextAtSize(day.dayNumber, dayNumberSize);
      page.drawText(day.dayNumber, {
        x: x + Math.max(1.5, (dayWidth - dayNumberWidth) / 2),
        y: y - headerTop - headerBottom + 2.6,
        size: dayNumberSize,
        font: resources.bold,
        color: MUTED,
      });
      if (!day.teaching) closureColumns.push({ x, width: dayWidth, label: registerTeacherClosureLabel(day.reason) });
      x += dayWidth;
    }
    drawCell(page, resources.bold, "Tot.", x, y - headerTop, dayWidth, headerBottom,
      { fill: RED_SOFT, color: RED, size: 5 });
    x += dayWidth;
  }
  const termGroupWidth = termWidths.reduce((sum, width) => sum + width, 0);
  drawCell(page, resources.bold, "TOTAL PER TERM", x, y, termGroupWidth, headerTop,
    { fill: RED_SOFT, color: RED, size: 5.5 });
  ["Attend.", "Absent", "Days"].forEach((label, index) => {
    const fill = index === 0 ? PURPLE_SOFT : index === 1 ? RED_SOFT : GREEN_SOFT;
    drawCell(page, resources.bold, label, x, y - headerTop, termWidths[index], headerBottom,
      { fill, color: index === 1 ? RED : INK, size: 5.2 });
    x += termWidths[index];
  });
  y -= headerTop + headerBottom;
  const rowBandTop = y;

  learners.forEach((learner, index) => {
    x = MARGIN;
    const identity = [learner.admissionNumber ?? "", String(index + 1), learner.surname, learner.givenNames, learner.dateOfBirth ? formatDate(learner.dateOfBirth) : ""];
    identity.forEach((value, cellIndex) => { drawCell(page, resources.regular, value, x, y, identityWidths[cellIndex], ROW_HEIGHT, { align: cellIndex === 2 || cellIndex === 3 ? "left" : "center", size: 5.3 }); x += identityWidths[cellIndex]; });
    for (const week of weeks) {
      let weekPresent = 0;
      for (const day of week.dates) {
        const mark = learner.marks[day.date] ?? "";
        if (mark === "I") weekPresent += 1;
        const markFont = mark === "a" ? resources.italic : resources.bold;
        drawCell(page, markFont, mark, x, y, dayWidth, ROW_HEIGHT, { fill: day.teaching ? undefined : GREY, color: mark === "a" ? RED : INK, size: 7 });
        if (mark === "a" && learner.reasonedAbsenceDates[day.date]) {
          const markWidth = markFont.widthOfTextAtSize(mark, 7);
          const markX = x + (dayWidth - markWidth) / 2;
          page.drawText("✓", { x: markX + markWidth - 0.35, y: y - ROW_HEIGHT + 8.5, size: 3.8, font: checkFont, color: RED });
        }
        x += dayWidth;
      }
      drawCell(page, resources.bold, String(weekPresent), x, y, dayWidth, ROW_HEIGHT, { fill: RED_SOFT, size: 5.2 });
      x += dayWidth;
    }
    [String(learner.termAttended), String(learner.termAbsent), String(learner.termDays)].forEach((value, termIndex) => { drawCell(page, resources.bold, value, x, y, termWidths[termIndex], ROW_HEIGHT, { fill: termIndex === 0 ? PURPLE_SOFT : termIndex === 1 ? RED_SOFT : GREEN_SOFT, color: termIndex === 1 ? RED : INK, size: 5.5 }); x += termWidths[termIndex]; });
    y -= ROW_HEIGHT;
  });

  if (!learners.length) {
    drawCell(page, resources.regular, `No ${section.label.toLowerCase()} in this register section.`, MARGIN, y, CONTENT_WIDTH, SPARSE_CLOSURE_BAND_HEIGHT, { size: 6.2 });
    y -= SPARSE_CLOSURE_BAND_HEIGHT;
  } else if (rowBandTop - y < SPARSE_CLOSURE_BAND_HEIGHT && closureColumns.length) {
    // A single learner row is too short to contain a useful rotated closure
    // name. Extend the grid with a bounded blank continuation row so the full
    // governed label remains inside the attendance area instead of colliding
    // with the headings or summary rows.
    const spacerHeight = SPARSE_CLOSURE_BAND_HEIGHT - (rowBandTop - y);
    x = MARGIN;
    for (const width of identityWidths) {
      drawCell(page, resources.regular, "", x, y, width, spacerHeight);
      x += width;
    }
    for (const week of weeks) {
      for (const day of week.dates) {
        drawCell(page, resources.regular, "", x, y, dayWidth, spacerHeight, { fill: day.teaching ? undefined : GREY });
        x += dayWidth;
      }
      drawCell(page, resources.regular, "", x, y, dayWidth, spacerHeight, { fill: RED_SOFT });
      x += dayWidth;
    }
    termWidths.forEach((width, index) => {
      drawCell(page, resources.regular, "", x, y, width, spacerHeight, {
        fill: index === 0 ? PURPLE_SOFT : index === 1 ? RED_SOFT : GREEN_SOFT,
      });
      x += width;
    });
    y -= spacerHeight;
  }

  // Governed closure/holiday name inside the attendance area, rotated like the
  // preview's vertical `.closure-label`. Dense sections (the common case) draw a
  // single scaled line clipped to the row band. Sparse sections (0-2 learners)
  // have a band shorter than the minimum line, so the label wraps onto stacked
  // rotated lines inside its own attendance column instead of being dropped:
  // the full name stays associated with its date column, never overlaps learner
  // information, and never leaves the column or the printable page.
  for (const column of closureColumns) {
    const available = Math.max(4, rowBandTop - y - 4);
    let size = CLOSURE_LABEL_MAX_SIZE;
    const naturalWidth = resources.bold.widthOfTextAtSize(column.label, size);
    if (naturalWidth > available) size = Math.max(CLOSURE_LABEL_MIN_SIZE, (size * available) / Math.max(1, naturalWidth));
    const fitted = resources.bold.widthOfTextAtSize(column.label, size);
    if (fitted <= available) {
      page.drawText(column.label, {
        x: column.x + column.width / 2 + size * 0.34,
        y: y + (available - fitted) / 2 + 2,
        size,
        font: resources.bold,
        color: MUTED,
        rotate: degrees(90),
      });
      continue;
    }
    // Band too short even at the minimum size: wrap into stacked rotated lines.
    // Step the size down until the stack fits the column width; if a pathological
    // label still overflows, truncate with an ellipsis so the layout stays
    // bounded and deterministic rather than silently omitting the name.
    const columnInnerWidth = Math.max(6, column.width - 4);
    let lines: string[] = [];
    let stackPitch = 0;
    for (const candidateSize of [CLOSURE_LABEL_MIN_SIZE, 3, 2.6]) {
      const wrapped = wrapClosureLabelLines(resources.bold, column.label, candidateSize, available);
      const pitch = candidateSize * 1.2;
      if (wrapped.length * pitch <= columnInnerWidth) {
        lines = wrapped;
        stackPitch = pitch;
        size = candidateSize;
        break;
      }
    }
    if (!lines.length) {
      size = 2.6;
      stackPitch = size * 1.2;
      const wrapped = wrapClosureLabelLines(resources.bold, column.label, size, available);
      const maxLines = Math.max(1, Math.floor(columnInnerWidth / stackPitch));
      lines = wrapped.slice(0, maxLines);
      const last = lines[lines.length - 1];
      lines[lines.length - 1] = last.endsWith("…") ? last : `${last.slice(0, -1).trimEnd()}…`;
    }
    const stackWidth = lines.length * stackPitch;
    const stackStartX = column.x + Math.max(2, (column.width - stackWidth) / 2);
    lines.forEach((line, index) => {
      const lineWidth = resources.bold.widthOfTextAtSize(line, size);
      page.drawText(line, {
        x: stackStartX + index * stackPitch + size * 0.34,
        y: y + Math.max(0, (available - lineWidth) / 2) + 2,
        size,
        font: resources.bold,
        color: MUTED,
        rotate: degrees(90),
      });
    });
  }

  const summaryRows: Array<{ label: string; kind: RegisterTeacherSummaryKind; fill: ReturnType<typeof rgb>; color: ReturnType<typeof rgb> }> = [
    { label: "Total number of attendances", kind: "attendance", fill: PURPLE_SOFT, color: INK },
    { label: "Total number of absentees", kind: "absence", fill: RED_SOFT, color: RED },
    { label: "Total number of possible attendances", kind: "possible", fill: GREEN_SOFT, color: INK },
  ];
  for (const row of summaryRows) {
    x = MARGIN;
    drawCell(page, resources.bold, row.label, x, y, identityTotal, ROW_HEIGHT, { align: "left", fill: row.fill, color: row.color, size: 5.4 });
    x += identityTotal;
    for (const week of weeks) {
      const values = registerTeacherValuesFor(section, week, row.kind);
      values.forEach((value, index) => { drawCell(page, resources.bold, value === null ? "" : String(value), x, y, dayWidth, ROW_HEIGHT, { fill: week.dates[index].teaching ? row.fill : GREY, color: row.color, size: 5.2 }); x += dayWidth; });
      drawCell(page, resources.bold, String(values.reduce<number>((sum, value) => sum + (value ?? 0), 0)), x, y, dayWidth, ROW_HEIGHT, { fill: row.fill, color: row.color, size: 5.2 });
      x += dayWidth;
    }
    const termValue = registerTeacherTermValue(section, row.kind);
    const termValues = row.kind === "attendance" ? [termValue, 0, 0] : row.kind === "absence" ? [0, termValue, 0] : [0, 0, termValue];
    termValues.forEach((value, termIndex) => { drawCell(page, resources.bold, value ? String(value) : "", x, y, termWidths[termIndex], ROW_HEIGHT, { fill: termIndex === 0 ? PURPLE_SOFT : termIndex === 1 ? RED_SOFT : GREEN_SOFT, color: termIndex === 1 ? RED : INK, size: 5.2 }); x += termWidths[termIndex]; });
    y -= ROW_HEIGHT;
  }

  const balance = registerTeacherBalance(section);
  const balanceLabel = `Attendance ${balance.attendance}    Absence ${balance.absence}    Possible ${balance.possible}    Balance: ${balance.accounted} / ${balance.possible}`;
  const balanceSize = 6;
  const balanceX = PAGE_WIDTH - MARGIN - resources.bold.widthOfTextAtSize(balanceLabel, balanceSize) - 9;
  const balanceY = Math.max(20, y - 10);
  // The preview renders the governance flag as its own block above the balance
  // strip. Draw it on its own line so the two can never overlap.
  const governanceAlert = registerTeacherGovernanceAlert(document);
  if (governanceAlert) {
    page.drawText(fitOfficialDocumentPdfText(resources.bold, `Governance flag: ${governanceAlert}`, 5.2, CONTENT_WIDTH), {
      x: MARGIN,
      y: balanceY + 9,
      size: 5.2,
      font: resources.bold,
      color: RED,
    });
  }
  page.drawText(balanceLabel, { x: balanceX, y: balanceY, size: balanceSize, font: resources.bold, color: RED });
  page.drawText(balance.balanced ? "✓" : "!", { x: PAGE_WIDTH - MARGIN - 6, y: balanceY + 1, size: 6, font: balance.balanced ? checkFont : resources.bold, color: RED });
}

/**
 * Deterministic bounded wrap for a rotated closure label. Lines are cut at word
 * boundaries when possible and hard-split by character only when a single word
 * exceeds the limit, so no character of a governed name is ever dropped.
 */
function wrapClosureLabelLines(
  font: PDFFont,
  label: string,
  size: number,
  maxLineWidth: number,
): string[] {
  const widthOf = (text: string) => font.widthOfTextAtSize(text, size);
  const lines: string[] = [];
  let line = "";
  const flush = () => { if (line) { lines.push(line); line = ""; } };
  for (const word of label.split(" ")) {
    const candidate = line ? `${line} ${word}` : word;
    if (widthOf(candidate) <= maxLineWidth) { line = candidate; continue; }
    flush();
    if (widthOf(word) <= maxLineWidth) { line = word; continue; }
    let chunk = "";
    for (const character of word) {
      if (chunk && widthOf(chunk + character) > maxLineWidth) { lines.push(chunk); chunk = character; }
      else chunk += character;
    }
    line = chunk;
  }
  flush();
  return lines.length ? lines : [label];
}

export async function renderRegisterTeacherPdf(input: { header: OfficialDocumentHeaderModel; document: RegisterTeacherDocument; logoBytes?: Uint8Array | null }) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.header.schoolName} - ${input.document.className} register`);
  pdf.setAuthor("ScolaPro");
  pdf.setCreator("ScolaPro register renderer");
  pdf.setSubject("Issue 1234 revised register PDF layout");
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));
  const resources = await createOfficialDocumentPdfResources(pdf, input.header, input.logoBytes);
  const checkFont = await pdf.embedFont(StandardFonts.ZapfDingbats);

  for (const job of registerTeacherPageJobs(input.document)) {
    drawPage({
      page: pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
      header: input.header,
      resources,
      checkFont,
      document: input.document,
      section: job.section,
      weeks: job.weeks,
      learners: job.learners,
      pageNumber: job.pageNumber,
      pageCount: job.pageCount,
    });
  }

  const bytes = await pdf.save({ useObjectStreams: false, addDefaultPage: false, objectsPerTick: 50 });
  return { bytes, pageCount: pdf.getPageCount() };
}
