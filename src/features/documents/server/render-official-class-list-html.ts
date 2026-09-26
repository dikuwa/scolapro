import "server-only";

import {
  OFFICIAL_DOCUMENT_A4_PAGE_RULE,
  OFFICIAL_DOCUMENT_METADATA_RULE,
} from "@/features/documents/server/official-document-chrome";
import { renderOfficialDocumentHtmlFooter } from "@/features/documents/server/official-document-html-footer";
import { escapeOfficialDocumentHtml } from "@/features/documents/server/official-document-html-header";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import { buildOfficialClassListColumns } from "@/features/documents/server/class-list-document";
import type { ClassListColumnId, ClassListLearnerRow } from "@/features/learners/class-list-types";

export type OfficialClassListRow = ClassListLearnerRow;

export type OfficialClassListDocumentInput = {
  header: OfficialDocumentHeaderModel;
  academicYear: number;
  grade: string;
  registerClass: string;
  rows: OfficialClassListRow[];
  columns?: ClassListColumnId[];
  blankColumns?: number;
  rosterTitle?: string | null;
  generatedAt?: string | null;
  registerTeacherName?: string | null;
};

export function renderOfficialClassListHtml(input: OfficialClassListDocumentInput): string {
  const { header } = input;
  const columns = buildOfficialClassListColumns(input.columns ?? ["admissionNumber", "sex", "status"], input.blankColumns ?? 0);
  const rowMarkup = input.rows
    .map(
      (row, index) => `<tr>${columns.map((column) => `<td class="${column.key === "number" ? "number-cell" : ""}">${escapeOfficialDocumentHtml(column.value(row, index))}</td>`).join("")}</tr>`,
    )
    .join("");

  const logo = header.logoUrl
    ? `<img class="school-logo" src="${escapeOfficialDocumentHtml(header.logoUrl)}" alt="" />`
    : "";
  const teacherLine = input.registerTeacherName
    ? `<div><strong>Register teacher:</strong> ${escapeOfficialDocumentHtml(input.registerTeacherName)}</div>`
    : `<div><strong>Learners:</strong> ${input.rows.length}</div>`;
  const metadataFooter = renderOfficialDocumentHtmlFooter({
    left: `Total learners: ${input.rows.length}`,
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
  :root { --ink: #151515; --line: #4a4a4a; --muted: #666; }
  html, body { margin: 0; padding: 0; background: #fff; color: var(--ink); }
  body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 9px; line-height: 1.2; }
  .report { padding: 6mm 7mm 5mm; }
  .class-document { display: table; width: auto; max-width: 100%; }
  .class-list-header {
    display: grid;
    grid-template-columns: auto minmax(130px,1fr) minmax(140px,auto);
    align-items: center;
    gap: 7px;
    width: 100%;
    border: 1px solid var(--line);
    padding: 5px 7px;
    min-height: 55px;
  }
  .school-logo { display: block; width: auto; height: 42px; max-width: 48px; object-fit: contain; }
  .school-name { min-width: 0; margin: 0; font-size: 18px; line-height: 1; font-weight: 700; white-space: nowrap; }
  .school-name.old-english { font-family: "Old English Text MT", "UnifrakturCook", "Lucida Blackletter", "Times New Roman", serif; font-weight: 400; font-size: 22px; }
  .class-context { text-align: right; font-size: 7.5px; line-height: 1.35; white-space: nowrap; }
  .class-context .title { font-size: 11px; font-weight: 700; margin-bottom: 2px; }
  .class-list { width: auto; max-width: 100%; border-collapse: collapse; table-layout: auto; }
  .class-list col[data-column="number"] { width: 34px; }
  .class-list col[data-column="admissionNumber"] { width: 82px; }
  .class-list col[data-column="learner"] { width: 168px; }
  .class-list col[data-column="sex"] { width: 40px; }
  .class-list col[data-column="status"] { width: 64px; }
  .class-list col[data-column="registerClass"] { width: 88px; }
  .class-list col[data-column^="blank-"] { width: 70px; }
  .class-list th, .class-list td { border: 1px solid var(--line); padding: 2.2px 4px; vertical-align: middle; white-space: nowrap; }
  .class-list th { text-align: left; font-size: 7.2px; font-weight: 700; }
  .class-list td { font-size: 7.2px; }
  .class-list .number-cell { text-align: center; font-variant-numeric: tabular-nums; }
  .class-list thead { display: table-header-group; }
  .class-list tr { break-inside: avoid; page-break-inside: avoid; }
  .empty-row { text-align: center; color: var(--muted); padding: 12px 6px !important; }
  ${OFFICIAL_DOCUMENT_METADATA_RULE}
  .document-meta { width: 100%; font-size: 5.7px; }
  .document-meta span:last-child { text-align: right; }
  @media (max-width: 640px) {
    .class-list-header { grid-template-columns: auto minmax(0,1fr); }
    .class-context { grid-column: 1 / -1; text-align: left; white-space: normal; }
    .school-name { white-space: normal; }
  }
  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .report { padding: 0; }
    .class-document { break-inside: auto; }
    .class-list-header, thead, tr, .document-meta { break-inside: avoid; page-break-inside: avoid; }
  }
</style>
</head>
<body>
<main class="report">
  <section class="class-document">
    <header class="class-list-header">
      <div>${logo}</div>
      <h1 class="school-name ${header.schoolNameFont === "old_english" ? "old-english" : ""}">${escapeOfficialDocumentHtml(header.schoolName)}</h1>
      <div class="class-context">
        <div class="title">${escapeOfficialDocumentHtml(input.rosterTitle || input.registerClass || "Class List")}</div>
        <div><strong>Grade:</strong> ${escapeOfficialDocumentHtml(input.grade || "—")} · <strong>Class:</strong> ${escapeOfficialDocumentHtml(input.registerClass || "—")} · <strong>Year:</strong> ${escapeOfficialDocumentHtml(input.academicYear)}</div>
        ${teacherLine}
      </div>
    </header>

    <table class="class-list">
      <colgroup>${columns.map((column) => `<col data-column="${escapeOfficialDocumentHtml(column.key)}" />`).join("")}</colgroup>
      <thead>
        <tr>${columns.map((column) => `<th class="${column.key === "number" ? "number-cell" : ""}">${escapeOfficialDocumentHtml(column.label)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rowMarkup || `<tr><td colspan="${columns.length}" class="empty-row">No learners in this class list.</td></tr>`}
      </tbody>
    </table>

    ${metadataFooter}
  </section>
</main>
</body>
</html>`;
}
