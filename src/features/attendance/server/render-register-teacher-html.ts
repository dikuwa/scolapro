import "server-only";

import { officialDocumentSchoolNameClass, renderOfficialDocumentSchoolNameFontStyle } from "@/features/documents/server/official-document-html-header";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import type { RegisterTeacherDocument, RegisterTeacherSection, RegisterTeacherWeek } from "@/features/attendance/server/register-teacher-document";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NA", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T12:00:00`));
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

function totalsRow(label: string, section: RegisterTeacherSection, weeks: RegisterTeacherWeek[], kind: "attendance" | "absence" | "possible") {
  const cells = weeks.map((week) => {
    const values = week.dates.map((day) => {
      if (!day.teaching) return '<td class="summary-value non-teaching"></td>';
      const value = kind === "attendance" ? section.attendanceByDate[day.date] : kind === "absence" ? section.absenceByDate[day.date] : section.possibleByDate[day.date];
      return `<td class="summary-value ${kind === "absence" ? "absence-value" : ""}">${value ?? 0}</td>`;
    }).join("");
    const weekTotal = week.dates.reduce((sum, day) => sum + (kind === "attendance" ? section.attendanceByDate[day.date] : kind === "absence" ? section.absenceByDate[day.date] : section.possibleByDate[day.date]), 0);
    return values + `<td class="summary-value week-total ${kind === "absence" ? "absence-value" : ""}">${weekTotal}</td>`;
  }).join("");
  const termCells = kind === "attendance"
    ? `<td class="term-actual">${section.termAttendanceTotal}</td><td class="term-absent"></td><td class="term-days"></td>`
    : kind === "absence"
      ? `<td class="term-actual"></td><td class="term-absent absence-value">${section.termAbsenceTotal}</td><td class="term-days"></td>`
      : `<td class="term-actual"></td><td class="term-absent"></td><td class="term-days">${section.termPossibleTotal}</td>`;
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
  const attendanceColumns = weeks.reduce((count, week) => count + week.dates.length + 1, 0);
  const dayWidth = attendanceColumns ? 42 / attendanceColumns : 42;
  const columns = [
    '<col style="width:6%">', '<col style="width:3%">',
    '<col style="width:13%">', '<col style="width:13%">',
    '<col style="width:8%">',
    ...Array.from({ length: attendanceColumns }, () => `<col style="width:${dayWidth.toFixed(3)}%">`),
    '<col style="width:5%">', '<col style="width:5%">', '<col style="width:5%">',
  ].join("");
  const weekHeaders = weeks.map((week) => `<th class="week-heading" colspan="${week.dates.length + 1}"><span class="week-heading-label">Week Ending Friday</span><strong class="week-heading-date">${escapeHtml(formatDate(week.weekEnding))}</strong></th>`).join("");
  const dayHeaders = weeks.map(weeklyColumns).join("");
  const learnerRows = section.learners.map((_, index) => {
    const learner = section.learners[index];
    return `<tr>${learnerIdentityCells(section, index)}${weeks.map((week) => weeklyMarks(section, index, week)).join("")}<td class="term-actual">${learner.termAttended}</td><td class="term-absent absence-value">${learner.termAbsent}</td><td class="term-days">${learner.termDays}</td></tr>`;
  }).join("");

  return `
    <section class="register-section" aria-label="${escapeHtml(section.label)} register page ${page} of ${pages}">
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
      <div class="balance-strip">
        <div class="balance-item"><span>Attendance</span><strong>${section.termAttendanceTotal}</strong></div>
        <div class="balance-item"><span>Absence</span><strong>${section.termAbsenceTotal}</strong></div>
        <div class="balance-item"><span>Possible</span><strong>${section.termPossibleTotal}</strong></div>
        <div class="balance-item balance-result"><span>Balance:</span><strong>${section.termAttendanceTotal + section.termAbsenceTotal} / ${section.termPossibleTotal} ${section.termAttendanceTotal + section.termAbsenceTotal === section.termPossibleTotal ? "✓" : "!"}</strong></div>
      </div>
    </section>
  `;
}

