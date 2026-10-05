import "server-only";

import type { OfficialAttendanceSummary, OfficialSummaryClassRow, OfficialSummaryGradeRow } from "@/features/attendance/server/official-summary";
import {
  OFFICIAL_DOCUMENT_HTML_HEADER_RULE,
  OFFICIAL_DOCUMENT_LANDSCAPE_SCREEN_RULE,
} from "@/features/documents/server/official-document-chrome";
import { renderOfficialDocumentHtmlHeader } from "@/features/documents/server/official-document-html-header";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";

export type OfficialAttendanceSummaryHtmlInput = {
  header: OfficialDocumentHeaderModel;
  summary: OfficialAttendanceSummary;
  revision: number;
  scolaproReference: string;
  verificationUrl: string;
  finalizedAt: string;
  generatedAt?: string | null;
  qrSvg?: string | null;
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function conciseClassLabel(className: string) {
  return className.trim().replace(/^grade\s+/i, "");
}

function weekEnding(summary: OfficialAttendanceSummary, weekId: string) {
  return summary.weeks.find((week) => week.weekId === weekId)?.weekEndingReportedOn ?? null;
}

function shortDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-NA", { day: "2-digit", month: "2-digit" }).format(new Date(`${value}T12:00:00`));
}

function splitForWeek(row: OfficialSummaryClassRow | OfficialSummaryGradeRow, weekId: string) {
  return row.weekly.find((week) => week.weekId === weekId)?.absences ?? { boys: 0, girls: 0, total: 0 };
}

function schoolSplit(summary: OfficialAttendanceSummary, weekId: string) {
  return summary.classRows.reduce(
    (total, row) => {
      const split = splitForWeek(row, weekId);
      total.boys += split.boys;
      total.girls += split.girls;
      total.total += split.total;
      return total;
    },
    { boys: 0, girls: 0, total: 0 },
  );
}

function groupedRows(summary: OfficialAttendanceSummary) {
  const grades = summary.gradeRows.map((grade) => ({
    grade,
    classes: summary.classRows.filter((row) =>
      grade.gradeId ? row.gradeId === grade.gradeId : row.gradeId === null && row.gradeName === grade.gradeName,
    ),
  }));
  const covered = new Set(grades.flatMap((group) => group.classes.map((row) => row.classId)));
  const ungrouped = summary.classRows.filter((row) => !covered.has(row.classId));
  return { grades, ungrouped };
}

