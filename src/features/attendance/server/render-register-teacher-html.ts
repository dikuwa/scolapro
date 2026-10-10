import "server-only";

import {
  OFFICIAL_DOCUMENT_HTML_HEADER_RULE,
  OFFICIAL_DOCUMENT_LANDSCAPE_SCREEN_RULE,
} from "@/features/documents/server/official-document-chrome";
import { renderOfficialDocumentHtmlHeader } from "@/features/documents/server/official-document-html-header";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import type { RegisterTeacherDocument, RegisterTeacherSection, RegisterTeacherWeek } from "@/features/attendance/server/register-teacher-document";
import {
  formatRegisterTeacherDate,
  registerTeacherBalance,
  registerTeacherColumnPlan,
  registerTeacherDocumentContext,
  registerTeacherGovernanceAlert,
  registerTeacherPageJobs,
  registerTeacherTermValue,
  registerTeacherValuesFor,
  type RegisterTeacherSummaryKind,
} from "@/features/attendance/server/register-teacher-layout";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));
}

function formatDate(value: string) {
  return formatRegisterTeacherDate(value);
}


function learnerIdentityCells(section: RegisterTeacherSection, rowIndex: number) {
  const learner = section.learners[rowIndex];
  return `
    <td class="identity admin">${escapeHtml(learner.admissionNumber ?? "")}</td>
    <td class="identity no">${rowIndex + 1}</td>
    <td class="identity surname">${escapeHtml(learner.surname)}</td>
    <td class="identity given">${escapeHtml(learner.givenNames)}</td>
    <td class="identity dob">${learner.dateOfBirth ? escapeHtml(formatDate(learner.dateOfBirth)) : ""}</td>
  `;
}

function compactCalendarReason(value: string | null) {
  if (!value) return "";
  return value
    .replace(/^school holiday\s*[-:]\s*/i, "")
    .replace(/^public holiday\s*[-:]\s*/i, "")
    .replace(/^holiday\s*[-:]\s*/i, "")
    .trim();
}

function weeklyColumns(week: RegisterTeacherWeek) {
  return week.dates.map((day) =>
    `<th class="day ${day.teaching ? "" : "non-teaching"}"><span>${escapeHtml(day.weekday)}</span><small>${escapeHtml(day.dayNumber)}</small></th>`,
  ).join("") + '<th class="week-total">Tot.</th>';
}

function weeklyMarks(section: RegisterTeacherSection, rowIndex: number, week: RegisterTeacherWeek) {
  const learner = section.learners[rowIndex];
  const marks = week.dates.map((day) => {
    if (!day.teaching) {
      if (rowIndex > 0) return "";
      const reason = compactCalendarReason(day.reason) || "Non-teaching day";
      return `<td rowspan="${Math.max(1, section.learners.length)}" class="mark non-teaching closure-column" title="${escapeHtml(day.reason ?? reason)}"><span class="closure-label">${escapeHtml(reason)}</span></td>`;
    }
    const mark = learner.marks[day.date] ?? "";
    const reasoned = mark === "a" && Boolean(learner.reasonedAbsenceDates[day.date]);
    const markHtml = mark
      ? `<span class="register-mark ${mark === "a" ? "absent-mark" : ""}">${mark}${reasoned ? '<sup class="absence-reason-mark">✓</sup>' : ""}</span>`
      : "";
    return `<td class="mark">${markHtml}</td>`;
  }).join("");
  const weekPossible = week.dates.reduce((sum, day) => sum + (learner.marks[day.date] ? 1 : 0), 0);
  const weekAbsent = week.dates.reduce((sum, day) => sum + (learner.marks[day.date] === "a" ? 1 : 0), 0);
  return marks + `<td class="week-total value">${weekPossible - weekAbsent}</td>`;
}

