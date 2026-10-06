import "server-only";

import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import type { RegisterTeacherDocument, RegisterTeacherSection, RegisterTeacherWeek } from "@/features/attendance/server/register-teacher-document";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NA", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-NA", { day: "2-digit", month: "2-digit" }).format(new Date(`${value}T12:00:00`));
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

function weeklyColumns(week: RegisterTeacherWeek) {
  return week.dates.map((day) => `<th class="day ${day.teaching ? "" : "non-teaching"}"><span>${escapeHtml(day.weekday)}</span><small>${escapeHtml(day.dayNumber)}</small></th>`).join("") + '<th class="week-total">Tot.</th>';
}

function weeklyMarks(section: RegisterTeacherSection, rowIndex: number, week: RegisterTeacherWeek) {
  const learner = section.learners[rowIndex];
  const marks = week.dates.map((day) => {
    const mark = learner.marks[day.date] ?? "";
    const title = !day.teaching && day.reason ? ` title="${escapeHtml(day.reason)}"` : "";
    return `<td class="mark ${day.teaching ? "" : "non-teaching"}"${title}>${mark ? `<span class="register-mark">${mark}</span>` : ""}</td>`;
  }).join("");
  const weekPossible = week.dates.reduce((sum, day) => sum + (learner.marks[day.date] ? 1 : 0), 0);
  const weekAbsent = week.dates.reduce((sum, day) => sum + (learner.marks[day.date] === "a" ? 1 : 0), 0);
  return marks + `<td class="week-total value">${weekPossible - weekAbsent}</td>`;
}

function totalsRow(label: string, section: RegisterTeacherSection, weeks: RegisterTeacherWeek[], kind: "attendance" | "absence" | "possible") {
  const cells = weeks.map((week) => {
    const values = week.dates.map((day) => {
      const value = kind === "attendance" ? section.attendanceByDate[day.date] : kind === "absence" ? section.absenceByDate[day.date] : section.possibleByDate[day.date];
      return `<td class="summary-value">${value ?? 0}</td>`;
    }).join("");
    const weekTotal = week.dates.reduce((sum, day) => sum + (kind === "attendance" ? section.attendanceByDate[day.date] : kind === "absence" ? section.absenceByDate[day.date] : section.possibleByDate[day.date]), 0);
    return values + `<td class="summary-value week-total">${weekTotal}</td>`;
  }).join("");
  return `<tr class="summary-row"><th colspan="5">${escapeHtml(label)}</th>${cells}<td class="term-total">${kind === "attendance" ? section.attendanceTotal : kind === "absence" ? section.absenceTotal : section.possibleTotal}</td></tr>`;
}

function sectionHtml(document: RegisterTeacherDocument, section: RegisterTeacherSection) {
  const weekHeaders = document.weeks.map((week) => `<th class="week-heading" colspan="${week.dates.length + 1}">Week Ending Friday<br><strong>${escapeHtml(formatDate(week.weekEnding))}</strong></th>`).join("");
  const dayHeaders = document.weeks.map(weeklyColumns).join("");
  const learnerRows = section.learners.map((_, index) => `<tr>${learnerIdentityCells(section, index)}${document.weeks.map((week) => weeklyMarks(section, index, week)).join("")}<td class="term-total">${section.learners[index].attended}</td></tr>`).join("");

  return `
    <section class="register-section">
      <div class="register-meta">
        <div><strong>BOYS/GIRLS:</strong> ${section.label}</div>
        <div><strong>TERM:</strong> ${escapeHtml(document.termName)}</div>
        <div><strong>TOTAL SCHOOL DAYS:</strong> ${document.teachingDayCount}</div>
        <div><strong>REGISTER CLASS:</strong> ${escapeHtml(document.className)}</div>
      </div>
      <table>
        <thead>
          <tr>
            <th rowspan="3" class="identity admin">ADMIN<br>NO.</th>
            <th rowspan="3" class="identity no">NO.</th>
            <th colspan="2" rowspan="2" class="identity name-head">NAME</th>
            <th rowspan="3" class="identity dob">DATE OF<br>BIRTH</th>
            ${weekHeaders}
            <th rowspan="3" class="term-total">TERM<br>ATTEND.</th>
          </tr>
          <tr></tr>
          <tr>
            <th class="identity surname">Surname</th>
            <th class="identity given">Given Names</th>
            ${dayHeaders}
          </tr>
        </thead>
        <tbody>
          ${learnerRows || '<tr><td colspan="999" class="empty">No learners in this section.</td></tr>'}
          ${totalsRow("Total number of attendances", section, document.weeks, "attendance")}
          ${totalsRow("Total number of absentees", section, document.weeks, "absence")}
          ${totalsRow("Total number of possible attendances", section, document.weeks, "possible")}
        </tbody>
      </table>
      <div class="balance-strip">
        <span><strong>Attendance:</strong> ${section.attendanceTotal}</span>
        <span><strong>Absence:</strong> ${section.absenceTotal}</span>
        <span><strong>Possible:</strong> ${section.possibleTotal}</span>
        <span><strong>Balance:</strong> ${section.attendanceTotal + section.absenceTotal} / ${section.possibleTotal} ${section.attendanceTotal + section.absenceTotal === section.possibleTotal ? "✓" : "!"}</span>
      </div>
    </section>
  `;
}

