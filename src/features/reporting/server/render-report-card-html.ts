import "server-only";

import { Buffer } from "node:buffer";
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

function logoDataUrl(bytes: Uint8Array | null | undefined): string {
  if (!bytes?.length) return "";
  const isPng = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const prefix = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.length, 256))).trimStart().toLowerCase();
  const isSvg = prefix.startsWith("<svg") || prefix.startsWith("<?xml") || prefix.includes("<svg");
  const mime = isPng ? "image/png" : isJpeg ? "image/jpeg" : isSvg ? "image/svg+xml" : "";
  return mime ? `data:${mime};base64,${Buffer.from(bytes).toString("base64")}` : "";
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
    .map(() => `<th>Mark</th>${model.showPercentages ? "<th>%</th>" : ""}<th>Grade</th>`)
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
  const resolvedLogoUrl = logoDataUrl(input.logoBytes) || model.logoUrl;
  const logo = resolvedLogoUrl ? `<div class="logo-wrap"><img class="school-logo" src="${escapeHtml(resolvedLogoUrl)}" alt="${escapeHtml(model.schoolName)} logo" /></div>` : `<div class="logo-wrap logo-placeholder"></div>`;
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
    ? `<span><strong>* Subject name</strong> = Non-promotional subject</span>`
    : "";
  const passLegend = model.showPassMarkLegend && model.subjectRows.some((row) => row.minimumPassMark !== null)
    ? `<span><strong>Mark<sup>*</sup></strong> = Learner mark below the configured subject minimum</span>`
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
  :root { --ink: #151515; --line: #4a4a4a; --soft-line: #b9b9b9; --muted: #555; --panel: #edf1f4; }
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
  .report-title { border: 1px solid var(--line); border-top: 0; background: var(--panel); padding: 6px 8px 5px; text-align: center; }
  .report-title strong { display: block; font-size: 11px; letter-spacing: .05em; }
  .report-title span { display: block; margin-top: 2px; font-size: 8px; font-weight: 700; text-transform: uppercase; }
  .learner-details { display: grid; grid-template-columns: 1fr 1fr; border-left: 1px solid var(--line); border-right: 1px solid var(--line); }
  .detail-cell { min-height: 25px; padding: 6px 8px; border-bottom: 1px solid var(--line); font-size: 8px; }
  .detail-cell:nth-child(odd) { border-right: 1px solid var(--line); }
  .detail-label { font-weight: 700; margin-right: 4px; }
  .results-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0; }
  .results-table th, .results-table td { border: 1px solid var(--line); padding: 4px 3px; vertical-align: middle; }
  .results-table th { background: var(--panel); text-align: center; font-size: 7.2px; line-height: 1.15; font-weight: 700; }
  .results-table .subject-heading { width: 29%; text-align: left; padding-left: 6px; }
  .results-table .term-heading { font-size: 7.8px; }
  .subject-cell { font-size: 7.5px; font-weight: 550; }
  .result-cell { text-align: center; font-size: 7.6px; font-variant-numeric: tabular-nums; }
  .result-cell.symbol { font-weight: 700; }
  .result-cell.below-pass { font-weight: 700; }
  .result-cell sup, .symbols-box sup { font-size: 5px; vertical-align: super; line-height: 0; margin-left: 1px; }
  .empty-row { padding: 12px 6px !important; text-align: center; color: var(--muted); }
  .average-row { border: 1px solid var(--line); border-top: 0; display: flex; justify-content: flex-end; padding: 5px 8px; font-size: 8px; }
  .average-row strong { margin-left: 6px; font-size: 9px; }
  .remarks { border: 1px solid var(--line); border-top: 0; min-height: 48px; }
  .remarks-title { background: var(--panel); border-bottom: 1px solid var(--line); font-size: 7.5px; font-weight: 700; padding: 4px 8px; }
  .remarks-text { min-height: 30px; white-space: pre-wrap; font-size: 8px; padding: 6px 8px; }
  .signoff-grid { display: grid; grid-template-columns: 1.15fr .9fr .9fr; border: 1px solid var(--line); border-top: 0; min-height: 78px; }
  .signoff-grid > div { padding: 8px; min-width: 0; }
  .signoff-grid > div + div { border-left: 1px solid var(--line); }
  .signature-box { display: grid; grid-template-rows: 30px auto auto; align-content: start; }
  .signature-line { border-bottom: 1px solid var(--line); }
  .signature-label { margin-top: 3px; font-size: 7px; }
  .signature-name { font-size: 7.5px; font-weight: 600; margin-top: 2px; }
  .centre-box { display: flex; flex-direction: column; justify-content: space-between; text-align: center; font-size: 7.3px; }
  .centre-box strong { font-size: 9px; }
  .stamp-box { display: flex; align-items: center; justify-content: center; min-height: 61px; border: 1px dashed var(--soft-line); color: var(--muted); font-size: 7px; }
  .principal-symbol-grid { display: grid; grid-template-columns: 1fr 1.45fr; border: 1px solid var(--line); border-top: 0; min-height: 72px; }
  .principal-symbol-grid > div { padding: 8px; min-width: 0; }
  .principal-symbol-grid > div + div { border-left: 1px solid var(--line); }
  .symbols-box { font-size: 6.7px; line-height: 1.45; }
  .symbols-title { margin: -8px -8px 6px; padding: 4px 8px; background: var(--panel); border-bottom: 1px solid var(--line); font-size: 7.5px; font-weight: 700; }
  .symbols-list { display: flex; flex-direction: column; gap: 3px; }
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

  <section class="report-title">
    <strong>PROGRESS REPORT</strong>
    <span>${escapeHtml(model.currentTermName)}${model.academicYear ? ` – ${escapeHtml(model.academicYear)}` : ""}</span>
  </section>

  <section class="learner-details">
    <div class="detail-cell"><span class="detail-label">Learner:</span>${escapeHtml(model.learnerName || "—")}${model.admissionNumber ? ` <span>(${escapeHtml(model.admissionNumber)})</span>` : ""}</div>
    <div class="detail-cell"><span class="detail-label">Academic Year:</span>${escapeHtml(model.academicYear || "—")}</div>
    <div class="detail-cell"><span class="detail-label">Grade:</span>${escapeHtml(model.grade || "—")}</div>
    <div class="detail-cell"><span class="detail-label">Class:</span>${escapeHtml(model.registerClass || "—")}</div>
  </section>

  ${resultsTable(input)}

  <section class="average-row"><span>Learner Average:</span><strong>${escapeHtml(model.learnerAverage || "—")}</strong></section>

  <section class="remarks">
    <div class="remarks-title">Remarks</div>
    <div class="remarks-text">${escapeHtml(remarks)}</div>
  </section>

  <section class="signoff-grid">
    <div class="signature-box">
      <div class="signature-line"></div>
      <div class="signature-label">Register Teacher</div>
      <div class="signature-name">Register Teacher: ${escapeHtml(teacherName)}</div>
    </div>
    <div class="centre-box">
      <div>Days Absent<br /><strong>${escapeHtml(model.absentDays || "0")}</strong></div>
      ${model.nextTermStartsOn ? `<div>School Re-Opens Next Term<br /><strong>${escapeHtml(model.nextTermStartsOn)}</strong></div>` : ""}
    </div>
    <div class="stamp-box">School Stamp</div>
  </section>

  <section class="principal-symbol-grid">
    <div class="signature-box">
      <div class="signature-line"></div>
      <div class="signature-label">Principal</div>
      <div class="signature-name">Principal: ${escapeHtml(principalName)}</div>
    </div>
    <div class="symbols-box">
      <div class="symbols-title">Symbols</div>
      <div class="symbols-list">
        ${nonPromotionalLegend}
        ${passLegend}
      </div>
    </div>
  </section>

  <footer class="document-meta">
    <span>ScolaPro certified snapshot v${escapeHtml(model.snapshotVersion)} · Historical marks and report rules are frozen at generation.</span>
    <span>${model.certifiedAt ? `Certified ${escapeHtml(model.certifiedAt)}` : "Draft snapshot"}</span>
  </footer>
</main>
</body>
</html>`;
}
