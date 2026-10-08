import "server-only";

import type {
  OfficialAttendanceSummary,
  OfficialSexSplit,
  OfficialSummaryClassRow,
  OfficialSummaryGradeRow,
} from "@/features/attendance/server/official-summary";
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

type SourceRow = OfficialSummaryClassRow | OfficialSummaryGradeRow;
type Column = {
  key: string;
  label: string;
  possibleAttendances: number;
  percentAbsence: number | null;
  split: (row: SourceRow) => OfficialSexSplit;
};
type TableRow = {
  kind: "grade" | "class" | "gradeTotal" | "schoolTotal" | "possible" | "percent";
  label: string;
  source?: SourceRow;
};

const TERM_WEEKS_PER_PANEL = 8;
const ROWS_PER_PAGE = 34;

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatPercent(value: number | null) {
  return value === null ? "n.a." : `${value.toFixed(1)}%`;
}

function conciseClassLabel(className: string) {
  return className.trim().replace(/^grade\s+/i, "");
}

function mondayFor(date: string) {
  const value = new Date(`${date}T12:00:00`);
  const day = value.getDay();
  value.setDate(value.getDate() + (day === 0 ? -6 : 1 - day));
  return value.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function emptySplit(): OfficialSexSplit {
  return { boys: 0, girls: 0, total: 0 };
}

function addSplit(target: OfficialSexSplit, value: OfficialSexSplit) {
  target.boys += value.boys;
  target.girls += value.girls;
  target.total += value.total;
  return target;
}

function splitForWeek(row: SourceRow, weekId: string) {
  return row.weekly.find((week) => week.weekId === weekId)?.absences ?? emptySplit();
}

function splitForDate(row: SourceRow, date: string) {
  return row.daily.find((day) => day.date === date)?.absences ?? emptySplit();
}

function groupedRows(summary: OfficialAttendanceSummary) {
  const grades = summary.gradeRows.map((grade) => ({
    grade,
    classes: summary.classRows.filter((row) =>
      grade.gradeId ? row.gradeId === grade.gradeId : row.gradeId === null && row.gradeName === grade.gradeName,
    ),
  }));
  const covered = new Set(grades.flatMap((group) => group.classes.map((row) => row.classId)));
  return { grades, ungrouped: summary.classRows.filter((row) => !covered.has(row.classId)) };
}

function buildRows(summary: OfficialAttendanceSummary): TableRow[] {
  const groups = groupedRows(summary);
  const rows: TableRow[] = [];
  for (const group of groups.grades) {
    rows.push({ kind: "grade", label: group.grade.gradeName });
    for (const row of group.classes) rows.push({ kind: "class", label: conciseClassLabel(row.className), source: row });
    rows.push({ kind: "gradeTotal", label: `${group.grade.gradeName} total`, source: group.grade });
  }
  for (const row of groups.ungrouped) rows.push({ kind: "class", label: conciseClassLabel(row.className), source: row });
  rows.push({ kind: "schoolTotal", label: "SCHOOL TOTAL" });
  rows.push({ kind: "possible", label: "POSSIBLE ATTENDANCES" });
  rows.push({ kind: "percent", label: "% ABSENCE" });
  return rows;
}

function weeklyColumns(summary: OfficialAttendanceSummary): Column[] {
  const monday = mondayFor(summary.scopeEnd);
  const dailyTotals = summary.schoolTotals.daily ?? [];
  const days = Array.from({ length: 5 }, (_, offset) => {
    const date = addDays(monday, offset);
    const total = dailyTotals.find((item) => item.date === date);
    return {
      key: date,
      label: new Intl.DateTimeFormat("en-NA", { weekday: "long" }).format(new Date(`${date}T12:00:00`)),
      possibleAttendances: total?.possibleAttendances ?? 0,
      percentAbsence: total?.percentAbsence ?? null,
      split: (row: SourceRow) => splitForDate(row, date),
    };
  });
  return [...days, {
    key: "weekly-total",
    label: "Total Absent",
    possibleAttendances: summary.schoolTotals.possibleAttendances,
    percentAbsence: summary.schoolTotals.percentAbsence,
    split: (row: SourceRow) => row.daily.reduce((total, day) => addSplit(total, day.absences), emptySplit()),
  }];
}

function columnPanels(summary: OfficialAttendanceSummary): Column[][] {
  if (summary.mode === "week") return [weeklyColumns(summary)];
  const panels: Column[][] = [];
  for (let index = 0; index < summary.schoolTotals.weekly.length; index += TERM_WEEKS_PER_PANEL) {
    const columns: Column[] = summary.schoolTotals.weekly.slice(index, index + TERM_WEEKS_PER_PANEL).map((week) => ({
      key: week.weekId,
      label: week.weekLabel,
      possibleAttendances: week.possibleAttendances,
      percentAbsence: week.percentAbsence,
      split: (row) => splitForWeek(row, week.weekId),
    }));
    columns.push({
      key: "term-total",
      label: "Term Absent",
      possibleAttendances: summary.schoolTotals.possibleAttendances,
      percentAbsence: summary.schoolTotals.percentAbsence,
      split: (row) => row.absences,
    });
    panels.push(columns);
  }
  return panels.length ? panels : [[{
    key: "term-total",
    label: "Term Absent",
    possibleAttendances: summary.schoolTotals.possibleAttendances,
    percentAbsence: summary.schoolTotals.percentAbsence,
    split: (row) => row.absences,
  }]];
}

function schoolSplit(summary: OfficialAttendanceSummary, column: Column) {
  return summary.classRows.reduce((total, row) => addSplit(total, column.split(row)), emptySplit());
}

function splitCell(split: OfficialSexSplit) {
  return `<td class="metric"><strong>${split.total}</strong><small>${split.boys}B / ${split.girls}G</small></td>`;
}

function renderRow(summary: OfficialAttendanceSummary, row: TableRow, columns: Column[]) {
  const cells = columns.map((column) => {
    if (row.kind === "grade") return "<td></td>";
    if (row.kind === "possible") return `<td class="number">${column.possibleAttendances}</td>`;
    if (row.kind === "percent") return `<td class="number">${escapeHtml(formatPercent(column.percentAbsence))}</td>`;
    return splitCell(row.kind === "schoolTotal" ? schoolSplit(summary, column) : column.split(row.source!));
  }).join("");
  return `<tr class="${row.kind}"><th>${escapeHtml(row.label)}</th>${cells}</tr>`;
}

export function renderOfficialAttendanceSummaryHtml(input: OfficialAttendanceSummaryHtmlInput): string {
  const summary = input.summary;
  const rows = buildRows(summary);
  const panels = columnPanels(summary);
  const chunks: TableRow[][] = [];
  for (let index = 0; index < rows.length; index += ROWS_PER_PAGE) chunks.push(rows.slice(index, index + ROWS_PER_PAGE));
  if (!chunks.length) chunks.push([]);
  const finalizedLabel = new Intl.DateTimeFormat("en-NA", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(input.finalizedAt));
  const pageCount = panels.length * chunks.length;
  let pageNumber = 0;

  const pages = panels.flatMap((columns, panelIndex) => chunks.map((chunk, chunkIndex) => {
    pageNumber += 1;
    const panelLabel = panels.length > 1 ? ` · Panel ${panelIndex + 1}/${panels.length}` : "";
    const isLast = panelIndex === panels.length - 1 && chunkIndex === chunks.length - 1;
    return `<section class="report">
      ${renderOfficialDocumentHtmlHeader(input.header, undefined, { context: {
        title: summary.mode === "term" ? "TERM SUMMARY OF ABSENTEES" : "WEEKLY SUMMARY OF ABSENTEES",
        primaryContext: `${summary.term?.displayName ?? (summary.mode === "week" ? "Weekly register" : "Selected term")}${panelLabel}`,
        secondaryContext: `Academic year ${new Date(`${summary.scopeEnd}T12:00:00`).getFullYear()}`,
        summary: `${summary.scopeStart} · ${summary.scopeEnd}`,
      } })}
      <div class="meta"><span>Reporting period: ${summary.scopeStart} – ${summary.scopeEnd}</span><span>Revision ${input.revision} · Ref ${escapeHtml(input.scolaproReference)} · Finalized ${escapeHtml(finalizedLabel)}</span></div>
      <table><thead><tr><th class="label-head">REGISTER CLASS</th>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr></thead><tbody>${chunk.map((row) => renderRow(summary, row, columns)).join("")}</tbody></table>
      <footer><span>Absent learner-days: ${summary.schoolTotals.absentLearnerDays} · Possible attendances: ${summary.schoolTotals.possibleAttendances} · Overall % absence: ${escapeHtml(formatPercent(summary.schoolTotals.percentAbsence))}</span><span>Page ${pageNumber} of ${pageCount}</span>${isLast && input.qrSvg ? `<span class="qr">${input.qrSvg}<em>Verify: ${escapeHtml(input.verificationUrl)}</em></span>` : ""}</footer>
    </section>`;
  })).join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Summary of Absentees — ${escapeHtml(input.header.schoolName)}</title><style>
    :root { --ink:#171717; --muted:#5b5b5b; --line:#6e7278; --tint:#eef2f7; --tintStrong:#e2e8f1; }
    * { box-sizing:border-box; }
    @page { size:A3 landscape; margin:8mm; }
    body { font-family:Helvetica,Arial,sans-serif; color:var(--ink); margin:0; background:#fff; }
    ${OFFICIAL_DOCUMENT_HTML_HEADER_RULE}
    ${OFFICIAL_DOCUMENT_LANDSCAPE_SCREEN_RULE}
    .report { min-height:272mm; padding:7mm 7mm 5mm; break-after:page; position:relative; }
    .report:last-child { break-after:auto; }
    .meta { display:flex; justify-content:space-between; gap:8px; margin:5px 0 7px; font-size:7px; color:var(--muted); }
    table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:7px; }
    th,td { border:.7px solid var(--line); height:18px; padding:2px 3px; text-align:center; line-height:1.05; }
    thead th { background:var(--tintStrong); font-weight:700; }
    .label-head, tbody th { width:112px; text-align:left; padding-left:6px; }
    tbody th { font-weight:600; white-space:nowrap; }
    .grade th,.grade td,.schoolTotal th,.schoolTotal td { background:var(--tintStrong); font-weight:700; }
    .gradeTotal th,.gradeTotal td { background:var(--tint); font-weight:700; }
    .possible th,.possible td,.percent th,.percent td { background:#fafbfc; font-weight:700; }
    .metric strong { font-size:8px; }
    .metric small { margin-left:5px; color:var(--muted); font-size:5.4px; white-space:nowrap; }
    .number { font-weight:700; font-variant-numeric:tabular-nums; }
    footer { position:absolute; left:7mm; right:7mm; bottom:4mm; display:flex; align-items:flex-end; justify-content:space-between; gap:10px; font-size:6.5px; color:var(--muted); }
    .qr { display:flex; align-items:center; gap:4px; max-width:260px; }
    .qr svg { width:32px; height:32px; flex:none; }
    .qr em { font-style:normal; overflow-wrap:anywhere; }
    @media print { .report { break-inside:avoid; } }
  </style></head><body>${pages}</body></html>`;
}
