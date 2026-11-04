import type {
  RegisterTeacherDocument,
  RegisterTeacherSection,
  RegisterTeacherWeek,
} from "@/features/attendance/server/register-teacher-document";
import { registerTeacherClosureLabel } from "@/features/attendance/server/register-teacher-layout";

/**
 * Shared full-term single-sheet contract.
 *
 * The weekly and paginated term outputs keep their approved A3 layout. This
 * module only plans the opt-in continuous full-term sheet: one landscape page
 * per gender, all included dates and learners, on A2 when legible and A1 when
 * A2 cannot carry the roster/text. Both the HTML and PDF renderers consume the
 * same plan so paper choice, column widths, font floors, row pitch, closure
 * decisions and totals cannot drift.
 *
 * Legibility floors are physical print points, not CSS pixels:
 *  - learner data and marks: 8pt
 *  - headings, metadata, closure text and totals: 7pt
 *  - printable inset: 32pt
 * When either axis cannot honour those floors the plan reports `fits: false`
 * and the caller must present the unchanged paginated term output with an
 * explicit notice. Nothing is clipped, truncated or silently shrunk.
 */

export const FULL_TERM_DATA_FONT = 8;
export const FULL_TERM_HEADING_FONT = 7;
export const FULL_TERM_MARGIN = 32;
export const FULL_TERM_MIN_DAY_WIDTH = 12;
export const FULL_TERM_MIN_ROW_HEIGHT = 10;
export const FULL_TERM_MAX_ROW_HEIGHT = 14.25;

export const FULL_TERM_PAPERS = Object.freeze({
  a2: Object.freeze({ key: "a2" as const, width: 1683.78, height: 1190.55, label: "A2 landscape" }),
  a1: Object.freeze({ key: "a1" as const, width: 2383.94, height: 1683.78, label: "A1 landscape" }),
});

export type FullTermPaperKey = keyof typeof FULL_TERM_PAPERS;

export type FullTermClosureNote = {
  date: string;
  /** Complete governed reason; never truncated. */
  label: string;
  /** True when the name is carried in the indexed continuation band. */
  continuation: boolean;
  index: number | null;
  /** Wrapped lines for the continuation band (empty for in-column labels). */
  lines: string[];
};

export type FullTermSheet = {
  section: RegisterTeacherSection;
  weeks: RegisterTeacherWeek[];
  paper: FullTermPaperKey;
  width: number;
  height: number;
  margin: number;
  contentWidth: number;
  contentHeight: number;
  identityWidths: readonly number[];
  termWidths: readonly number[];
  dayWidth: number;
  weekTotalWidth: number;
  attendanceColumns: number;
  rowHeight: number;
  nameLines: number;
  fonts: {
    data: number;
    heading: number;
    meta: number;
    closure: number;
  };
  bands: {
    header: number;
    legend: number;
    banner: number;
    meta: number;
    tableHeader: number;
    summary: number;
    balance: number;
    footer: number;
  };
  closureNotes: FullTermClosureNote[];
  closureBandHeight: number;
  empty: boolean;
  fits: boolean;
  reason: string | null;
};

export type FullTermPlan = {
  fits: boolean;
  paper: FullTermPaperKey | null;
  reason: string | null;
  width: number;
  height: number;
  margin: number;
  sheets: FullTermSheet[];
};

export function approxFullTermTextWidth(text: string, size: number, bold = false) {
  return text.length * size * (bold ? 0.58 : 0.54);
}

