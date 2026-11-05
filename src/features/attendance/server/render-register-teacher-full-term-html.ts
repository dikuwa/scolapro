import "server-only";

import {
  OFFICIAL_DOCUMENT_HTML_HEADER_RULE,
  OFFICIAL_DOCUMENT_LANDSCAPE_SCREEN_RULE,
} from "@/features/documents/server/official-document-chrome";
import { renderOfficialDocumentHtmlHeader } from "@/features/documents/server/official-document-html-header";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
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
  FULL_TERM_INSET,
  FULL_TERM_PAPERS,
  type FullTermPlan,
  type FullTermSheet,
} from "@/features/attendance/server/register-teacher-full-term-layout";
import { fullTermDayBasis } from "@/features/attendance/server/register-teacher-full-term";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));
}

function formatDate(value: string) {
  return formatRegisterTeacherDate(value);
}

function pct(fraction: number) {
  return `${(fraction * 100).toFixed(4)}%`;
}

function paperMm(width: number) {
  return `${((width / 72) * 25.4).toFixed(2)}mm`;
}

function learnerWeekPresent(learner: RegisterTeacherSection["learners"][number], week: RegisterTeacherWeek) {
  return week.dates.reduce((sum, day) => sum + (learner.marks[day.date] === "I" ? 1 : 0), 0);
}

function summaryCells(sheet: FullTermSheet, kind: "attendance" | "absence" | "possible") {
  return sheet.weeks.map((week) => {
    const values = registerTeacherValuesFor(sheet.section, week, kind);
    return values.map((value) => value === null
      ? '<td class="non-teaching"></td>'
      : `<td class="summary-value${kind === "absence" ? " absence-value" : ""}">${value}</td>`).join("")
      + `<td class="summary-value week-total${kind === "absence" ? " absence-value" : ""}">${values.reduce<number>((sum, value) => sum + (value ?? 0), 0)}</td>`;
  }).join("");
}

function summaryRow(sheet: FullTermSheet, label: string, kind: "attendance" | "absence" | "possible") {
  const termValue = registerTeacherTermValue(sheet.section, kind);
  const term = kind === "attendance"
    ? `<td class="term-actual">${termValue}</td><td class="term-absent"></td><td class="term-days"></td>`
    : kind === "absence"
      ? `<td class="term-actual"></td><td class="term-absent absence-value">${termValue}</td><td class="term-days"></td>`
      : `<td class="term-actual"></td><td class="term-absent"></td><td class="term-days">${termValue}</td>`;
  return `<tr class="summary-row ${kind}-summary-row"><th colspan="${sheet.identityWidths.length}">${escapeHtml(label)}</th>${summaryCells(sheet, kind)}${term}</tr>`;
}

