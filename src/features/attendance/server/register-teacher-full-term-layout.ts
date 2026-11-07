import type {
  RegisterTeacherDocument,
  RegisterTeacherSection,
  RegisterTeacherWeek,
} from "@/features/attendance/server/register-teacher-document";

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
/** Modest nonzero horizontal inset (points) applied inside the 32pt print margin so the grid never touches the paper edge. */
export const FULL_TERM_INSET = 10;
export const FULL_TERM_MIN_DAY_WIDTH = 12;
/** Short closing-date ranges keep a readable day pitch instead of stretching cells across A2/A1. */
export const FULL_TERM_COMPACT_DAY_WIDTH = 16;
export const FULL_TERM_MIN_ROW_HEIGHT = 10;
export const FULL_TERM_MAX_ROW_HEIGHT = 14.25;

/**
 * Verified glyph advance widths (per 1000 units) for the exact Helvetica and
 * Helvetica-Bold fonts that pdf-lib embeds. The planner and the PDF renderer must
 * use identical widths, so the planner measures text with these same advances and
 * the renderer draws with the font that carries them. Any glyph not present in
 * the table (outside WinAnsi, emoji, etc.) falls back to the measured maximum
 * advance, a safe over-estimate: it can only ever reject a sheet or push a name
 * to the indexed band, never clip a line the renderer would actually draw wider.
 *
 * The previously used 0.9/0.95 average factors were *under*-estimates for wide
 * glyphs ("@" is 1.015em regular / 0.975em bold), which let the planner declare
 * a line "fits" while the rendered line overflowed the 32pt printable inset.
 * These tables were measured from the embedded font via `font.widthOfTextAtSize`
 * at size 1000, so they match the renderer exactly.
 */
export const HELVETICA_ADVANCE: Readonly<Record<string, number>> = {
  "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556, "8": 556, "9": 556,
  " ": 278, "!": 278, "\"": 355, "#": 556, "$": 556, "%": 889, "&": 667, "'": 191, "(": 333, ")": 333,
  "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278, ":": 278, ";": 278, "<": 584, "=": 584,
  ">": 584, "?": 556, "@": 1015, "A": 667, "B": 667, "C": 722, "D": 722, "E": 667, "F": 611, "G": 778,
  "H": 722, "I": 278, "J": 500, "K": 667, "L": 556, "M": 833, "N": 722, "O": 778, "P": 667, "Q": 778,
  "R": 722, "S": 667, "T": 611, "U": 722, "V": 667, "W": 944, "X": 667, "Y": 667, "Z": 611,
  "[": 278, "\\": 278, "]": 278, "^": 469, "_": 556, "`": 333,
  "a": 556, "b": 556, "c": 500, "d": 556, "e": 556, "f": 278, "g": 556, "h": 556, "i": 222, "j": 222,
  "k": 500, "l": 222, "m": 833, "n": 556, "o": 556, "p": 556, "q": 556, "r": 333, "s": 500, "t": 278,
  "u": 556, "v": 500, "w": 722, "x": 500, "y": 500, "z": 500, "{": 334, "|": 260, "}": 334, "~": 584,
  "é": 556, "è": 556, "ê": 556, "ë": 556, "ä": 556, "ö": 556, "ü": 556, "ç": 500, "ß": 611, "ñ": 556,
  "ô": 556, "â": 556, "à": 556, "î": 278, "ù": 556, "ó": 556, "ò": 556, "œ": 944, "Œ": 1000, "æ": 889, "Æ": 1000,
};

export const HELVETICA_BOLD_ADVANCE: Readonly<Record<string, number>> = {
  "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556, "8": 556, "9": 556,
  " ": 278, "!": 333, "\"": 474, "#": 556, "$": 556, "%": 889, "&": 722, "'": 238, "(": 333, ")": 333,
  "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278, ":": 333, ";": 333, "<": 584, "=": 584,
  ">": 584, "?": 611, "@": 975, "A": 722, "B": 722, "C": 722, "D": 722, "E": 667, "F": 611, "G": 778,
  "H": 722, "I": 278, "J": 556, "K": 722, "L": 611, "M": 833, "N": 722, "O": 778, "P": 667, "Q": 778,
  "R": 722, "S": 667, "T": 611, "U": 722, "V": 667, "W": 944, "X": 667, "Y": 667, "Z": 611,
  "[": 333, "\\": 278, "]": 333, "^": 584, "_": 556, "`": 333,
  "a": 556, "b": 611, "c": 556, "d": 611, "e": 556, "f": 333, "g": 611, "h": 611, "i": 278, "j": 278,
  "k": 556, "l": 278, "m": 889, "n": 611, "o": 611, "p": 611, "q": 611, "r": 389, "s": 556, "t": 333,
  "u": 611, "v": 556, "w": 778, "x": 556, "y": 556, "z": 500, "{": 389, "|": 280, "}": 389, "~": 584,
  "é": 556, "è": 556, "ê": 556, "ë": 556, "ä": 556, "ö": 611, "ü": 611, "ç": 556, "ß": 611, "ñ": 611,
  "ô": 611, "â": 556, "à": 556, "î": 278, "ù": 611, "ó": 611, "ò": 611, "œ": 944, "Œ": 1000, "æ": 889, "Æ": 1000,
};

