import "server-only";

import * as XLSX from "xlsx";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import {
  OFFICIAL_DOCUMENT_WORKBOOK_TABLE_HEADER_ROW,
  buildOfficialDocumentWorkbookSheet,
  finalizeOfficialDocumentWorkbook,
  type OfficialDocumentWorkbookSheetSpec,
} from "@/features/documents/server/official-document-xlsx-chrome";
import { academicScheduleColumnWidth } from "@/features/reporting/academic-schedule-column-layout";
import type { AcademicSchedulePayload } from "@/features/reporting/server/academic-schedules";

export type AcademicScheduleIssuedLifecycle = {
  version: number;
  status: "finalized" | "superseded";
  finalizedAt: string;
  supersessionReason: string | null;
};

const SCHEDULE_MIN_COLUMNS = 6;

/** Legacy-content QA assertion mirror: the normalized `classNames` expression
 *  that appears in the pre-migration renderer. Kept here so document QA still
 *  matches the shared-chrome renderer after the migration. */
function classNamesContext(payload: AcademicSchedulePayload): string {
  return (payload.classNames ?? []).join(", ") || "All classes in grade";
}

/**
 * Academic schedules previously emitted a plain SheetJS workbook with no
 * governed identity block, styles or logo. They now share the same chrome as
 * class lists and house rosters so every ScolaPro XLSX family is consistent and
 * packaged by one deterministic OOXML pass.
 */
export function renderAcademicScheduleXlsx(
  payload: AcademicSchedulePayload,
  header: OfficialDocumentHeaderModel,
  lifecycle?: AcademicScheduleIssuedLifecycle,
  logoBytes: Uint8Array | null = null,
): Buffer {
  const columns = payload.columns;
  const columnCount = Math.max(columns.length, SCHEDULE_MIN_COLUMNS);
  const metaStartColumn = Math.max(3, Math.floor(columnCount * 0.58));

  const classNamesContextValue = classNamesContext(payload);

  const scopeContext =
    "Academic year " + payload.academicYear + " · " + payload.periodLabel + " · " +
    (payload.grade || "Not recorded") + " · " + classNamesContextValue +
    " · Basis: " + payload.basis.toUpperCase();

  const supersededNotice = lifecycle?.status === "superseded"
    ? "SUPERSEDED — retained historical version; not the current official schedule." +
      (lifecycle.supersessionReason ? " Correction reason: " + lifecycle.supersessionReason : "")
    : "";

  const rowValues = (row: Record<string, string | number | null>) =>
    columns.map((column) => row[column] ?? "");

  const tableRows: Array<Array<string | number>> = [
    ...payload.rows.map(rowValues),
    ...(payload.footerRows ?? []).map(rowValues),
  ];

  const trailingRows: Array<Array<string | number>> = [];
  if (payload.scheduleType !== "term_schedule") {
    trailingRows.push(
      [],
      ["CERTIFICATION"],
      ["Class Teacher", "Signature", "Name", "Date"],
      ["Principal", "Signature", "Name", "Date"],
      ["Regional Director", "Signature", "Name", "Date"],
      [],
      ["OUTCOME ANALYSIS"],
      ["Outcome", "Female", "Male", "Total"],
      ...(payload.outcomeAnalysis ?? []).map((row) => [row.outcome, row.female ?? "", row.male ?? "", row.total ?? ""] as Array<string | number>),
    );
  } else {
    trailingRows.push(
      [],
      ["Name", "Signature", "Date", "School Stamp"],
      ["* Adjustment", "_ Mark below governed pass mark"],
    );
  }

  const spec: OfficialDocumentWorkbookSheetSpec = {
    sheetNumber: 1,
    tableHeaderRow: OFFICIAL_DOCUMENT_WORKBOOK_TABLE_HEADER_ROW,
    dataRowCount: tableRows.length,
    columnCount,
    metaStartColumn,
    header,
  };

  const worksheet = buildOfficialDocumentWorkbookSheet({
    header,
    context: {
      title: payload.title,
      primaryContext: scopeContext,
      summary: lifecycle
        ? "Issued version v" + lifecycle.version + " · " + lifecycle.status.toUpperCase() +
          " · Finalized " + new Date(lifecycle.finalizedAt).toLocaleString("en-NA")
        : "Generated " + payload.generatedAt,
    },
    metaStartColumn,
    columnCount,
    columnWidths: (() => {
      const subjectNames = (payload.subjects ?? []).map((subject) => subject.name);
      return Array.from({ length: columnCount }, (_, index) =>
        columns[index] ? academicScheduleColumnWidth(columns[index], subjectNames) : 12,
      );
    })(),
    dataHeaders: columns,
    dataRows: tableRows,
    trailingRows,
    operationalLine: supersededNotice || undefined,
    landscape: true,
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, payload.title.slice(0, 31));
  workbook.Props = { Title: payload.title, Subject: "ScolaPro academic schedule", Author: header.schoolName };
  const baseBytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx", compression: true, cellStyles: true }) as Buffer;
  return finalizeOfficialDocumentWorkbook(baseBytes, [spec], logoBytes);
}

export function academicScheduleXlsxFilename(
  payload: AcademicSchedulePayload,
  lifecycle?: AcademicScheduleIssuedLifecycle,
) {
  const issued=lifecycle?"-v"+lifecycle.version+"-"+lifecycle.status:"";
  return payload.scheduleType + "-" + payload.academicYear + "-" + ((payload.period??(payload.scheduleType==="promotion_all_terms"?"all_terms":"term"))==="all_terms"?"all-terms":"term-"+payload.termNumber) + "-" + payload.basis + issued + ".xlsx";
}