export function renderRegisterTeacherHtml(input: {
  header: OfficialDocumentHeaderModel;
  document: RegisterTeacherDocument;
}) {
  const { header, document } = input;
  const title = document.mode === "week" ? "WEEKLY REGISTER" : "TERM REGISTER";
  const subtitle = document.mode === "week"
    ? `Week ending ${formatDate(document.scopeEnd)}`
    : `${document.termName} · ${formatDate(document.scopeStart)} – ${formatDate(document.scopeEnd)}`;

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
  .toolbar { position:sticky; top:0; z-index:10; display:flex; justify-content:flex-end; gap:8px; max-width:1800px; margin:0 auto 12px; }
  .toolbar button { border:0; border-radius:6px; padding:9px 14px; font:600 12px Arial,sans-serif; cursor:pointer; background:#111827; color:white; }
  .sheet { max-width:1800px; margin:0 auto; background:white; padding:16px 16px 20px; box-shadow:0 10px 28px rgba(0,0,0,.12); }
  .school-header { display:grid; grid-template-columns:82px 1fr auto; gap:14px; align-items:center; border-bottom:2px solid var(--register-red); padding-bottom:10px; margin-bottom:10px; }
  .school-header img { max-width:72px; max-height:72px; object-fit:contain; }
  .school-name { font-size:22px; font-weight:800; letter-spacing:.02em; text-transform:uppercase; }
  .school-contact { font-size:10px; line-height:1.45; color:#444; }
  .doc-title { text-align:right; }
  .doc-title h1 { margin:0; font-size:17px; color:var(--register-red); letter-spacing:.08em; }
  .doc-title p { margin:5px 0 0; font-size:10px; }
  .register-section { margin-top:18px; break-after:page; }
  .register-section:last-child { break-after:auto; }
  .register-meta { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:1px; background:var(--register-red); border:1px solid var(--register-red); margin-bottom:4px; }
  .register-meta > div { background:white; padding:5px 7px; font-size:9px; }
  .register-meta strong { color:var(--register-red); }
  table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:7.4px; }
  th,td { border:1px solid var(--grid); padding:2px 2px; text-align:center; height:19px; overflow:hidden; }
  thead th { background:var(--register-red-soft); color:#6d0d12; font-weight:700; }
  .identity { text-align:left; }
  .identity.admin { width:42px; text-align:center; }
  .identity.no { width:28px; text-align:center; }
  .identity.surname { width:86px; }
  .identity.given { width:104px; }
  .identity.dob { width:57px; text-align:center; }
  .name-head { text-align:center; }
  .week-heading { min-width:92px; color:var(--register-red); }
  .day { width:18px; }
  .day small { display:block; margin-top:1px; font-size:6px; color:#555; }
  .week-total { width:24px; background:#fff7f7; font-weight:700; border-right:2px solid var(--register-red); }
  .term-total { width:34px; background:#fff2f2; font-weight:800; border-left:2px solid var(--register-red); }
  .mark { font-family:Arial, Helvetica, sans-serif; font-style:italic; font-weight:500; font-size:10px; }
  .register-mark { font-family:Arial, Helvetica, sans-serif; font-style:italic; font-weight:500; }
  .non-teaching { background:#ececec !important; color:#999; background-image:repeating-linear-gradient(135deg,transparent,transparent 3px,rgba(0,0,0,.035) 3px,rgba(0,0,0,.035) 6px)!important; }
  .summary-row th { text-align:left; color:var(--register-red); background:#fff7f7; padding-left:6px; }
  .summary-value { font-weight:700; background:#fffdfd; }
  .balance-strip { display:flex; justify-content:flex-end; flex-wrap:wrap; gap:14px; border:1px solid var(--register-red); border-top:0; padding:5px 7px; font-size:8px; background:#fffafa; color:#6d0d12; }
  .empty { padding:18px; color:#777; font-size:9px; }
  .legend { margin-top:8px; display:flex; gap:14px; font-size:8px; color:#555; }
  .legend .mark-sample { font-family:Arial,Helvetica,sans-serif; font-style:italic; font-size:11px; color:#111; }
  @page { size:A3 landscape; margin:8mm; }
  @media print {
    html,body { background:white; }
    body { padding:0; }
    .toolbar { display:none; }
    .sheet { max-width:none; box-shadow:none; padding:0; }
  }
</style>
</head>
<body>
<div class="toolbar"><button onclick="window.print()">Print / Save PDF</button></div>
<main class="sheet">
  <header class="school-header">
    <div>${header.logoUrl ? `<img src="${escapeHtml(header.logoUrl)}" alt="" />` : ""}</div>
    <div>
      <div class="school-name">${escapeHtml(header.schoolName)}</div>
      <div class="school-contact">${header.contactLines.map((line) => escapeHtml(line.text)).join(" · ")}${header.postalLines.length ? `<br>${header.postalLines.map(escapeHtml).join(" · ")}` : ""}</div>
    </div>
    <div class="doc-title">
      <h1>${title}</h1>
      <p><strong>${escapeHtml(document.gradeName)} · ${escapeHtml(document.className)} · ${document.academicYear}</strong></p>
      <p>${escapeHtml(subtitle)}</p>
    </div>
  </header>
  <div class="legend"><span><span class="mark-sample">I</span> = Present</span><span><span class="mark-sample">a</span> = Absent</span><span>Grey = non-teaching / inactive</span></div>
  ${document.sections.map((section) => sectionHtml(document, section)).join("")}
</main>
</body>
</html>`;
}