/** Widest measured advance per face; unknown glyphs default to this (over-estimate). */
export const HELVETICA_MAX_ADVANCE = 1015; // "@" in Helvetica
export const HELVETICA_BOLD_MAX_ADVANCE = 1000; // "Œ" in Helvetica-Bold

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
  /** Horizontal inset (points) inside the print margin; the grid is drawn between `margin + inset` and `width - margin - inset`. */
  inset: number;
  contentWidth: number;
  /** Actual width of the learner grid. An early closing date leaves unused paper to the right. */
  tableWidth: number;
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

export function approxFullTermTextWidth(text: string, size: number, bold = false): number {
  // Sum the exact Helvetica advance of every glyph (per 1000 units) and scale by
  // the point size. These advances are the same ones the PDF renderer uses, so a
  // planned line width equals the width the renderer draws — the planner can
  // never declare "fits" for a line the renderer would actually overflow. Glyphs
  // outside the embedded font fall back to the measured maximum (a safe
  // over-estimate) so no real line can exceed the planned width.
  const table = bold ? HELVETICA_BOLD_ADVANCE : HELVETICA_ADVANCE;
  const max = bold ? HELVETICA_BOLD_MAX_ADVANCE : HELVETICA_MAX_ADVANCE;
  let units = 0;
  for (const character of text) {
    const advance = table[character];
    units += advance == null ? max : advance;
  }
  return (units / 1000) * size;
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

/** Closure names stay inside the merged band; impossible fits use the route fallback. */
export function planFullTermClosures(input: {
  weeks: readonly RegisterTeacherWeek[];
  rowBandHeight: number;
  columnWidth: number;
  contentWidth: number;
}): { notes: FullTermClosureNote[]; bandHeight: number } {
  return {
    notes: isoDates(input.weeks).filter(day => !day.teaching).map(day => ({
      date: day.date, label: day.reason?.trim() || "Non-teaching day",
      continuation: false, index: null, lines: [],
    })),
    bandHeight: 0,
  };
}

function identityPlan(section: RegisterTeacherSection, contentWidth: number) {
  const size = FULL_TERM_DATA_FONT;
  // Conservative bold advance: the PDF uses Helvetica-Bold, whose widest
  // ordinary glyphs approach this factor. Over-estimating keeps names inside
  // the planned lines instead of clipping them at print time.
  const boldWidth = (text: string) => approxFullTermTextWidth(text, size, true);
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
  const inset = FULL_TERM_INSET;
  // The inset is horizontal only; vertical space keeps the symmetric 32pt margin
  // so rows are not needlessly shortened and the top/bottom margins match.
  const contentWidth = paper.width - margin * 2 - inset * 2;
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
  const identityWidth = identity.widths.reduce((sum, width) => sum + width, 0);
  const termWidth = termWidths.reduce((sum, width) => sum + width, 0);
  const availableDateWidth = contentWidth - identityWidth - termWidth - totalColumns * weekTotalWidth;
  const naturalDayWidth = availableDateWidth / Math.max(1, dateColumns);
  // A user-selected early closing day crops the full-term grid. Do not enlarge
  // the remaining dates to occupy the released paper width. The PDF renderer
  // already uses physical point widths; the HTML renderer must use tableWidth
  // rather than widening this same plan back to 100% of the sheet.
  const isShortClosingWindow = Boolean(document.fullTerm)
    && document.fullTerm.includedTeachingDayCount < document.fullTerm.termEligibleTeachingDayCount;
  const dayWidth = isShortClosingWindow
    ? Math.min(naturalDayWidth, FULL_TERM_COMPACT_DAY_WIDTH)
    : naturalDayWidth;
  const tableWidth = identityWidth + termWidth + totalColumns * weekTotalWidth + dateColumns * dayWidth;
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
  const closureHeight = Math.max(24, ...closure.notes.map(note => approxFullTermTextWidth(note.label, 7, true) + 8));
  const nameRowFloor = Math.max(
    closureHeight / Math.max(1, learnerCount),
    FULL_TERM_MIN_ROW_HEIGHT,
    FULL_TERM_DATA_FONT * (identity.nameLines + 0.35),
    // The HTML renderer uses a 1.02 line-height; the row must be at least that
    // tall for every drawn name line so the preview cannot clip or expand.
    FULL_TERM_DATA_FONT * 1.03 * identity.nameLines,
  );
  const maxRowHeight = Math.max(FULL_TERM_MAX_ROW_HEIGHT, nameRowFloor);
  const rowHeight = Math.max(0, Math.min(maxRowHeight, availableForRows / Math.max(1, learnerCount)));
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
    inset,
    contentWidth,
    tableWidth,
    contentHeight,
    identityWidths: identity.widths,
    termWidths,
    dayWidth,
    weekTotalWidth,
    attendanceColumns,
    rowHeight: Math.max(FULL_TERM_MIN_ROW_HEIGHT, rowHeight),
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
