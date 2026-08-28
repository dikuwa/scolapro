import "server-only";

type JsonRecord = Record<string, unknown>;

type RenderReportCardHtmlInput = {
  schoolName: string;
  schoolEmisNumber?: string | null;
  snapshotVersion: number;
  certifiedAt?: string | null;
  dataSnapshot: JsonRecord;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function escapeHtml(value: unknown): string {
  return text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function resultRows(results: unknown): string {
  if (!Array.isArray(results)) return "";

  return results
    .map((entry) => {
      const item = record(entry);
      const result = item.result_status === "numeric" ? item.result_value : item.result_status;
      return `<tr><td>${escapeHtml(item.subject_name)}</td><td>${escapeHtml(item.subject_code)}</td><td class="num">${escapeHtml(result)}</td><td>${escapeHtml(item.symbol)}</td></tr>`;
    })
    .join("");
}

export function renderReportCardHtml(input: RenderReportCardHtmlInput): string {
  const snapshot = record(input.dataSnapshot);
  const learner = record(snapshot.learner);
  const enrolment = record(snapshot.enrolment);
  const term = record(snapshot.term);
  const attendance = record(snapshot.attendance);
  const progression = record(snapshot.year_end_progression);
  const learnerName = [learner.first_names, learner.surname].map(text).filter(Boolean).join(" ");
  const results = resultRows(snapshot.results);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(learnerName)} - ${escapeHtml(term.name)} Report</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #151515; font-size: 12px; line-height: 1.4; }
  header { text-align: center; margin-bottom: 18px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 0; font-weight: 600; }
  .meta { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 6px 24px; margin-bottom: 16px; }
  .label { color: #555; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; }
  .value { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border-bottom: 1px solid #cfcfcf; padding: 7px 5px; text-align: left; }
  th { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
  .num { text-align: right; }
  .section { margin-top: 18px; }
  .section-title { font-size: 12px; font-weight: 700; border-bottom: 2px solid #222; padding-bottom: 4px; }
  .summary { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 8px; margin-top: 8px; }
  .summary > div { border: 1px solid #d7d7d7; padding: 7px; }
  footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #aaa; color: #555; font-size: 9px; display: flex; justify-content: space-between; gap: 12px; }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(input.schoolName)}</h1>
  <h2>${escapeHtml(term.name || `Term ${term.number ?? ""}`)} Report Card</h2>
  ${input.schoolEmisNumber ? `<div>EMIS: ${escapeHtml(input.schoolEmisNumber)}</div>` : ""}
</header>

<section class="meta">
  <div><div class="label">Learner</div><div class="value">${escapeHtml(learnerName)}</div></div>
  <div><div class="label">Admission number</div><div class="value">${escapeHtml(enrolment.admission_number || "—")}</div></div>
  <div><div class="label">Grade</div><div class="value">${escapeHtml(enrolment.grade || "—")}</div></div>
  <div><div class="label">Class</div><div class="value">${escapeHtml(enrolment.register_class || "—")}</div></div>
  <div><div class="label">Academic year</div><div class="value">${escapeHtml(enrolment.academic_year || "—")}</div></div>
  <div><div class="label">Snapshot</div><div class="value">Version ${escapeHtml(input.snapshotVersion)}</div></div>
</section>

<section class="section">
  <div class="section-title">Academic Results</div>
  <table>
    <thead><tr><th>Subject</th><th>Code</th><th class="num">Result</th><th>Symbol</th></tr></thead>
    <tbody>${results || `<tr><td colspan="4">No approved results in this snapshot.</td></tr>`}</tbody>
  </table>
</section>

<section class="section">
  <div class="section-title">Attendance Summary</div>
  <div class="summary">
    <div><div class="label">Recorded days</div><div class="value">${escapeHtml(attendance.recorded_school_days ?? 0)}</div></div>
    <div><div class="label">Present</div><div class="value">${escapeHtml(attendance.present ?? 0)}</div></div>
    <div><div class="label">Absent</div><div class="value">${escapeHtml(attendance.absent ?? 0)}</div></div>
    <div><div class="label">Late</div><div class="value">${escapeHtml(attendance.late ?? 0)}</div></div>
    <div><div class="label">Excused</div><div class="value">${escapeHtml(attendance.excused ?? 0)}</div></div>
  </div>
</section>

${Object.keys(progression).length ? `<section class="section"><div class="section-title">Year-end Progression</div><p><strong>${escapeHtml(progression.outcome || "Pending")}</strong>${progression.rationale ? ` — ${escapeHtml(progression.rationale)}` : ""}</p></section>` : ""}

<footer>
  <span>Generated from certified ScolaPro snapshot data. Historical results are not recalculated from later rule changes.</span>
  <span>${input.certifiedAt ? `Certified ${escapeHtml(input.certifiedAt)}` : "Certified snapshot"}</span>
</footer>
</body>
</html>`;
}
