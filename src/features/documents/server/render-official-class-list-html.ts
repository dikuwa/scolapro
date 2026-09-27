import "server-only";

import {
  OFFICIAL_DOCUMENT_A4_PAGE_RULE,
  OFFICIAL_DOCUMENT_HTML_HEADER_RULE,
  OFFICIAL_DOCUMENT_METADATA_RULE,
  OFFICIAL_DOCUMENT_PRINT_RULE,
} from "@/features/documents/server/official-document-chrome";
import { renderOfficialDocumentHtmlFooter } from "@/features/documents/server/official-document-html-footer";
import {
  escapeOfficialDocumentHtml,
  renderOfficialDocumentHtmlHeader,
} from "@/features/documents/server/official-document-html-header";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import { buildOfficialClassListColumns, classListDocumentName } from "@/features/documents/server/class-list-document";
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
  roomName?: string | null;
  responsibleTeacherName?: string | null;
};

function normalizedSex(value: string | null): "M" | "F" | "" {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "male" || normalized === "m") return "M";
  if (normalized === "female" || normalized === "f") return "F";
  return "";
}

export function renderOfficialClassListHtml(input: OfficialClassListDocumentInput): string {
  const { header } = input;
  const columns = buildOfficialClassListColumns(input.columns ?? ["admissionNumber", "sex", "status"], input.blankColumns ?? 0);
  const rowMarkup = input.rows
    .map(
      (row, index) => `<tr>${columns.map((column) => `<td class="${column.key === "number" ? "number-cell" : ""} column-${column.key}">${escapeOfficialDocumentHtml(column.value(row, index))}</td>`).join("")}</tr>`,
    )
    .join("");

  const maleCount = input.rows.filter((row) => normalizedSex(row.sex) === "M").length;
  const femaleCount = input.rows.filter((row) => normalizedSex(row.sex) === "F").length;
  const operationalMeta = [
    input.roomName ? `<span><strong>Room:</strong> ${escapeOfficialDocumentHtml(input.roomName)}</span>` : "",
    input.responsibleTeacherName ? `<span><strong>Responsible teacher:</strong> ${escapeOfficialDocumentHtml(input.responsibleTeacherName)}</span>` : "",
  ].filter(Boolean).join("");
  const metadataFooter = renderOfficialDocumentHtmlFooter({
    left: `Total learners: ${input.rows.length}`,
    right: `${input.registerClass} · ${input.academicYear}`,
  });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeOfficialDocumentHtml(header.schoolName)} - ${escapeOfficialDocumentHtml(classListDocumentName(input.registerClass, input.rosterTitle))}</title>
<style>
  ${OFFICIAL_DOCUMENT_A4_PAGE_RULE}
  * { box-sizing: border-box; }
  :root { --ink: #151515; --line: #4a4a4a; --muted: #666; }
  html, body { margin: 0; padding: 0; background: #fff; color: var(--ink); }
  body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 9px; line-height: 1.2; }
  .report { padding: 6mm 7mm 5mm; }
  .class-document { display: table; width: auto; max-width: 100%; }
  ${OFFICIAL_DOCUMENT_HTML_HEADER_RULE}
  .class-operational-meta { display:flex; align-items:center; gap:16px; min-height:16px; border:1px solid var(--line); border-top:0; padding:2px 7px; font-size:6.5px; line-height:1.1; }
  .class-operational-meta strong { font-weight:700; }
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
  .class-list td.column-guardianAddress { min-width: 100px; max-width: 150px; white-space: pre-line; }
  .class-list .number-cell { text-align: center; font-variant-numeric: tabular-nums; }
  .class-list thead { display: table-header-group; }
  .class-list tr { break-inside: avoid; page-break-inside: avoid; }
  .empty-row { text-align: center; color: var(--muted); padding: 12px 6px !important; }
  ${OFFICIAL_DOCUMENT_METADATA_RULE}
  .document-meta { width: 100%; font-size: 5.7px; }
  .document-meta span:last-child { text-align: right; }
  @media (max-width: 640px) {
    .class-operational-meta { align-items:flex-start; flex-direction:column; gap:2px; }
  }
  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .report { padding: 0; }
    ${OFFICIAL_DOCUMENT_PRINT_RULE}
    .class-document { break-inside: auto; }
    .school-header, .class-operational-meta, thead, tr, .document-meta { break-inside: avoid; page-break-inside: avoid; }
  }
</style>
</head>
<body>
<main class="report">
  <section class="class-document">
    ${renderOfficialDocumentHtmlHeader(header, undefined, {
      context: {
        title: classListDocumentName(input.registerClass, input.rosterTitle),
        primaryContext: `${input.grade || "—"} · ${input.registerClass || "—"} · ${input.academicYear}`,
        summary: `Male ${maleCount} · Female ${femaleCount} · ${input.rows.length} learners`,
      },
    })}
    ${operationalMeta ? `<div class="class-operational-meta">${operationalMeta}</div>` : ""}

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