export function renderOfficialAttendanceSummaryHtml(input: OfficialAttendanceSummaryHtmlInput): string {
  const summary = input.summary;
  const weeks = summary.schoolTotals.weekly;
  const finalizedLabel = new Intl.DateTimeFormat("en-NA", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(input.finalizedAt));
  const titleText = summary.mode === "term"
    ? `Term-to-date${summary.term ? ` — ${summary.term.displayName}` : ""}`
    : `Current week${weeks[0] ? ` — ${weeks[0].weekLabel}` : ""}`;
  const groups = groupedRows(summary);

  const weekTop = weeks.map((week) => `<th class="week" colspan="3">${escapeHtml(week.weekLabel.replace(/^Week\s*/i, ""))}</th>`).join("");
  const dateTop = weeks.map((week) => `<th class="week-date" colspan="3">${escapeHtml(shortDate(weekEnding(summary, week.weekId)))}</th>`).join("");
  const splitTop = weeks.map(() => '<th class="num narrow">B</th><th class="num narrow">G</th><th class="num total">TOTAL</th>').join("");

  const dataCells = (row: OfficialSummaryClassRow | OfficialSummaryGradeRow) =>
    weeks.map((week) => {
      const split = splitForWeek(row, week.weekId);
      return `<td class="num">${split.boys}</td><td class="num">${split.girls}</td><td class="num total">${split.total}</td>`;
    }).join("");

  const body: string[] = [];
  for (const group of groups.grades) {
    body.push(`<tr class="grade-section"><th colspan="${1 + weeks.length * 3}">${escapeHtml(group.grade.gradeName)}</th></tr>`);
    for (const row of group.classes) {
      body.push(`<tr><th class="class-cell">${escapeHtml(conciseClassLabel(row.className))}</th>${dataCells(row)}</tr>`);
    }
    body.push(`<tr class="grade-total"><th>${escapeHtml(group.grade.gradeName)} total</th>${dataCells(group.grade)}</tr>`);
  }
  for (const row of groups.ungrouped) {
    body.push(`<tr><th class="class-cell">${escapeHtml(conciseClassLabel(row.className))}</th>${dataCells(row)}</tr>`);
  }

  const schoolCells = weeks.map((week) => {
    const split = schoolSplit(summary, week.weekId);
    return `<td class="num">${split.boys}</td><td class="num">${split.girls}</td><td class="num total">${split.total}</td>`;
  }).join("");
  const percentCells = weeks.map((week) => `<td colspan="2"></td><td class="num total">${escapeHtml(formatPercent(week.percentAbsence))}</td>`).join("");
  const possibleCells = weeks.map((week) => `<td colspan="2"></td><td class="num total">${week.possibleAttendances}</td>`).join("");

  const qrBlock = input.qrSvg
    ? `<div class="qr">${input.qrSvg}<p>Verify: ${escapeHtml(input.verificationUrl)}</p></div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Summary of Absentees — ${escapeHtml(input.header.schoolName)}</title>
<style>
  :root { --ink:#171717; --muted:#5b5b5b; --line:#6e7278; --tint:#eef2f7; --tintStrong:#e2e8f1; }
  * { box-sizing:border-box; }
  @page { size:A4 landscape; margin:8mm; }
  body { font-family:Helvetica,Arial,sans-serif; color:var(--ink); margin:0; padding:18px; background:#fff; }
  ${OFFICIAL_DOCUMENT_HTML_HEADER_RULE}
  ${OFFICIAL_DOCUMENT_LANDSCAPE_SCREEN_RULE}
  .report { padding:7mm 7mm 5mm; min-height:190mm; }
  .meta { display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap; margin:6px 0 8px; font-size:8px; color:var(--muted); }
  .register-wrap { overflow:hidden; }
  table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:7px; }
  th,td { border:0.7px solid var(--line); padding:2.5px 2px; text-align:center; line-height:1.1; }
  thead th { background:var(--tintStrong); font-weight:700; }
  .label-head { width:74px; text-align:left; padding-left:5px; }
  .week { font-size:7.2px; }
  .week-date { font-size:6.5px; font-weight:600; }
  .narrow { font-size:6.2px; }
  .total { font-weight:700; }
  .class-cell { text-align:left; padding-left:10px; font-weight:600; white-space:nowrap; }
  .grade-section th { background:var(--tintStrong); text-align:left; padding:3px 5px; font-size:7.3px; }
  .grade-total th,.grade-total td { background:var(--tint); font-weight:700; }
  .school-total th,.school-total td { background:var(--tintStrong); font-weight:700; }
  .summary-row th,.summary-row td { background:#fafbfc; font-weight:600; }
  .num { font-variant-numeric:tabular-nums; }
  .foot { margin-top:7px; display:flex; align-items:flex-end; justify-content:space-between; gap:10px; font-size:7px; color:var(--muted); }
  .qr { display:flex; align-items:center; gap:5px; max-width:250px; }
  .qr svg { width:42px; height:42px; flex:none; }
  .qr p { margin:0; overflow-wrap:anywhere; }
  @media print { body { padding:0; } .report { break-inside:auto; } thead { display:table-header-group; } tr { break-inside:avoid; } }
</style>
</head>
<body>
<div class="report">
  ${renderOfficialDocumentHtmlHeader(input.header, undefined, { context: { title: "SUMMARY OF ABSENTEES", primaryContext: titleText, secondaryContext: `Academic year ${new Date(`${summary.scopeEnd}T12:00:00`).getFullYear()}`, summary: `${summary.scopeStart} · ${summary.scopeEnd}` } })}
  <div class="meta">
    <span>Reporting period: ${escapeHtml(summary.scopeStart)} – ${escapeHtml(summary.scopeEnd)}</span>
    <span>Revision ${input.revision} · Ref ${escapeHtml(input.scolaproReference)}</span>
    <span>Finalized ${escapeHtml(finalizedLabel)}</span>
  </div>
  <div class="register-wrap">
    <table>
      <thead>
        <tr><th class="label-head">WEEK</th>${weekTop}</tr>
        <tr><th class="label-head">DATE OF WEEK ENDING</th>${dateTop}</tr>
        <tr><th class="label-head">GRADE / CLASS</th>${splitTop}</tr>
      </thead>
      <tbody>
        ${body.join("")}
        <tr class="school-total"><th>SCHOOL TOTAL</th>${schoolCells}</tr>
        <tr class="summary-row"><th>POSSIBLE ATTENDANCES</th>${possibleCells}</tr>
        <tr class="summary-row"><th>% ABSENCE</th>${percentCells}</tr>
      </tbody>
    </table>
  </div>
  <div class="foot">
    <div><strong>Total absent learner-days:</strong> ${summary.schoolTotals.absentLearnerDays} · <strong>Overall % absence:</strong> ${escapeHtml(formatPercent(summary.schoolTotals.percentAbsence))}</div>
    ${qrBlock}
  </div>
</div>
</body>
</html>`;
}