export function renderRegisterTeacherHtml(input: {
  header: OfficialDocumentHeaderModel;
  document: RegisterTeacherDocument;
}) {
  const { header, document } = input;
  const title = document.mode === "week" ? "WEEKLY REGISTER" : document.mode === "range" ? "WEEK RANGE REGISTER" : "TERM REGISTER";
  const subtitle = document.mode === "week"
    ? `Week ending ${formatDate(document.scopeEnd)}`
    : document.mode === "range"
      ? `${formatDate(document.scopeStart)} – ${formatDate(document.scopeEnd)}`
    : `${document.termName} · ${formatDate(document.scopeStart)} – ${formatDate(document.scopeEnd)}`;
  const schoolNameClass = officialDocumentSchoolNameClass(header);
  const schoolNameFontStyle = renderOfficialDocumentSchoolNameFontStyle(header);
  const learnersPerPage = 40;
  const repeatedHeader = `
    <header class="school-header">
      <div>${header.logoUrl ? `<img src="${escapeHtml(header.logoUrl)}" alt="" />` : ""}</div>
      <div>
        <div class="${schoolNameClass}">${escapeHtml(header.schoolName)}</div>
        <div class="school-contact">${header.contactLines.map((line) => escapeHtml(line.text)).join(" · ")}${header.postalLines.length ? `<br>${header.postalLines.map(escapeHtml).join(" · ")}` : ""}</div>
      </div>
      <div class="doc-title">
        <h1>${title}</h1>
        <p><strong>${escapeHtml(document.gradeName)} · ${escapeHtml(document.className)} · ${document.academicYear}</strong></p>
        <p>${escapeHtml(subtitle)}</p>
      </div>
    </header>
    <div class="legend"><span><span class="mark-sample">I</span> = Present</span><span><span class="mark-sample absent-mark">a</span> = Absent</span><span><span class="mark-sample absent-mark">a<sup class="absence-reason-mark">✓</sup></span> = Absent with reason</span><span>Grey = non-teaching / inactive; governed holiday or closure name appears in the attendance area</span></div>`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(document.className)} ${title}</title>
${schoolNameFontStyle}
<style>
  :root { --register-red:#a31218; --register-red-soft:#fff1f2; --ink:#151515; --grid:#3a3a3a; }
  * { box-sizing:border-box; }
  html,body { margin:0; padding:0; font-family:Arial, Helvetica, sans-serif; color:var(--ink); background:#ececec; }
  body { padding:18px; }
  .toolbar { position:sticky; top:0; z-index:10; display:flex; justify-content:flex-end; gap:8px; max-width:404mm; margin:0 auto 12px; }
  .toolbar button { border:0; border-radius:6px; padding:9px 14px; font:600 12px Arial,sans-serif; cursor:pointer; background:#111827; color:white; }
  .sheet { width:404mm; max-width:100%; margin:0 auto; background:white; padding:16px 16px 20px; box-shadow:0 10px 28px rgba(0,0,0,.12); }
  .school-header { display:grid; grid-template-columns:82px 1fr auto; gap:14px; align-items:center; border-bottom:2px solid var(--register-red); padding-bottom:10px; margin-bottom:10px; }
  .school-header img { max-width:72px; max-height:72px; object-fit:contain; }
  .school-name { font-size:22px; font-weight:800; letter-spacing:.02em; text-transform:uppercase; }
  .school-name.old-english { font-weight:700; letter-spacing:0; text-transform:none; }
  .school-contact { font-size:10px; line-height:1.45; color:#444; }
  .doc-title { text-align:right; }
  .doc-title h1 { margin:0; font-size:17px; color:var(--register-red); letter-spacing:.08em; }
  .doc-title p { margin:5px 0 0; font-size:10px; }
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
  .empty { padding:18px; color:#777; font-size:9px; }
  .legend { margin:8px 0 2px; display:flex; align-items:center; flex-wrap:wrap; gap:5px 14px; min-height:20px; padding:2px 1px; font-size:8px; line-height:1; color:#555; }
  .legend > span { display:inline-flex; align-items:center; gap:3px; min-height:16px; white-space:nowrap; }
  .legend .mark-sample { display:inline-grid; min-width:12px; place-items:center; font-family:Arial,Helvetica,sans-serif; font-style:italic; font-size:11px; line-height:1; color:#111; }
  .legend .absence-reason-mark { top:-.34em; }
  @page { size:A3 landscape; margin:8mm; }
  @media print {
    html,body { background:white; }
    body { padding:0; }
    .toolbar { display:none; }
    .sheet { width:auto; max-width:none; box-shadow:none; padding:0; }
  }
</style>
</head>
<body>
<div class="toolbar"><button onclick="window.print()">Print / Save PDF</button></div>
<main class="sheet">
  ${document.sections.map((section) => {
    const panels = document.weeks.length > 3
      ? Array.from({ length: Math.ceil(document.weeks.length / 3) }, (_, i) => document.weeks.slice(i * 3, (i + 1) * 3))
      : [document.weeks];
    const learnerChunks = section.learners.length
      ? Array.from({ length: Math.ceil(section.learners.length / learnersPerPage) }, (_, i) => section.learners.slice(i * learnersPerPage, (i + 1) * learnersPerPage))
      : [[]];
    const pageJobs = panels.flatMap((weeks) => learnerChunks.map((learners) => ({ weeks, learners })));
    return pageJobs.map((job, i) => sectionHtml(
      document,
      { ...section, learners: job.learners },
      job.weeks,
      i + 1,
      pageJobs.length,
      repeatedHeader,
    )).join("");
  }).join("")}
</main>
</body>
</html>`;
}
