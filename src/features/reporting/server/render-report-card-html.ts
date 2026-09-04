import "server-only";

import {
  buildReportCardTemplateModel,
  isFailingResult,
  text,
  type ReportCardRenderInput,
  type ReportCardSubjectRow,
} from "@/features/reporting/server/report-card-template-model";

function escapeHtml(value: unknown): string {
  return text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function contactLine(label: string, value: string): string {
  return value ? `<div><span>${escapeHtml(label)}:</span> ${escapeHtml(value)}</div>` : "";
}

function subjectLabel(row: ReportCardSubjectRow): string {
  return `${row.promotional ? "" : "* "}${escapeHtml(row.name)}`;
}

function resultCell(row: ReportCardSubjectRow, termNumber: number, kind: "mark" | "percentage" | "symbol"): string {
  const result = row.termResults.get(termNumber);
  if (!result) return `<td class="result-cell">—</td>`;
  if (kind === "symbol") return `<td class="result-cell symbol">${escapeHtml(result.symbol || "—")}</td>`;
  const value = kind === "percentage" ? result.percentageValue : result.resultValue;
  const fail = kind === "mark" && isFailingResult(result, row.minimumPassMark);
  return `<td class="result-cell ${fail ? "below-pass" : ""}">${escapeHtml(value || "—")}${fail ? "<sup>*</sup>" : ""}</td>`;
}

function resultsTable(input: ReportCardRenderInput): string {
  const model = buildReportCardTemplateModel(input);
  const detailColumns = model.showPercentages ? 3 : 2;
  const totalColumns = 1 + model.terms.length * detailColumns;
  const headers = model.terms
    .map((term) => `<th class="term-heading" colspan="${detailColumns}">${escapeHtml(term.name)}</th>`)
    .join("");
  const subHeaders = model.terms
    .map(() => `<th>Mark</th>${model.showPercentages ? "<th>%</th>" : ""}<th>Symbol</th>`)
    .join("");
  const rows = model.subjectRows
    .map((row) => {
      const values = model.terms
        .map((term) => `${resultCell(row, term.number, "mark")}${model.showPercentages ? resultCell(row, term.number, "percentage") : ""}${resultCell(row, term.number, "symbol")}`)
        .join("");
      return `<tr><td class="subject-cell">${subjectLabel(row)}</td>${values}</tr>`;
    })
    .join("");

  return `<table class="results-table">
    <thead>
      <tr><th class="subject-heading" rowspan="2">Subject</th>${headers}</tr>
      <tr>${subHeaders}</tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="${totalColumns}" class="empty-row">No approved results in this snapshot.</td></tr>`}</tbody>
  </table>`;
}

export function renderReportCardHtml(input: ReportCardRenderInput): string {
  const model = buildReportCardTemplateModel(input);
  const oldEnglishClass = model.schoolNameFont === "old_english" ? " old-english" : "";
  const logo = model.logoUrl ? `<div class="logo-wrap"><img class="school-logo" src="${escapeHtml(model.logoUrl)}" alt="${escapeHtml(model.schoolName)} logo" /></div>` : `<div class="logo-wrap logo-placeholder"></div>`;
  const contactBlock = [
    contactLine("Address", model.physicalAddress),
    contactLine("Tel", model.telephone),
    contactLine("Fax", model.fax),
    contactLine("Email", model.email),
  ].join("");
  const postalBlock = [model.postalAddress, model.town].filter(Boolean).map((line) => `<div>${escapeHtml(line)}</div>`).join("");
  const teacherName = model.registerTeacherName || "________________";
  const principalName = model.principalName || "________________";
  const remarks = model.remarks || "";
  const nonPromotionalLegend = model.subjectRows.some((row) => !row.promotional)
    ? `<span><strong>*</strong> Non-promotional subject</span>`
    : "";
  const passLegend = model.showPassMarkLegend && model.subjectRows.some((row) => row.minimumPassMark !== null)
    ? `<span><sup>*</sup> Mark below the configured subject pass mark</span>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(model.learnerName)} - ${escapeHtml(model.currentTermName)} Report</title>
