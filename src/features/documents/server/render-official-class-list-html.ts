import "server-only";

import {
  OFFICIAL_DOCUMENT_A4_PAGE_RULE,
  OFFICIAL_DOCUMENT_FRAME_RULE,
  OFFICIAL_DOCUMENT_HEADER_RULE,
  OFFICIAL_DOCUMENT_METADATA_RULE,
  OFFICIAL_DOCUMENT_PRINT_RULE,
} from "@/features/documents/server/official-document-chrome";
import { renderOfficialDocumentHtmlFooter } from "@/features/documents/server/official-document-html-footer";
import {
  escapeOfficialDocumentHtml,
  renderOfficialDocumentHtmlHeader,
} from "@/features/documents/server/official-document-html-header";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";

export type OfficialClassListRow = {
  learnerName: string;
  admissionNumber?: string | null;
  sex?: string | null;
  status?: string | null;
};

export type OfficialClassListDocumentInput = {
  header: OfficialDocumentHeaderModel;
  academicYear: number;
  grade: string;
  registerClass: string;
  rows: OfficialClassListRow[];
  generatedAt?: string | null;
  registerTeacherName?: string | null;
};

export function renderOfficialClassListHtml(input: OfficialClassListDocumentInput): string {
  const { header } = input;
  const rowMarkup = input.rows
    .map(
      (row, index) => `<tr>
        <td class="number-cell">${index + 1}</td>
        <td>${escapeOfficialDocumentHtml(row.learnerName)}</td>
        <td>${escapeOfficialDocumentHtml(row.admissionNumber || "—")}</td>
        <td>${escapeOfficialDocumentHtml(row.sex || "—")}</td>
        <td>${escapeOfficialDocumentHtml(row.status || "—")}</td>
      </tr>`,
    )
    .join("");
  const generatedLine = input.generatedAt ? `Generated ${escapeOfficialDocumentHtml(input.generatedAt)}` : "Official school document";
  const metadataFooter = renderOfficialDocumentHtmlFooter({
    left: "ScolaPro official class list",
    right: `${input.registerClass} · ${input.academicYear}`,
  });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeOfficialDocumentHtml(header.schoolName)} - ${escapeOfficialDocumentHtml(input.registerClass)} Class List</title>
<style>
  ${OFFICIAL_DOCUMENT_A4_PAGE_RULE}
  * { box-sizing: border-box; }
  :root { --ink: #151515; --line: #4a4a4a; --muted: #555; }
  html, body { margin: 0; padding: 0; background: #fff; color: var(--ink); }
  body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 10px; line-height: 1.25; }
  ${OFFICIAL_DOCUMENT_FRAME_RULE}
  ${OFFICIAL_DOCUMENT_HEADER_RULE}
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
  .document-title { border: 1px solid var(--line); border-top: 0; padding: 8px 10px; text-align: center; }
  .document-title h2 { margin: 0; font-size: 13px; line-height: 1.15; }
  .document-title .context { margin-top: 4px; font-size: 8px; display: flex; justify-content: center; gap: 14px; flex-wrap: wrap; }
  .class-list { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .class-list th, .class-list td { border: 1px solid var(--line); padding: 4px 5px; vertical-align: middle; }
  .class-list th { text-align: left; font-size: 7.3px; font-weight: 700; }
  .class-list td { font-size: 7.5px; }
  .class-list .number-cell { width: 7%; text-align: center; font-variant-numeric: tabular-nums; }
  .class-list th:nth-child(2) { width: 42%; }
  .class-list th:nth-child(3) { width: 21%; }
  .class-list th:nth-child(4) { width: 12%; }
  .class-list th:nth-child(5) { width: 18%; }
  .empty-row { text-align: center; color: var(--muted); padding: 14px 6px !important; }
  .class-summary { display: flex; justify-content: space-between; gap: 12px; border: 1px solid var(--line); border-top: 0; padding: 6px 8px; font-size: 7px; }
  ${OFFICIAL_DOCUMENT_METADATA_RULE}
  .document-meta span:last-child { text-align: right; }
  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    ${OFFICIAL_DOCUMENT_PRINT_RULE}
  }
</style>
</head>
<body>
<main class="report">
  ${renderOfficialDocumentHtmlHeader(header)}

  <section class="document-title">
    <h2>Class List</h2>
    <div class="context">
      <span><strong>Academic Year:</strong> ${escapeOfficialDocumentHtml(input.academicYear)}</span>
      <span><strong>Grade:</strong> ${escapeOfficialDocumentHtml(input.grade || "—")}</span>
      <span><strong>Class:</strong> ${escapeOfficialDocumentHtml(input.registerClass || "—")}</span>
      ${input.registerTeacherName ? `<span><strong>Register Teacher:</strong> ${escapeOfficialDocumentHtml(input.registerTeacherName)}</span>` : ""}
    </div>
  </section>

  <table class="class-list">
    <thead>
      <tr><th class="number-cell">No.</th><th>Learner</th><th>Admission No.</th><th>Sex</th><th>Status</th></tr>
    </thead>
    <tbody>
      ${rowMarkup || `<tr><td colspan="5" class="empty-row">No learners in this class list.</td></tr>`}
    </tbody>
  </table>

  <section class="class-summary">
    <span><strong>Total learners:</strong> ${input.rows.length}</span>
    <span>${generatedLine}</span>
  </section>

  ${metadataFooter}
</main>
</body>
</html>`;
}
