import "server-only";

import type { OfficialAttendanceSummary } from "@/features/attendance/server/official-summary";

export type OfficialAttendanceSummaryHtmlInput = {
  schoolName: string;
  summary: OfficialAttendanceSummary;
  revision: number;
  scolaproReference: string;
  verificationUrl: string;
  finalizedAt: string;
  generatedAt?: string | null;
  qrSvg?: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

/**
 * Print-friendly HTML preview of a finalized Official Attendance Summary. Stands
 * alone (inline styles) so it renders correctly when opened directly or printed,
 * while reusing the same frozen summary the PDF/XLSX outputs are built from.
 */
export function renderOfficialAttendanceSummaryHtml(input: OfficialAttendanceSummaryHtmlInput): string {
  const summary = input.summary;
  const isTerm = summary.mode === "term";
  const finalizedLabel = new Intl.DateTimeFormat("en-NA", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(input.finalizedAt));
  const titleText = isTerm ? `Term Summary${summary.term ? ` — ${summary.term.displayName}` : ""}` : "Weekly Summary";

  const rows = summary.classRows
    .map((row) => {
      const a = row.absences;
      const cells = isTerm
        ? `<td class="num">${a.boys}</td><td class="num">${a.girls}</td><td class="num">${a.total}</td><td class="num">—</td>`
        : `<td class="num">${a.boys}</td><td class="num">${a.girls}</td><td class="num">${a.total}</td>`;
      return `<tr><th>${escapeHtml(`${row.gradeName} ${row.className}`)}</th>${cells}</tr>`;
    })
    .join("");

  const gradeRows = summary.gradeRows
    .map((row) => {
      const a = row.absences;
      const cells = isTerm
        ? `<td class="num">${a.boys}</td><td class="num">${a.girls}</td><td class="num">${a.total}</td><td class="num">—</td>`
        : `<td class="num">${a.boys}</td><td class="num">${a.girls}</td><td class="num">${a.total}</td>`;
      return `<tr class="grade"><th>${escapeHtml(`${row.gradeName} (grade total)`)}</th>${cells}</tr>`;
    })
    .join("");

  const school = summary.schoolTotals;
  const schoolCells = isTerm
    ? `<td class="num">${school.absentLearnerDays}</td><td class="num">—</td><td class="num">—</td><td class="num">${formatPercent(school.percentAbsence)}</td>`
    : `<td class="num">—</td><td class="num">—</td><td class="num">${school.absentLearnerDays}</td>`;

  const headers = isTerm
    ? `<th>Register class</th><th class="num">Boys</th><th class="num">Girls</th><th class="num">Total</th><th class="num">% absence</th>`
    : `<th>Register class</th><th class="num">Boys absent</th><th class="num">Girls absent</th><th class="num">Total absent</th>`;

  const qrBlock = input.qrSvg
    ? `<div class="qr">${input.qrSvg}<p class="qr-caption">Verify authenticity at<br>${escapeHtml(input.verificationUrl)}</p></div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Official Attendance Summary — ${escapeHtml(input.schoolName)}</title>
<style>
  :root { --ink:#171717; --muted:#5b5b5b; --line:#c9ccd2; --tint:#eef2f7; --tintStrong:#e2e8f1; }
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; color: var(--ink); margin: 0; padding: 24px; background:#fff; }
  .sheet { max-width: 760px; margin: 0 auto; border:1px solid var(--line); padding: 20px 22px; }
  h1 { font-size: 16px; letter-spacing:.04em; margin:0 0 2px; text-align:center; }
  .subtitle { text-align:center; color: var(--muted); font-size: 12px; margin:0 0 10px; }
  .meta { display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; font-size:11px; color:var(--muted); border-top:1px solid var(--line); border-bottom:1px solid var(--line); padding:8px 0; margin-bottom:12px; }
  table { width:100%; border-collapse: collapse; font-size: 11px; }
  th, td { border:1px solid var(--line); padding:5px 7px; text-align:left; }
  th { background: var(--tintStrong); font-weight:700; }
  td.num, th.num { text-align:right; font-variant-numeric: tabular-nums; }
  tr.grade th, tr.grade td { background: var(--tint); }
  tr.school th, tr.school td { background: var(--tintStrong); font-weight:700; }
  .qr { margin-top:16px; width:120px; }
  .qr svg { width:110px; height:110px; display:block; border:1px solid var(--line); padding:4px; }
  .qr-caption { font-size:9px; color:var(--muted); margin:4px 0 0; line-height:1.3; }
  .foot { margin-top:14px; font-size:10px; color:var(--muted); display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; }
  @media print { body { padding:0; } .sheet { border:none; } }
</style>
</head>
<body>
  <div class="sheet">
    <h1>OFFICIAL ATTENDANCE SUMMARY</h1>
    <p class="subtitle">${escapeHtml(input.schoolName)} — ${escapeHtml(titleText)}</p>
    <div class="meta">
      <span>Reporting period: ${escapeHtml(summary.scopeStart)} – ${escapeHtml(summary.scopeEnd)}</span>
      <span>Revision ${input.revision} · Ref ${escapeHtml(input.scolaproReference)}</span>
      <span>Finalized ${escapeHtml(finalizedLabel)}</span>
    </div>
    <table>
      <thead><tr>${headers}</tr></thead>
      <tbody>
        ${rows}
        ${gradeRows}
        <tr class="school"><th>School total</th>${schoolCells}</tr>
      </tbody>
    </table>
    ${qrBlock}
    <div class="foot">
      <span>Possible attendances: ${school.possibleAttendances} · Absent learner-days: ${school.absentLearnerDays}</span>
      <span>ScolaPro official attendance summary</span>
    </div>
  </div>
</body>
</html>`;
}