function totalsRow(label: string, section: RegisterTeacherSection, weeks: RegisterTeacherWeek[], kind: RegisterTeacherSummaryKind) {
  const cells = weeks.map((week) => {
    const sourceValues = registerTeacherValuesFor(section, week, kind);
    const values = sourceValues.map((value) => value === null
      ? '<td class="summary-value non-teaching"></td>'
      : `<td class="summary-value ${kind === "absence" ? "absence-value" : ""}">${value}</td>`).join("");
    const weekTotal = sourceValues.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    return values + `<td class="summary-value week-total ${kind === "absence" ? "absence-value" : ""}">${weekTotal}</td>`;
  }).join("");
  const termValue = registerTeacherTermValue(section, kind);
  const termCells = kind === "attendance"
    ? `<td class="term-actual">${termValue}</td><td class="term-absent"></td><td class="term-days"></td>`
    : kind === "absence"
      ? `<td class="term-actual"></td><td class="term-absent absence-value">${termValue}</td><td class="term-days"></td>`
      : `<td class="term-actual"></td><td class="term-absent"></td><td class="term-days">${termValue}</td>`;
  const rowClass = kind === "attendance"
    ? "attendance-summary-row"
    : kind === "absence"
      ? "absence-summary-row"
      : "possible-summary-row";
  return `<tr class="summary-row ${rowClass}"><th colspan="5">${escapeHtml(label)}</th>${cells}${termCells}</tr>`;
}

function sectionHtml(document: RegisterTeacherDocument, section: RegisterTeacherSection, weeks: RegisterTeacherWeek[], page: number, pages: number, repeatedHeader: string) {
  // Wide term registers are split into print-sized week panels. Repeat the learner
  // identities and official totals rather than clipping dates or shrinking marks.
  // Column geometry comes from the shared layout contract so HTML and PDF cannot
  // drift into different grids.
  const plan = registerTeacherColumnPlan(weeks);
  const pct = (fraction: number) => `${(fraction * 100).toFixed(3)}%`;
  const columns = [
    ...plan.identityFractions.map((fraction) => `<col style="width:${pct(fraction)}">`),
    ...Array.from({ length: plan.attendanceColumns }, () => `<col style="width:${pct(plan.dayFraction)}">`),
    ...plan.termFractions.map((fraction) => `<col style="width:${pct(fraction)}">`),
  ].join("");
  const weekHeaders = weeks.map((week) => `<th class="week-heading" colspan="${week.dates.length + 1}"><span class="week-heading-label">Week Ending Friday</span><strong class="week-heading-date">${escapeHtml(formatDate(week.weekEnding))}</strong></th>`).join("");
  const dayHeaders = weeks.map(weeklyColumns).join("");
  const learnerRows = section.learners.map((_, index) => {
    const learner = section.learners[index];
    return `<tr>${learnerIdentityCells(section, index)}${weeks.map((week) => weeklyMarks(section, index, week)).join("")}<td class="term-actual">${learner.termAttended}</td><td class="term-absent absence-value">${learner.termAbsent}</td><td class="term-days">${learner.termDays}</td></tr>`;
  }).join("");

  const balance = registerTeacherBalance(section);
  const governanceAlert = registerTeacherGovernanceAlert(document);
  return `
    <section class="report register-section" aria-label="${escapeHtml(section.label)} register page ${page} of ${pages}">
      ${repeatedHeader}
      <div class="register-meta">
        <div><strong>BOYS/GIRLS:</strong> ${section.label}</div>
        <div><strong>TERM:</strong> ${escapeHtml(document.termName)}${pages > 1 ? ` · Page ${page}/${pages}` : ""}</div>
        <div><strong>TOTAL SCHOOL DAYS:</strong> ${document.teachingDayCount}</div>
        <div><strong>REGISTER CLASS:</strong> ${escapeHtml(document.className)}</div>
        <div><strong>REGISTER TEACHER:</strong> ${escapeHtml(document.registerTeacherName)}</div>
      </div>
      <table>
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
          ${learnerRows || '<tr><td colspan="999" class="empty">No learners in this section.</td></tr>'}
          ${totalsRow("Total number of attendances", section, weeks, "attendance")}
          ${totalsRow("Total number of absentees", section, weeks, "absence")}
          ${totalsRow("Total number of possible attendances", section, weeks, "possible")}
        </tbody>
      </table>
      ${governanceAlert ? `<div class="governance-alert">Governance flag: ${escapeHtml(governanceAlert)}</div>` : ""}
      <div class="balance-strip">
        <div class="balance-item"><span>Attendance</span><strong>${balance.attendance}</strong></div>
        <div class="balance-item"><span>Absence</span><strong>${balance.absence}</strong></div>
        <div class="balance-item"><span>Possible</span><strong>${balance.possible}</strong></div>
        <div class="balance-item balance-result"><span>Balance:</span><strong>${balance.accounted} / ${balance.possible} ${balance.balanced ? "✓" : "!"}</strong></div>
      </div>
    </section>
  `;
}

