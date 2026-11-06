import "server-only";

import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import {
  createOfficialDocumentPdfResources,
  drawOfficialDocumentPdfHeader,
} from "@/features/documents/server/official-document-pdf-header";
import type { RegisterTeacherDocument, RegisterTeacherSection, RegisterTeacherWeek } from "@/features/attendance/server/register-teacher-document";
import {
  formatRegisterTeacherBirthDate,
  formatRegisterTeacherDate,
  registerTeacherBalance,
  registerTeacherClosureLabel,
  registerTeacherTermValue,
  registerTeacherValuesFor,
} from "@/features/attendance/server/register-teacher-layout";
import {
  FULL_TERM_PAPERS,
  type FullTermPlan,
  type FullTermSheet,
} from "@/features/attendance/server/register-teacher-full-term-layout";
import { fullTermDayBasis } from "@/features/attendance/server/register-teacher-full-term";

const LINE = rgb(0.25, 0.25, 0.25);
const INK = rgb(0.08, 0.08, 0.08);
const MUTED = rgb(0.38, 0.38, 0.38);
const RED = rgb(0.64, 0.07, 0.09);
const RED_SOFT = rgb(1, 0.95, 0.95);
const GREY = rgb(0.92, 0.92, 0.92);
const PURPLE_SOFT = rgb(0.95, 0.93, 0.98);
const GREEN_SOFT = rgb(0.93, 0.96, 0.84);

function formatDate(value: string) {
  return formatRegisterTeacherDate(value);
}

function safeText(value: string) {
  return value.replaceAll("—", "-").replaceAll("–", "-").replaceAll("’", "'").replaceAll("✓", "");
}

/**
 * Actual-font wrap used when drawing. The plan uses conservative metrics, but
 * this pass guarantees that no drawn cell silently drops characters: every
 * line is emitted and the pitch is compressed only when the planned lines were
 * underestimated.
 */