function sheetHtml(input: {
  sheet: FullTermSheet;
  document: RegisterTeacherDocument;
  header: OfficialDocumentHeaderModel;
}) {
  const { sheet, document, header } = input;
  const { section, weeks } = sheet;
  const paper = FULL_TERM_PAPERS[sheet.paper];
  const columns = [
    ...sheet.identityWidths.map((width) => `<col style="width:${pct(width / sheet.contentWidth)}">`),
    ...weeks.flatMap((week) => [
      ...week.dates.map(() => `<col style="width:${pct(sheet.dayWidth / sheet.contentWidth)}">`),
      `<col style="width:${pct(sheet.weekTotalWidth / sheet.contentWidth)}">`,
    ]),
    ...sheet.termWidths.map((width) => `<col style="width:${pct(width / sheet.contentWidth)}">`),
  ].join("");
  const weekHeaders = weeks.map((week) => `<th class="week-heading" colspan="${week.dates.length + 1}"><span>Week Ending</span><strong>${escapeHtml(formatDate(week.weekEnding))}</strong></th>`).join("");
  const dayHeaders = weeks.map((week) => week.dates.map((day) =>
    `<th class="day${day.teaching ? "" : " non-teaching"}"><span>${escapeHtml(day.weekday)}</span><small>${escapeHtml(day.dayNumber)}</small></th>`,
  ).join("") + '<th class="week-total">Tot.</th>').join("");
  const closureByDate = new Map(sheet.closureNotes.map((note) => [note.date, note]));
  const learnerRows = section.learners.map((learner, rowIndex) => {
    const identity = [
      `<td class="identity admin">${escapeHtml(learner.admissionNumber ?? "")}</td>`,
      `<td class="identity no">${rowIndex + 1}</td>`,
      `<td class="identity surname">${escapeHtml(learner.surname)}</td>`,
      `<td class="identity given">${escapeHtml(learner.givenNames)}</td>`,
      `<td class="identity dob">${formatRegisterTeacherBirthDate(learner.dateOfBirth)}</td>`,
    ].join("");
    const marks = weeks.map((week) => week.dates.map((day) => {
      if (!day.teaching) {
        if (rowIndex > 0) return "";
        const note = closureByDate.get(day.date);
        const body = note?.continuation
          ? `<span class="closure-index">${note.index}</span>`
          : `<span class="closure-label">${escapeHtml(registerTeacherClosureLabel(day.reason))}</span>`;
        return `<td rowspan="${Math.max(1, section.learners.length)}" class="mark non-teaching closure-column" title="${escapeHtml(day.reason ?? "Non-teaching day")}">${body}</td>`;
      }
      const mark = learner.marks[day.date] ?? "";
      const reasoned = mark === "a" && Boolean(learner.reasonedAbsenceDates[day.date]);
      return `<td class="mark">${mark ? `<span class="${mark === "a" ? "absent-mark" : ""}">${mark}${reasoned ? '<sup class="absence-reason-mark">✓</sup>' : ""}</span>` : ""}</td>`;
    }).join("") + `<td class="week-total value">${learnerWeekPresent(learner, week)}</td>`).join("");
    const term = `<td class="term-actual">${learner.termAttended}</td><td class="term-absent absence-value">${learner.termAbsent}</td><td class="term-days">${learner.termDays}</td>`;
    return `<tr class="learner-row">${identity}${marks}${term}</tr>`;
  }).join("");
  const continuation = sheet.closureNotes.filter((note) => note.continuation);
  const closureBand = continuation.length
    ? `<tr class="closure-notes-row"><td colspan="${sheet.identityWidths.length + sheet.attendanceColumns + sheet.termWidths.length}">
        <div class="closure-notes"><p>Governed closures - full names</p><ol>${continuation.map((note) =>
          `<li><span class="closure-note-index">${note.index}</span><span>${note.lines.map((line, index) => `${index ? "<br>" : ""}${escapeHtml(line)}`).join("")}</span></li>`,
        ).join("")}</ol></div>
      </td></tr>`
    : "";
  const balance = registerTeacherBalance(section);
  const totalColumns = sheet.identityWidths.length + sheet.attendanceColumns + sheet.termWidths.length;
  const emptyRow = sheet.empty
    ? `<tr class="learner-row empty-row"><td colspan="${totalColumns}">No learners in this section.</td></tr>`
    : "";
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
  // A school may open a replacement Saturday, so included can exceed scheduled.
  // State that relationship instead of printing two numbers that read as an
  // impossible total on an official document.
  const dayBasis = fullTermDayBasis(
    fullTerm?.scheduledTeachingDayCount ?? document.teachingDayCount,
    fullTerm?.includedTeachingDayCount ?? document.teachingDayCount,
  );
  const dayBasisNote = dayBasis.detail ? ` (${dayBasis.detail})` : "";
  const banner = hasIncludedDays
    ? `PROVISIONAL — closing ${escapeHtml(formatDate(includedClosingDate!))} · ${fullTerm!.scheduledTeachingDayCount} scheduled school days · ${fullTerm!.includedTeachingDayCount} school-included teaching days${dayBasisNote} · ${fullTerm!.possibleLearnerDays} possible learner-days. Not a certified class register.`
    : `NO ELIGIBLE SCHOOL DAY — ${emptyCopy.charAt(0).toLowerCase()}${emptyCopy.slice(1)} The sheet is intentionally empty.`;
  const meta = [
    ["BOYS/GIRLS:", section.label],
    ["TERM:", document.termName],
    ["CLOSING DATE:", fullTerm?.closingDate ? formatDate(fullTerm.closingDate) : "None"],
    ["SCHOOL DAYS:", `${fullTerm?.includedTeachingDayCount ?? 0} included / ${fullTerm?.scheduledTeachingDayCount ?? document.teachingDayCount} scheduled`],
    ["POSSIBLE LEARNER-DAYS:", String(fullTerm?.possibleLearnerDays ?? 0)],
    ["REGISTER CLASS:", document.className],
    ["REGISTER TEACHER:", document.registerTeacherName],
  ] as const;

  return `<section class="report full-term-sheet" style="--row-height:${sheet.rowHeight.toFixed(2)}pt" aria-label="${escapeHtml(section.label)} full-term register">
    ${renderOfficialDocumentHtmlHeader(header, undefined, {
      context: {
        title: "FULL-TERM REGISTER",
        primaryContext: `${document.gradeName} · ${document.className} · ${document.academicYear}`,
        secondaryContext: document.termName,
        summary: fullTerm?.closingDate ? `${formatDate(document.scopeStart)} - ${formatDate(fullTerm.closingDate)}` : "No eligible day",
      },
    })}
    <div class="legend"><span><span class="mark-sample">I</span> = Present</span><span><span class="mark-sample absent-mark">a</span> = Absent</span><span><span class="mark-sample absent-mark">a<sup class="absence-reason-mark">✓</sup></span> = Absent with reason</span><span class="legend-note">Grey = non-teaching / inactive; governed holiday or closure name appears in the attendance area</span></div>
    <div class="provisional-banner" role="note">${banner}</div>
    <div class="full-term-meta">${meta.map(([label, value]) => `<div><strong>${escapeHtml(label)}</strong> ${escapeHtml(value)}</div>`).join("")}</div>
    ${hasIncludedDays ? `<table>
      <colgroup>${columns}</colgroup>
      <thead>
        <tr>
          <th rowspan="3" class="identity admin">ADMIN<br>NO.</th>
          <th rowspan="3" class="identity no">NO.</th>
          <th colspan="2" rowspan="2" class="identity name-head">NAME</th>
          <th rowspan="3" class="identity dob">DATE OF<br>BIRTH</th>
          ${weekHeaders}
          <th colspan="3" rowspan="2" class="term-group">TOTAL<br>PER TERM</th>
        </tr>
        <tr></tr>
        <tr>
          <th class="identity surname">Surname</th>
          <th class="identity given">Given Names</th>
          ${dayHeaders}
          <th class="term-actual">Attend.</th>
          <th class="term-absent">Absent</th>
          <th class="term-days">Days</th>
        </tr>
      </thead>
      <tbody>
        ${learnerRows || emptyRow}
        ${closureBand}
        ${summaryRow(sheet, "Total number of attendances", "attendance")}
        ${summaryRow(sheet, "Total number of absentees", "absence")}
        ${summaryRow(sheet, "Total possible attendances (daily/week = observed; term = full term)", "possible")}
      </tbody>
    </table>
    <div class="balance-strip"><span>Present <strong>${balance.attendance}</strong></span><span>Absent <strong>${balance.absence}</strong></span><span>Projected <strong>${balance.projected}</strong></span><span>Observed <strong>${balance.observed} / Full-term ${balance.possible} ${balance.reconciled ? "✓" : "!"}</strong></span></div>`
      : `<div class="empty-sheet">${escapeHtml(emptyCopy)} Configure or open a governed school day before printing.</div>`}
    <div class="sheet-foot">${escapeHtml(paper.label)}${fullTerm?.certificationNote ? ` · ${escapeHtml(fullTerm.certificationNote)}` : ""} · Days column = full-term possible incl. projected future days.</div>
  </section>`;
}