/** Deterministic word wrap shared by the HTML and PDF renderers. */
export function wrapFullTermText(text: string, size: number, maxWidth: number, bold = false) {
  const lines: string[] = [];
  let line = "";
  const widthOf = (value: string) => approxFullTermTextWidth(value, size, bold);
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

function isoDates(weeks: readonly RegisterTeacherWeek[]) {
  return weeks.flatMap((week) => week.dates);
}

/**
 * Full-term closure plan. A name that cannot be read inside its own date
 * column at the 7pt floor is indexed and carried in full in the band beneath
 * the grid. The band height is part of the fit decision, so an extremely long
 * governed closure forces the explicit paginated fallback instead of clipping.
 */
export function planFullTermClosures(input: {
  weeks: readonly RegisterTeacherWeek[];
  rowBandHeight: number;
  columnWidth: number;
  contentWidth: number;
}): { notes: FullTermClosureNote[]; bandHeight: number } {
  const { weeks, rowBandHeight, columnWidth, contentWidth } = input;
  const size = FULL_TERM_HEADING_FONT;
  const linePitch = size * 1.18;
  const availableHeight = Math.max(6, rowBandHeight - 4);
  const columnInnerWidth = Math.max(6, columnWidth - 4);
  let nextIndex = 0;
  const notes = isoDates(weeks)
    .filter((day) => !day.teaching)
    .map((day): FullTermClosureNote => {
      const label = day.reason?.trim() || "Non-teaching day";
      const compact = registerTeacherClosureLabel(day.reason);
      // Hard upper bound rather than an average: Helvetica-Bold's widest ASCII
      // advance is 0.944em, so `length * size` can never underestimate the
      // rotated label. Over-estimating only sends a name to the indexed band.
      const rotatedWidth = compact.length * size;
      const fitsInColumn = rotatedWidth <= availableHeight && size <= columnInnerWidth;
      if (fitsInColumn) {
        return { date: day.date, label, continuation: false, index: null, lines: [] };
      }
      const index = (nextIndex += 1);
      return {
        date: day.date,
        label,
        continuation: true,
        index,
        lines: wrapFullTermText(`${index}. ${day.date} - ${label}`, size, Math.max(20, contentWidth - 16), false),
      };
    });
  const continuation = notes.filter((note) => note.continuation);
  if (!continuation.length) return { notes, bandHeight: 0 };
  const body = continuation.reduce((sum, note) => sum + note.lines.length * linePitch, 0);
  const gaps = Math.max(0, continuation.length - 1) * 2;
  return { notes, bandHeight: 8 + size + 4 + body + gaps + 6 };
}

function identityPlan(section: RegisterTeacherSection, contentWidth: number) {
  const size = FULL_TERM_DATA_FONT;
  // Conservative bold advance: the PDF uses Helvetica-Bold, whose widest
  // ordinary glyphs approach this factor. Over-estimating keeps names inside
  // the planned lines instead of clipping them at print time.
  const boldWidth = (text: string) => text.length * size * 0.64;
  const surname = section.learners.reduce((max, learner) => Math.max(max, boldWidth(learner.surname)), 0);
  const given = section.learners.reduce((max, learner) => Math.max(max, boldWidth(learner.givenNames)), 0);
  const admission = section.learners.reduce((max, learner) => Math.max(max, approxFullTermTextWidth(learner.admissionNumber ?? "", size, false)), 0);
  const cap = contentWidth * 0.2;
  const surnameWidth = Math.min(Math.max(96, surname + 8), cap);
  const givenWidth = Math.min(Math.max(96, given + 8), cap);
  const adminWidth = Math.min(Math.max(50, admission + 8), 96);
  const widths = [adminWidth, 26, surnameWidth, givenWidth, 54];
  // Every name must be drawn in full. Count the lines the longest name actually
  // needs at 8pt inside its planned column so the row can grow; a name that
  // still cannot be honoured fails the fit check instead of being clipped.
  const linesFor = (text: string, width: number) => Math.max(1, Math.ceil(boldWidth(text) / Math.max(1, width - 4)));
  const nameLines = section.learners.reduce(
    (max, learner) => Math.max(max, linesFor(learner.surname, surnameWidth), linesFor(learner.givenNames, givenWidth)),
    1,
  );
  return { widths, nameLines };
}

function buildSheet(document: RegisterTeacherDocument, section: RegisterTeacherSection, paperKey: FullTermPaperKey): FullTermSheet {
  const paper = FULL_TERM_PAPERS[paperKey];
  const margin = FULL_TERM_MARGIN;
  const contentWidth = paper.width - margin * 2;
  const contentHeight = paper.height - margin * 2;
  const bands = {
    header: 92,
    legend: 22,
    banner: 24,
    meta: 30,
    tableHeader: 44,
    summary: FULL_TERM_DATA_FONT * 1.25 * 3,
    balance: 18,
    footer: 8,
  };
  const fixedHeight = Object.values(bands).reduce((sum, value) => sum + value, 0);
  const weeks = document.weeks;
  const dateColumns = weeks.reduce((count, week) => count + week.dates.length, 0);
  const totalColumns = weeks.length;
  const attendanceColumns = dateColumns + totalColumns;
  const identity = identityPlan(section, contentWidth);
  const termWidths = [46, 46, 46];
  const weekTotalWidth = 17;
  const dayWidth = (contentWidth
    - identity.widths.reduce((sum, width) => sum + width, 0)
    - termWidths.reduce((sum, width) => sum + width, 0)
    - totalColumns * weekTotalWidth) / Math.max(1, dateColumns);
  const learnerCount = section.learners.length;
  const empty = learnerCount === 0;
  const rowBandCeiling = Math.max(24, contentHeight - fixedHeight);
  const minimumRowBand = empty ? 24 : Math.max(24, learnerCount * FULL_TERM_MIN_ROW_HEIGHT);
  const candidateRowBand = Math.min(minimumRowBand, rowBandCeiling);
  const closure = planFullTermClosures({
    weeks,
    rowBandHeight: candidateRowBand,
    columnWidth: Math.max(FULL_TERM_MIN_DAY_WIDTH, dayWidth),
    contentWidth,
  });
  const availableForRows = contentHeight - fixedHeight - closure.bandHeight;
  const nameRowFloor = Math.max(
    FULL_TERM_MIN_ROW_HEIGHT,
    FULL_TERM_DATA_FONT * (identity.nameLines + 0.35),
    // The HTML renderer uses a 1.02 line-height; the row must be at least that
    // tall for every drawn name line so the preview cannot clip or expand.
    FULL_TERM_DATA_FONT * 1.03 * identity.nameLines,
  );
  const maxRowHeight = Math.max(FULL_TERM_MAX_ROW_HEIGHT, nameRowFloor);
  const rowHeight = empty
    ? 24
    : Math.max(0, Math.min(maxRowHeight, availableForRows / Math.max(1, learnerCount)));
  const fitsWidth = dayWidth >= FULL_TERM_MIN_DAY_WIDTH && weekTotalWidth >= 16 && contentWidth > 0;
  const fitsHeight = rowHeight >= nameRowFloor;
  const reason = !fitsWidth
    ? `The ${paper.label} sheet cannot fit ${attendanceColumns} date columns at the 8pt legibility floor.`
    : !fitsHeight
      ? `The ${paper.label} sheet cannot fit ${learnerCount || 1} learner row(s) and the governed closure text at the 8pt legibility floor.`
      : null;
  return {
    section,
    weeks,
    paper: paperKey,
    width: paper.width,
    height: paper.height,
    margin,
    contentWidth,
    contentHeight,
    identityWidths: identity.widths,
    termWidths,
    dayWidth,
    weekTotalWidth,
    attendanceColumns,
    rowHeight: empty ? 24 : Math.max(FULL_TERM_MIN_ROW_HEIGHT, rowHeight),
    nameLines: identity.nameLines,
    fonts: { data: FULL_TERM_DATA_FONT, heading: FULL_TERM_HEADING_FONT, meta: FULL_TERM_HEADING_FONT, closure: FULL_TERM_HEADING_FONT },
    bands,
    closureNotes: closure.notes,
    closureBandHeight: closure.bandHeight,
    empty,
    fits: Boolean(fitsWidth && fitsHeight),
    reason,
  };
}

export function planRegisterTeacherFullTerm(document: RegisterTeacherDocument, paperKey: FullTermPaperKey): FullTermPlan {
  if (!document.fullTerm) throw new Error("Full-term layout requires full-term document metadata.");
  const paper = FULL_TERM_PAPERS[paperKey];
  const sheets = document.sections.map((section) => buildSheet(document, section, paperKey));
  const failed = sheets.find((sheet) => !sheet.fits);
  return {
    fits: !failed,
    paper: failed ? null : paperKey,
    reason: failed?.reason ?? null,
    width: paper.width,
    height: paper.height,
    margin: FULL_TERM_MARGIN,
    sheets,
  };
}

/**
 * A2 first, then A1. If neither honours the floors the plan is explicitly
 * non-fitting; the caller must render the unchanged paginated term output.
 */
export function planRegisterTeacherFullTermDocument(document: RegisterTeacherDocument): FullTermPlan {
  const a2 = planRegisterTeacherFullTerm(document, "a2");
  if (a2.fits) return a2;
  const a1 = planRegisterTeacherFullTerm(document, "a1");
  if (a1.fits) return a1;
  return { ...a1, fits: false, paper: null, reason: a1.reason ?? a2.reason };
}

export function fullTermSheetContext(sheet: FullTermSheet) {
  return {
    paperLabel: FULL_TERM_PAPERS[sheet.paper].label,
    width: sheet.width,
    height: sheet.height,
    margin: sheet.margin,
  };
}