function wrapWithFont(font: PDFFont, text: string, size: number, maxWidth: number) {
  const widthOf = (value: string) => font.widthOfTextAtSize(value, size);
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (widthOf(candidate) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (widthOf(word) <= maxWidth) {
      line = word;
      continue;
    }
    let chunk = "";
    for (const character of word) {
      if (chunk && widthOf(chunk + character) > maxWidth) {
        lines.push(chunk);
        chunk = character;
      } else {
        chunk += character;
      }
    }
    line = chunk;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [text];
}

function drawTextBlock(input: {
  page: PDFPage;
  font: PDFFont;
  text: string;
  x: number;
  top: number;
  width: number;
  height: number;
  size: number;
  color?: ReturnType<typeof rgb>;
  align?: "left" | "center";
}) {
  const { page, font, x, top, width, height, size, color = INK, align = "center" } = input;
  const lines = wrapWithFont(font, safeText(input.text), size, Math.max(4, width - 2));
  const pitch = Math.min(size * 1.06, height / Math.max(1, lines.length));
  const total = lines.length * pitch;
  let cursor = top - Math.max(0, (height - total) / 2) - size;
  for (const line of lines) {
    const lineWidth = font.widthOfTextAtSize(line, size);
    page.drawText(line, {
      x: align === "left" ? x + 1 : x + Math.max(0.5, (width - lineWidth) / 2),
      y: cursor,
      size,
      font,
      color,
    });
    cursor -= pitch;
  }
}

function drawCell(page: PDFPage, input: {
  x: number;
  top: number;
  width: number;
  height: number;
  fill?: ReturnType<typeof rgb>;
  borderWidth?: number;
}) {
  const { x, top, width, height, fill, borderWidth = 0.42 } = input;
  if (fill) page.drawRectangle({ x, y: top - height, width, height, color: fill });
  page.drawRectangle({ x, y: top - height, width, height, borderColor: LINE, borderWidth });
}

function weekPresent(learner: RegisterTeacherSection["learners"][number], week: RegisterTeacherWeek) {
  return week.dates.reduce((sum, day) => sum + (learner.marks[day.date] === "I" ? 1 : 0), 0);
}

function drawSheet(input: {
  page: PDFPage;
  sheet: FullTermSheet;
  document: RegisterTeacherDocument;
  header: OfficialDocumentHeaderModel;
  resources: Awaited<ReturnType<typeof createOfficialDocumentPdfResources>>;
  checkFont: PDFFont;
}) {
  const { page, sheet, document, header, resources, checkFont } = input;
  const { section, weeks } = sheet;
  const margin = sheet.margin;
  const inset = sheet.inset;
  const contentX = margin + inset;
  const contentRight = sheet.width - margin - inset;
  const contentWidth = sheet.contentWidth;
  const fullTerm = document.fullTerm;
  const includedClosingDate = fullTerm?.closingDate ?? null;
  // A term with no included teaching day is an explicit empty state even when a
  // caller supplied an in-term closing date: there is nothing to register.
  const hasIncludedDays = Boolean(includedClosingDate)
    && (fullTerm?.includedTeachingDayCount ?? 0) > 0
    && document.weeks.length > 0;
  // An explicit closing date before the first eligible day is empty *for that
  // date*, not a term without teaching days. The copy must not assert a
  // term-wide fact the calendar contradicts.
  const closingDateHasNoEligibleDay = Boolean(includedClosingDate)
    && (fullTerm?.includedTeachingDayCount ?? 0) === 0
    && (fullTerm?.termEligibleTeachingDayCount ?? 0) > 0;
  const emptyCopy = closingDateHasNoEligibleDay
    ? "No eligible teaching day falls on or before the selected closing date."
    : "The governed learner term contains no eligible teaching day.";
  // The remedy must match the diagnosis: an early closing date needs a later
  // date, not a change to the governed school calendar.
  const emptyRemedy = closingDateHasNoEligibleDay
    ? "Choose a later closing date, or open a governed school day on or before it."
    : "Configure or open a governed school day before printing.";
  let y = drawOfficialDocumentPdfHeader(page, header, resources, sheet.height - margin, {
    documentX: contentX,
    documentWidth: contentWidth,
    context: {
      title: "FULL-TERM REGISTER",
      primaryContext: `${document.gradeName} · ${document.className} · ${document.academicYear}`,
      secondaryContext: document.termName,
      summary: fullTerm?.closingDate ? `${formatDate(document.scopeStart)} - ${formatDate(fullTerm.closingDate)}` : "No eligible day",
    },
  });

  // Legend.
  const legendSize = 7;
  let legendX = contentX + 1;
  const legendY = y - 9;
  const legendPart = (text: string, font: PDFFont = resources.regular, color = MUTED) => {
    page.drawText(text, { x: legendX, y: legendY, size: legendSize, font, color });
    legendX += font.widthOfTextAtSize(text, legendSize);
  };
  legendPart("I", resources.italic, INK);
  legendPart(" = Present     ");
  legendPart("a", resources.italic, RED);
  legendPart(" = Absent     ");
  legendPart("a", resources.italic, RED);
  page.drawText("✓", { x: legendX - 0.4, y: legendY + 3.4, size: 5, font: checkFont, color: RED });
  legendX += 5;
  legendPart(" = Absent with reason     Grey = non-teaching / inactive; governed holiday or closure name appears in the attendance area");
  y -= sheet.bands.legend;

  // Provisional banner. This is the explicit certification boundary.
  // A school may open a replacement Saturday, so the included count can exceed
  // the scheduled Mon-Fri baseline; the banner states that relationship instead
  // of printing two numbers that read as an impossible total.
  const dayBasis = fullTermDayBasis(
    fullTerm?.scheduledTeachingDayCount ?? document.teachingDayCount,
    fullTerm?.includedTeachingDayCount ?? document.teachingDayCount,
  );
  const dayBasisNote = dayBasis.detail ? ` (${dayBasis.detail})` : "";
  const bannerText = hasIncludedDays
    ? `PROVISIONAL - closing ${formatDate(includedClosingDate!)} - ${fullTerm!.scheduledTeachingDayCount} scheduled school days - ${fullTerm!.includedTeachingDayCount} school-included teaching days${dayBasisNote} - ${fullTerm!.possibleLearnerDays} possible learner-days. Not a certified class register.`
    : `NO ELIGIBLE SCHOOL DAY - ${emptyCopy.charAt(0).toLowerCase()}${emptyCopy.slice(1)}`;
  drawCell(page, { x: contentX, top: y, width: contentWidth, height: sheet.bands.banner, fill: RED_SOFT, borderWidth: 0.7 });
  drawTextBlock({ page, font: resources.bold, text: bannerText, x: contentX + 4, top: y - 3, width: contentWidth - 8, height: sheet.bands.banner - 6, size: 7, color: RED, align: "left" });
  y -= sheet.bands.banner;

  // Metadata band.
  const meta = [
    ["BOYS/GIRLS:", section.label],
    ["TERM:", document.termName],
    ["CLOSING DATE:", includedClosingDate ? formatDate(includedClosingDate) : "None"],
    ["SCHOOL DAYS:", `${fullTerm?.includedTeachingDayCount ?? 0} included / ${fullTerm?.scheduledTeachingDayCount ?? document.teachingDayCount} scheduled`],
    ["POSSIBLE LEARNER-DAYS:", String(fullTerm?.possibleLearnerDays ?? 0)],
    ["REGISTER CLASS:", document.className],
    ["REGISTER TEACHER:", document.registerTeacherName],
  ] as const;
  const metaWidth = contentWidth / meta.length;
  meta.forEach(([label, value], index) => {
    const x = contentX + index * metaWidth;
    drawCell(page, { x, top: y, width: metaWidth, height: sheet.bands.meta, fill: RED_SOFT, borderWidth: 0.7 });
    drawTextBlock({ page, font: resources.bold, text: `${label} ${value}`, x: x + 3, top: y - 2, width: metaWidth - 6, height: sheet.bands.meta - 4, size: 7, color: RED, align: "left" });
  });
  y -= sheet.bands.meta;

  if (!hasIncludedDays) {
    drawCell(page, { x: contentX, top: y, width: contentWidth, height: 28 });
    drawTextBlock({ page, font: resources.regular, text: `${emptyCopy} ${emptyRemedy}`, x: contentX + 4, top: y - 4, width: contentWidth - 8, height: 20, size: 8, color: MUTED, align: "left" });
    return;
  }

  const identityWidths = sheet.identityWidths;
  const termWidths = sheet.termWidths;
  const identityTotal = identityWidths.reduce((sum, width) => sum + width, 0);
  const dayWidth = sheet.dayWidth;
  const weekTotalWidth = sheet.weekTotalWidth;
  const tableHeaderHeight = sheet.bands.tableHeader;
  const headerTop = 24;
  const headerBottom = tableHeaderHeight - headerTop;
  const tableTop = y;
  let x = contentX;

  // Three-tier heading: identity block, weekly groups with daily dates, totals.
  drawCell(page, { x, top: tableTop, width: identityWidths[0], height: tableHeaderHeight, fill: RED_SOFT });
  drawTextBlock({ page, font: resources.bold, text: "ADMIN NO.", x, top: tableTop, width: identityWidths[0], height: tableHeaderHeight, size: 7, color: RED });
  x += identityWidths[0];
  drawCell(page, { x, top: tableTop, width: identityWidths[1], height: tableHeaderHeight, fill: RED_SOFT });
  drawTextBlock({ page, font: resources.bold, text: "NO.", x, top: tableTop, width: identityWidths[1], height: tableHeaderHeight, size: 7, color: RED });
  x += identityWidths[1];
  const nameWidth = identityWidths[2] + identityWidths[3];
  drawCell(page, { x, top: tableTop, width: nameWidth, height: headerTop, fill: RED_SOFT });
  drawTextBlock({ page, font: resources.bold, text: "NAME", x, top: tableTop, width: nameWidth, height: headerTop, size: 7, color: RED });
  drawCell(page, { x, top: tableTop - headerTop, width: identityWidths[2], height: headerBottom, fill: RED_SOFT });
  drawTextBlock({ page, font: resources.bold, text: "Surname", x, top: tableTop - headerTop, width: identityWidths[2], height: headerBottom, size: 7, color: RED, align: "left" });
  drawCell(page, { x: x + identityWidths[2], top: tableTop - headerTop, width: identityWidths[3], height: headerBottom, fill: RED_SOFT });
  drawTextBlock({ page, font: resources.bold, text: "Given Names", x: x + identityWidths[2], top: tableTop - headerTop, width: identityWidths[3], height: headerBottom, size: 7, color: RED, align: "left" });
  x += nameWidth;
  drawCell(page, { x, top: tableTop, width: identityWidths[4], height: tableHeaderHeight, fill: RED_SOFT });
  drawTextBlock({ page, font: resources.bold, text: "DATE OF BIRTH", x, top: tableTop, width: identityWidths[4], height: tableHeaderHeight, size: 7, color: RED });
  x += identityWidths[4];

  for (const week of weeks) {
    const groupWidth = week.dates.length * dayWidth + weekTotalWidth;
    drawCell(page, { x, top: tableTop, width: groupWidth, height: headerTop, fill: RED_SOFT });
    drawTextBlock({ page, font: resources.bold, text: `Week Ending ${formatDate(week.weekEnding)}`, x, top: tableTop, width: groupWidth, height: headerTop, size: 7, color: RED });
    for (const day of week.dates) {
      drawCell(page, { x, top: tableTop - headerTop, width: dayWidth, height: headerBottom, fill: day.teaching ? RED_SOFT : GREY });
      drawTextBlock({ page, font: resources.bold, text: day.weekday, x, top: tableTop - headerTop, width: dayWidth, height: headerBottom / 2, size: 7, color: day.teaching ? RED : MUTED });
      drawTextBlock({ page, font: resources.bold, text: day.dayNumber, x, top: tableTop - headerTop - headerBottom / 2, width: dayWidth, height: headerBottom / 2, size: 7, color: MUTED });
      x += dayWidth;
    }
    drawCell(page, { x, top: tableTop - headerTop, width: weekTotalWidth, height: headerBottom, fill: RED_SOFT });
    drawTextBlock({ page, font: resources.bold, text: "Tot.", x, top: tableTop - headerTop, width: weekTotalWidth, height: headerBottom, size: 7, color: RED });
    x += weekTotalWidth;
  }
  const termGroupWidth = termWidths.reduce((sum, width) => sum + width, 0);
  drawCell(page, { x, top: tableTop, width: termGroupWidth, height: headerTop, fill: RED_SOFT });
  drawTextBlock({ page, font: resources.bold, text: "TOTAL PER TERM", x, top: tableTop, width: termGroupWidth, height: headerTop, size: 7, color: RED });
  ["Attend.", "Absent", "Days"].forEach((label, index) => {
    drawCell(page, { x, top: tableTop - headerTop, width: termWidths[index], height: headerBottom, fill: index === 0 ? PURPLE_SOFT : index === 1 ? RED_SOFT : GREEN_SOFT });
    drawTextBlock({ page, font: resources.bold, text: label, x, top: tableTop - headerTop, width: termWidths[index], height: headerBottom, size: 7, color: index === 1 ? RED : INK });
    x += termWidths[index];
  });
  y = tableTop - tableHeaderHeight;
  const rowBandTop = y;

  // Learner rows.
  section.learners.forEach((learner, index) => {
    x = contentX;
    const rowHeight = sheet.rowHeight;
    const identity = [
      learner.admissionNumber ?? "",
      String(index + 1),
      learner.surname,
      learner.givenNames,
      formatRegisterTeacherBirthDate(learner.dateOfBirth),
    ];
    identity.forEach((value, cellIndex) => {
      drawCell(page, { x, top: y, width: identityWidths[cellIndex], height: rowHeight });
      drawTextBlock({
        page,
        font: cellIndex === 2 || cellIndex === 3 ? resources.bold : resources.regular,
        text: value,
        x,
        top: y,
        width: identityWidths[cellIndex],
        height: rowHeight,
        size: 8,
        align: cellIndex === 2 || cellIndex === 3 ? "left" : "center",
      });
      x += identityWidths[cellIndex];
    });
    for (const week of weeks) {
      for (const day of week.dates) {
        if (!day.teaching) {
          x += dayWidth;
          continue;
        }
        const mark = learner.marks[day.date] ?? "";
        drawCell(page, { x, top: y, width: dayWidth, height: rowHeight });
        if (mark) {
          drawTextBlock({ page, font: resources.italic, text: mark, x, top: y, width: dayWidth, height: rowHeight, size: 8, color: mark === "a" ? RED : INK });
          if (mark === "a" && learner.reasonedAbsenceDates[day.date]) {
            const markWidth = resources.italic.widthOfTextAtSize(mark, 8);
            page.drawText("✓", { x: x + (dayWidth + markWidth) / 2 - 0.2, y: y - rowHeight + 9.6, size: 4.2, font: checkFont, color: RED });
          }
        }
        x += dayWidth;
      }
      drawCell(page, { x, top: y, width: weekTotalWidth, height: rowHeight, fill: RED_SOFT });
      drawTextBlock({ page, font: resources.regular, text: String(weekPresent(learner, week)), x, top: y, width: weekTotalWidth, height: rowHeight, size: 8, color: INK });
      x += weekTotalWidth;
    }
    [String(learner.termAttended), String(learner.termAbsent), String(learner.termDays)].forEach((value, termIndex) => {
      drawCell(page, { x, top: y, width: termWidths[termIndex], height: rowHeight, fill: termIndex === 0 ? PURPLE_SOFT : termIndex === 1 ? RED_SOFT : GREEN_SOFT });
      drawTextBlock({ page, font: resources.regular, text: value, x, top: y, width: termWidths[termIndex], height: rowHeight, size: 8, color: termIndex === 1 ? RED : INK });
      x += termWidths[termIndex];
    });
    y -= rowHeight;
  });

  if (sheet.empty) {
    drawCell(page, { x: contentX, top: y, width: contentWidth, height: 24 });
    drawTextBlock({ page, font: resources.regular, text: "No learners in this section.", x: contentX + 4, top: y, width: contentWidth - 8, height: 24, size: 8, color: MUTED, align: "left" });
    y -= 24;
  }

  // Governed closure columns span the learner band. A name that cannot be read
  // at the 7pt floor is indexed and carried in the band below.
  const rowBandHeight = rowBandTop - y;
  const closureByDate = new Map(sheet.closureNotes.map((note) => [note.date, note]));
  if (!sheet.empty) {
  x = contentX + identityTotal;
  for (const week of weeks) {
    for (const day of week.dates) {
      if (day.teaching) {
        x += dayWidth;
        continue;
      }
      page.drawRectangle({ x, y, width: dayWidth, height: rowBandHeight, color: GREY, borderColor: LINE, borderWidth: 0.42 });
      const note = closureByDate.get(day.date);
      if (note?.continuation) {
        drawTextBlock({ page, font: resources.bold, text: String(note.index), x, top: rowBandTop - 2, width: dayWidth, height: Math.min(rowBandHeight - 4, 14), size: 8, color: MUTED });
      } else if (note) {
        const label = registerTeacherClosureLabel(day.reason);
        const size = 7;
        const available = Math.max(4, rowBandHeight - 4);
        const rendered = safeText(label);
        page.drawText(rendered, {
          x: x + dayWidth / 2 + size * 0.34,
          y: y + Math.max(0, (available - resources.bold.widthOfTextAtSize(rendered, size)) / 2) + 2,
          size,
          font: resources.bold,
          color: MUTED,
          rotate: degrees(90),
        });
      }
      x += dayWidth;
    }
    x += weekTotalWidth;
  }
  }

  // Full closure names that could not be read in-column.
  const continuation = sheet.closureNotes.filter((note) => note.continuation);
  if (continuation.length) {
    const bandHeight = sheet.closureBandHeight;
    page.drawRectangle({ x: contentX, y: y - bandHeight, width: contentWidth, height: bandHeight, color: rgb(0.985, 0.985, 0.985), borderColor: LINE, borderWidth: 0.6 });
    let cursor = y - 6;
    page.drawText("Governed closures - full names", { x: contentX + 5, y: cursor - 7, size: 7, font: resources.bold, color: MUTED });
    cursor -= 7 + 4;
    for (const note of continuation) {
      const pitch = 7 * 1.18;
      for (const line of note.lines) {
        cursor -= pitch;
        page.drawText(line, { x: contentX + 7, y: cursor, size: 7, font: resources.regular, color: INK });
      }
      cursor -= 2;
    }
    y -= bandHeight;
  }

  // Summary rows.
  const summaryRows: Array<{ label: string; kind: "attendance" | "absence" | "possible"; fill: ReturnType<typeof rgb>; color: ReturnType<typeof rgb> }> = [
    { label: "Total number of attendances", kind: "attendance", fill: PURPLE_SOFT, color: INK },
    { label: "Total number of absentees", kind: "absence", fill: RED_SOFT, color: RED },
    { label: "Total possible attendances (daily/week = observed; term = full term)", kind: "possible", fill: GREEN_SOFT, color: INK },
  ];
  const summaryRowHeight = sheet.bands.summary / 3;
  for (const row of summaryRows) {
    x = contentX;
    drawCell(page, { x, top: y, width: identityTotal, height: summaryRowHeight, fill: row.fill });
    drawTextBlock({ page, font: resources.bold, text: row.label, x: x + 3, top: y, width: identityTotal - 6, height: summaryRowHeight, size: 7, color: row.color, align: "left" });
    x += identityTotal;
    for (const week of weeks) {
      const values = registerTeacherValuesFor(section, week, row.kind);
      values.forEach((value) => {
        drawCell(page, { x, top: y, width: dayWidth, height: summaryRowHeight, fill: row.fill });
        drawTextBlock({ page, font: resources.bold, text: value === null ? "" : String(value), x, top: y, width: dayWidth, height: summaryRowHeight, size: 8, color: row.color });
        x += dayWidth;
      });
      drawCell(page, { x, top: y, width: weekTotalWidth, height: summaryRowHeight, fill: row.fill });
      drawTextBlock({ page, font: resources.bold, text: String(values.reduce<number>((sum, value) => sum + (value ?? 0), 0)), x, top: y, width: weekTotalWidth, height: summaryRowHeight, size: 8, color: row.color });
      x += weekTotalWidth;
    }
    const termValue = registerTeacherTermValue(section, row.kind);
    const termValues = row.kind === "attendance" ? [termValue, 0, 0] : row.kind === "absence" ? [0, termValue, 0] : [0, 0, termValue];
    termValues.forEach((value, termIndex) => {
      drawCell(page, { x, top: y, width: termWidths[termIndex], height: summaryRowHeight, fill: termIndex === 0 ? PURPLE_SOFT : termIndex === 1 ? RED_SOFT : GREEN_SOFT });
      drawTextBlock({ page, font: resources.bold, text: value ? String(value) : "", x, top: y, width: termWidths[termIndex], height: summaryRowHeight, size: 8, color: termIndex === 1 ? RED : INK });
      x += termWidths[termIndex];
    });
    y -= summaryRowHeight;
  }

  const balance = registerTeacherBalance(section);
  const balanceLabel = `Present ${balance.attendance}    Absent ${balance.absence}    Projected ${balance.projected}    Observed ${balance.observed} / Full-term ${balance.possible}`;
  page.drawText(balanceLabel, {
    x: contentRight - resources.bold.widthOfTextAtSize(balanceLabel, 7) - 8,
    y: Math.max(margin, y - 11),
    size: 7,
    font: resources.bold,
    color: RED,
  });
  page.drawText(balance.reconciled ? "✓" : "!", {
    x: contentRight - 6,
    y: Math.max(margin, y - 10),
    size: 7,
    font: balance.reconciled ? checkFont : resources.bold,
    color: RED,
  });
  const foot = `${FULL_TERM_PAPERS[sheet.paper].label} - ${fullTerm?.certificationNote ?? ""} - Days = full-term possible (incl. projected)`.trim();
  page.drawText(safeText(foot), {
    x: contentX,
    y: Math.max(margin - 2, y - 20),
    size: 7,
    font: resources.regular,
    color: MUTED,
  });
}

export async function renderRegisterTeacherFullTermPdf(input: {
  header: OfficialDocumentHeaderModel;
  document: RegisterTeacherDocument;
  plan: FullTermPlan;
  logoBytes?: Uint8Array | null;
}) {
  const { header, document, plan, logoBytes } = input;
  if (!plan.fits || !plan.sheets.length) throw new Error("The full-term single-sheet plan does not fit the supported paper.");
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${header.schoolName} - ${document.className} full-term register`);
  pdf.setAuthor("ScolaPro");
  pdf.setCreator("ScolaPro full-term register renderer");
  pdf.setSubject("Full-term single-sheet register (provisional unless certified)");
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));
  const resources = await createOfficialDocumentPdfResources(pdf, header, logoBytes);
  const checkFont = await pdf.embedFont(StandardFonts.ZapfDingbats);

  for (const sheet of plan.sheets) {
    const page = pdf.addPage([sheet.width, sheet.height]);
    drawSheet({ page, sheet, document, header, resources, checkFont });
  }

  const bytes = await pdf.save({ useObjectStreams: false, addDefaultPage: false, objectsPerTick: 50 });
  return { bytes, pageCount: pdf.getPageCount() };
}