<style>
  @page { size: A4 portrait; margin: 10mm 12mm; }
  * { box-sizing: border-box; }
  :root { --ink: #151515; --line: #4a4a4a; --soft-line: #b9b9b9; --muted: #555; }
  html, body { margin: 0; padding: 0; background: #fff; color: var(--ink); }
  body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 10px; line-height: 1.25; }
  .report { width: 100%; border: 1.2px solid var(--line); padding: 7mm 7mm 5mm; min-height: 270mm; }
  .school-header { display: grid; grid-template-columns: 88px minmax(0,1fr) 128px; gap: 10px; align-items: center; border: 1px solid var(--line); padding: 8px 10px; min-height: 92px; }
  .logo-wrap { display: flex; align-items: center; justify-content: center; height: 76px; }
  .school-logo { display: block; max-width: 76px; max-height: 76px; object-fit: contain; }
  .logo-placeholder { min-height: 60px; }
  .school-identity { min-width: 0; text-align: center; }
  .school-name { margin: 0; font-size: 25px; line-height: 1; font-weight: 700; letter-spacing: -.02em; }
  .school-name.old-english { font-family: "Old English Text MT", "UnifrakturCook", "Lucida Blackletter", "Times New Roman", serif; font-weight: 400; font-size: 29px; letter-spacing: 0; }
  .former-name { margin-top: 3px; font-size: 8.5px; }
  .school-contact { margin-top: 7px; font-size: 7.6px; line-height: 1.28; text-align: left; display: inline-block; }
  .school-contact span { font-weight: 650; }
  .postal { font-size: 8px; line-height: 1.3; text-align: left; align-self: end; padding-bottom: 5px; }
  .emis { margin-top: 4px; font-size: 7.5px; color: var(--muted); }
  .learner-strip { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 12px; border: 1px solid var(--line); border-top: 0; padding: 7px 9px; font-size: 9px; }
  .learner-strip strong { font-weight: 700; }
  .class-strip { display: flex; gap: 18px; border-left: 1px solid var(--line); border-right: 1px solid var(--line); padding: 5px 9px; font-size: 8.5px; }
  .results-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0; }
  .results-table th, .results-table td { border: 1px solid var(--line); padding: 3px 3px; vertical-align: middle; }
  .results-table th { text-align: center; font-size: 7.2px; line-height: 1.15; font-weight: 700; }
  .results-table .subject-heading { width: 29%; text-align: left; padding-left: 6px; }
  .results-table .term-heading { font-size: 7.8px; }
  .subject-cell { font-size: 7.5px; font-weight: 550; }
  .result-cell { text-align: center; font-size: 7.6px; font-variant-numeric: tabular-nums; }
  .result-cell.symbol { font-weight: 700; }
  .result-cell.below-pass { font-weight: 700; }
  .result-cell sup { font-size: 5px; vertical-align: super; line-height: 0; margin-left: 1px; }
  .empty-row { padding: 12px 6px !important; text-align: center; color: var(--muted); }
  .remarks { border: 1px solid var(--line); border-top: 0; min-height: 43px; padding: 5px 8px; }
  .remarks-title { font-size: 7.5px; font-weight: 700; margin-bottom: 3px; }
  .remarks-text { min-height: 25px; white-space: pre-wrap; font-size: 8px; }
  .signoff-grid { display: grid; grid-template-columns: 1.15fr .9fr .9fr; border: 1px solid var(--line); border-top: 0; min-height: 82px; }
  .signoff-grid > div { padding: 8px; min-width: 0; }
  .signoff-grid > div + div { border-left: 1px solid var(--line); }
  .signature-box { display: grid; grid-template-rows: 30px auto 1fr auto; }
  .signature-line { border-bottom: 1px solid var(--line); }
  .signature-label { margin-top: 3px; font-size: 7px; }
  .signature-name { font-size: 7.5px; font-weight: 600; margin-top: 2px; }
  .centre-box { display: flex; flex-direction: column; justify-content: space-between; text-align: center; font-size: 7.3px; }
  .centre-box strong { font-size: 9px; }
  .stamp-box { display: flex; align-items: flex-end; justify-content: center; font-size: 7px; min-height: 65px; }
  .legend { border: 1px solid var(--line); border-top: 0; padding: 5px 7px; min-height: 24px; font-size: 6.7px; display: flex; flex-wrap: wrap; gap: 5px 14px; }
  .document-meta { display: flex; justify-content: space-between; gap: 12px; padding: 5px 2px 0; color: #666; font-size: 6px; }
  .document-meta span:last-child { text-align: right; }
  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .report { break-inside: avoid; }
  }
</style>
</head>
<body>
<main class="report">
  <header class="school-header">
    ${logo}
    <div class="school-identity">
      <h1 class="school-name${oldEnglishClass}">${escapeHtml(model.schoolName)}</h1>
      ${model.formerName ? `<div class="former-name">(${escapeHtml(model.formerName)})</div>` : ""}
      ${contactBlock ? `<div class="school-contact">${contactBlock}</div>` : ""}
      ${model.schoolEmisNumber ? `<div class="emis">EMIS: ${escapeHtml(model.schoolEmisNumber)}</div>` : ""}
    </div>
    <div class="postal">${postalBlock}</div>
  </header>

  <section class="learner-strip">
    <div><strong>Learner:</strong> ${escapeHtml(model.learnerName || "—")}${model.admissionNumber ? ` &nbsp; <span>(${escapeHtml(model.admissionNumber)})</span>` : ""}</div>
    <div><strong>Progress Report:</strong> ${escapeHtml(model.currentTermName)} ${escapeHtml(model.academicYear)}</div>
  </section>
  <section class="class-strip">
    <div><strong>Grade:</strong> ${escapeHtml(model.grade || "—")}</div>
    <div><strong>Class:</strong> ${escapeHtml(model.registerClass || "—")}</div>
  </section>

  ${resultsTable(input)}

  <section class="remarks">
    <div class="remarks-title">Remarks:</div>
    <div class="remarks-text">${escapeHtml(remarks)}</div>
  </section>

  <section class="signoff-grid">
    <div class="signature-box">
      <div class="signature-line"></div>
      <div class="signature-label">Register Teacher</div>
      <div class="signature-name">Register Teacher: ${escapeHtml(teacherName)}</div>
      <div></div>
    </div>
    <div class="centre-box">
      <div>Days Absent<br /><strong>${escapeHtml(model.absentDays || "0")}</strong></div>
      ${model.nextTermStartsOn ? `<div>School re-opens / next term<br /><strong>${escapeHtml(model.nextTermStartsOn)}</strong></div>` : ""}
    </div>
    <div class="signature-box">
      <div class="signature-line"></div>
      <div class="signature-label">Principal</div>
      <div class="signature-name">Principal: ${escapeHtml(principalName)}</div>
      <div class="stamp-box">School Stamp</div>
    </div>
  </section>

  <section class="legend">
    ${nonPromotionalLegend}
    ${passLegend}
  </section>

  <footer class="document-meta">
    <span>ScolaPro certified snapshot v${escapeHtml(model.snapshotVersion)} · Historical marks and report rules are frozen at generation.</span>
    <span>${model.certifiedAt ? `Certified ${escapeHtml(model.certifiedAt)}` : "Draft snapshot"}</span>
  </footer>
</main>
</body>
</html>`;
}