export function renderRegisterTeacherFullTermHtml(input: {
  header: OfficialDocumentHeaderModel;
  document: RegisterTeacherDocument;
  plan: FullTermPlan;
}) {
  const { header, document, plan } = input;
  if (!plan.fits) throw new Error("The full-term single-sheet plan does not fit the supported paper.");
  const paper = FULL_TERM_PAPERS[plan.sheets[0]?.paper ?? "a2"];
  const widthMm = paperMm(paper.width);
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(document.className)} Full-Term Register</title>
<style>
  :root { --register-red:#a31218; --register-red-soft:#fff1f2; --ink:#151515; --grid:#3a3a3a; }
  * { box-sizing:border-box; }
  html,body { margin:0; padding:0; font-family:Arial, Helvetica, sans-serif; color:var(--ink); background:#ececec; }
  body { padding:12px; }
  .report { width:${widthMm}; min-width:${widthMm}; margin:0 auto 18px; padding:0 ${FULL_TERM_INSET}pt; background:white; box-shadow:0 10px 28px rgba(0,0,0,.12); position:relative; isolation:isolate; }
  ${OFFICIAL_DOCUMENT_HTML_HEADER_RULE}
  ${OFFICIAL_DOCUMENT_LANDSCAPE_SCREEN_RULE}
  @media screen { body { overflow-x:auto; } .report { width:${widthMm}; min-width:${widthMm}; } }
  .legend { margin:3pt 0 2pt; display:flex; align-items:center; flex-wrap:wrap; gap:2pt 10pt; min-height:14pt; padding:0 1pt; font-size:7pt; line-height:1; color:#555; }
  .legend > span { display:inline-flex; align-items:center; gap:2pt; white-space:nowrap; }
  .legend-note { flex:1 1 240pt; white-space:normal; }
  .mark-sample { display:inline-block; min-width:9pt; text-align:center; font-style:italic; font-size:8pt; line-height:1; }
  .absent-mark { color:var(--register-red); }
  .absence-reason-mark { position:relative; top:-.55em; font-size:.5em; line-height:0; font-style:normal; font-weight:800; color:var(--register-red); }
  .provisional-banner { margin:0 0 2pt; padding:2pt 4pt; border:1px solid var(--register-red); background:var(--register-red-soft); color:var(--register-red); font-size:7pt; font-weight:700; line-height:1.15; }
  .full-term-meta { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:1pt; background:var(--register-red); border:1px solid var(--register-red); margin-bottom:2pt; }
  .full-term-meta > div { min-width:0; background:white; padding:1.5pt 3pt; overflow-wrap:anywhere; font-size:7pt; line-height:1.1; }
  .full-term-meta strong { color:var(--register-red); }
  table { width:100%; min-width:0; border-collapse:collapse; table-layout:fixed; font-size:8pt; }
  th,td { border:1px solid var(--grid); padding:0 1pt; text-align:center; height:var(--row-height,10pt); overflow:hidden; line-height:1.02; }
  thead th { background:var(--register-red-soft); color:#6d0d12; font-weight:700; font-size:7pt; }
  .identity { text-align:left; }
  .identity.admin,.identity.no,.identity.dob { text-align:center; white-space:nowrap; }
  .identity.surname,.identity.given { overflow-wrap:anywhere; }
  .learner-row > .surname,.learner-row > .given { font-weight:700; }
  .name-head { text-align:center; }
  .week-heading { padding:1pt; color:var(--register-red); vertical-align:middle; border-right:2px solid var(--register-red); white-space:normal; }
  .week-heading span { display:block; font-size:7pt; font-weight:700; white-space:nowrap; }
  .week-heading strong { display:block; margin-top:1pt; font-size:7pt; color:#6d0d12; white-space:nowrap; }
  .day { vertical-align:bottom; white-space:nowrap; }
  .day small { display:block; font-size:7pt; color:#555; }
  .closure-column { padding:1pt; text-align:center; vertical-align:middle; overflow:visible; }
  .closure-label { display:inline-block; max-height:100%; overflow:hidden; writing-mode:vertical-rl; transform:rotate(180deg); font-size:7pt; font-weight:700; line-height:1.05; color:#555; white-space:normal; }
  .closure-index { display:inline-block; font-size:8pt; font-weight:800; color:#6d0d12; }
  .closure-notes-row > td { padding:3pt 5pt; text-align:left; background:#fafafa; }
  .closure-notes p { margin:0 0 2pt; font-size:7pt; font-weight:700; color:#555; }
  .closure-notes ol { margin:0; padding:0; list-style:none; display:grid; gap:1.5pt; }
  .closure-notes li { display:flex; gap:4pt; align-items:baseline; font-size:7pt; line-height:1.15; }
  .closure-note-index { flex:0 0 auto; min-width:10pt; text-align:center; font-weight:800; color:#6d0d12; }
  .week-total { background:#fff7f7; font-weight:700; border-right:2px solid var(--register-red); }
  .term-group { background:#fff; font-weight:800; border-left:2px solid var(--register-red); }
  .term-actual,.term-absent,.term-days { font-weight:800; white-space:nowrap; }
  .term-actual { background:#f1ebf7; border-left:2px solid var(--register-red); }
  .term-absent { background:#fff7f7; color:var(--register-red); }
  .term-days { background:#eef5d8; }
  .mark { font-style:italic; font-size:8pt; white-space:nowrap; }
  .non-teaching { background:#ececec !important; color:#999; }
  .non-teaching.closure-column { background-image:none !important; }
  .summary-row th { text-align:left; padding-left:4pt; font-weight:900; font-size:7pt; }
  .summary-row td { font-weight:900; font-size:8pt; }
  .summary-row:first-of-type th,.summary-row:first-of-type td { border-top:2px solid var(--register-red); }
  .attendance-summary-row th,.attendance-summary-row td { background:#f1ebf7; color:#291a55; }
  .absence-summary-row th,.absence-summary-row td { background:#fff1f2; color:var(--register-red); }
  .possible-summary-row th,.possible-summary-row td { background:#eef5d8; color:#263517; }
  .absence-value { color:var(--register-red) !important; }
  .empty-row td { padding:10pt; color:#777; font-size:8pt; text-align:left; }
  .empty-sheet { margin-top:6pt; padding:14pt; border:1px solid var(--grid); background:#fafafa; color:#555; font-size:8pt; }
  .balance-strip { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:2pt 10pt; padding:3pt 1pt 0; color:#6d0d12; font-size:7pt; font-weight:600; }
  .balance-strip span { white-space:nowrap; }
  .sheet-foot { padding:1pt 1pt 0; color:#666; font-size:7pt; line-height:1.1; }
  @page { size: ${paper.width}pt ${paper.height}pt; margin:${plan.margin}pt; }
  @media print {
    html,body { background:white; }
    body { padding:0; }
    .report { width:auto; min-width:0; margin:0; box-shadow:none; break-after:page; page-break-after:always; }
    .report:last-child { break-after:auto; page-break-after:auto; }
  }
</style>
</head>
<body>
<main class="sheet">${plan.sheets.map((sheet) => sheetHtml({ sheet, document, header })).join("")}</main>
</body>
</html>`;
}