export function renderRegisterTeacherHtml(input: {
  header: OfficialDocumentHeaderModel;
  document: RegisterTeacherDocument;
}) {
  const { header, document } = input;
  const context = registerTeacherDocumentContext(document);
  const title = context.title;
  const repeatedHeader = `
    ${renderOfficialDocumentHtmlHeader(header, undefined, { context })}
    <div class="legend"><span><span class="mark-sample">I</span> = Present</span><span><span class="mark-sample absent-mark">a</span> = Absent</span><span><span class="mark-sample absent-mark">a<sup class="absence-reason-mark">✓</sup></span> = Absent with reason</span><span>Grey = non-teaching / inactive; governed holiday or closure name appears in the attendance area</span></div>`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(document.className)} ${title}</title>
<style>
  :root { --register-red:#a31218; --register-red-soft:#fff1f2; --ink:#151515; --grid:#3a3a3a; }
  * { box-sizing:border-box; }
  html,body { margin:0; padding:0; font-family:Arial, Helvetica, sans-serif; color:var(--ink); background:#ececec; }
  body { padding:18px; }
  .sheet { width:404mm; max-width:100%; margin:0 auto; background:white; padding:16px 16px 20px; box-shadow:0 10px 28px rgba(0,0,0,.12); }
  ${OFFICIAL_DOCUMENT_HTML_HEADER_RULE}
  ${OFFICIAL_DOCUMENT_LANDSCAPE_SCREEN_RULE}
  .register-section { margin-top:0; break-after:page; overflow:visible; }
  .register-section:last-child { break-after:auto; }
  .register-meta { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:1px; background:var(--register-red); border:1px solid var(--register-red); margin-bottom:4px; }
  .register-meta > div { background:white; padding:5px 7px; font-size:9px; }
  .register-meta strong { color:var(--register-red); }
  table { width:100%; min-width:0; border-collapse:collapse; table-layout:fixed; font-size:7.4px; }
  th,td { border:1px solid var(--grid); padding:2px 2px; text-align:center; height:19px; overflow:hidden; }
  thead th { background:var(--register-red-soft); color:#6d0d12; font-weight:700; }
  .identity { text-align:left; }
  .identity.admin { text-align:center; white-space:nowrap; }
  .identity.no { text-align:center; white-space:nowrap; }
  .identity.surname { overflow-wrap:anywhere; }
  .identity.given { overflow-wrap:anywhere; }
  .identity.dob { text-align:center; white-space:nowrap; }
  .name-head { text-align:center; }
  .week-heading { padding:3px 2px 4px; color:var(--register-red); text-align:center; vertical-align:middle; line-height:1.05; border-right:2px solid var(--register-red); white-space:nowrap; }
  .week-heading-label { display:block; font-size:6.6px; font-weight:700; letter-spacing:.015em; white-space:nowrap; }
  .week-heading-date { display:block; margin-top:2px; font-size:7.2px; line-height:1; color:#6d0d12; white-space:nowrap; }
  .day { white-space:nowrap; vertical-align:bottom; }
  .day small { display:block; margin-top:1px; font-size:6px; color:#555; }
  .closure-column { padding:3px 1px; text-align:center; vertical-align:middle; overflow:visible; }
  .closure-label { display:inline-block; max-height:72mm; overflow:hidden; writing-mode:vertical-rl; transform:rotate(180deg); font-size:6.3px; font-style:normal; font-weight:700; line-height:1.1; letter-spacing:.01em; color:#555; white-space:normal; }
  .week-total { white-space:nowrap; background:#fff7f7; font-weight:700; border-right:2px solid var(--register-red); }
  .term-group { width:1%; white-space:nowrap; background:#fff; font-weight:800; border-left:2px solid var(--register-red); }
  .term-actual,.term-absent,.term-days { white-space:nowrap; font-weight:800; }
  .term-actual { background:#f1ebf7; border-left:2px solid var(--register-red); }
  .term-absent { background:#fff7f7; color:var(--register-red); }
  .term-days { background:#eef5d8; }
  .mark { white-space:nowrap; font-family:Arial, Helvetica, sans-serif; font-style:italic; font-weight:500; font-size:10px; }
  .register-mark { position:relative; display:inline-block; font-family:Arial, Helvetica, sans-serif; font-style:italic; font-weight:500; }
  .absent-mark { color:var(--register-red); }
  .absence-reason-mark { position:relative; top:-.42em; margin-left:1px; font-size:.52em; line-height:0; font-style:normal; font-weight:800; color:var(--register-red); }
  .non-teaching { background:#ececec !important; color:#999; background-image:repeating-linear-gradient(135deg,transparent,transparent 3px,rgba(0,0,0,.035) 3px,rgba(0,0,0,.035) 6px)!important; }
  .summary-row th { text-align:left; padding-left:6px; font-weight:900; }
  .summary-row td { font-weight:900; }
  .summary-row:first-of-type th,.summary-row:first-of-type td { border-top:3px solid var(--register-red); }
  .attendance-summary-row th,.attendance-summary-row td { background:#f1ebf7; color:#291a55; }
  .absence-summary-row th,.absence-summary-row td { background:#fff1f2; color:var(--register-red); }
  .possible-summary-row th,.possible-summary-row td { background:#eef5d8; color:#263517; }
  .summary-value { font-weight:900; }
  .absence-value { color:var(--register-red) !important; font-weight:900; }
  .balance-strip { display:grid; grid-template-columns:repeat(4,max-content); justify-content:end; align-items:stretch; border:1px solid var(--register-red); border-top:0; background:#fffafa; color:#6d0d12; }
  .balance-item { display:grid; grid-template-columns:auto auto; align-items:center; gap:4px; min-height:24px; padding:4px 8px; border-left:1px solid rgba(163,18,24,.45); font-size:7.8px; white-space:nowrap; }
  .balance-item:first-child { border-left:0; }
  .balance-item span { font-weight:700; text-transform:uppercase; letter-spacing:.02em; }
  .balance-item strong { font-size:8.4px; }
  .balance-result { min-width:116px; justify-content:center; background:#fff1f2; }
  .governance-alert { padding:4px 6px; border:1px solid var(--register-red); border-top:0; background:#fff1f2; color:var(--register-red); font-size:7px; font-weight:700; }
  .empty { padding:18px; color:#777; font-size:9px; }
  .legend { margin:8px 0 2px; display:flex; align-items:center; flex-wrap:wrap; gap:5px 14px; min-height:20px; padding:2px 1px; font-size:8px; line-height:1; color:#555; }
  .legend > span { display:inline-flex; align-items:center; gap:3px; min-height:16px; white-space:nowrap; }
  .legend .mark-sample { display:inline-grid; min-width:12px; place-items:center; font-family:Arial,Helvetica,sans-serif; font-style:italic; font-size:11px; line-height:1; color:#111; }
  .legend .absence-reason-mark { top:-.34em; }
  @page { size:A3 landscape; margin:8mm; }
  @media screen {
    .sheet { background:transparent; padding:0; box-shadow:none; }
    .register-section { margin:0 0 18px; padding:16px 16px 20px; background:white; box-shadow:0 10px 28px rgba(0,0,0,.12); }
    .register-section:last-child { margin-bottom:0; }
  }
  @media print {
    html,body { background:white; }
    body { padding:0; }
    .sheet { width:auto; max-width:none; box-shadow:none; padding:0; }
    .register-section { margin:0; padding:0; box-shadow:none; break-before:page; break-after:page; page-break-before:always; page-break-after:always; }
    .register-section:first-child { break-before:auto; page-break-before:auto; }
    .register-section:last-child { break-after:auto; page-break-after:auto; }
  }
</style>
</head>
<body>
<main class="sheet">
  ${registerTeacherPageJobs(document).map((job) => sectionHtml(
      document,
      { ...job.section, learners: job.learners },
      job.weeks,
      job.pageNumber,
      job.pageCount,
      repeatedHeader,
    )).join("")}
</main>
</body>
</html>`;
}
