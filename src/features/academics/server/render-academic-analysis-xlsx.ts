import "server-only";

import * as XLSX from "xlsx";
import type { AcademicAnalysisWorkspace } from "@/features/academics/server/academic-analysis";

export function renderAcademicAnalysisXlsx(workspace: AcademicAnalysisWorkspace): Buffer {
  const basisLabel = workspace.basis === "official" ? "OFFICIAL" : "PROVISIONAL";
  const rows = workspace.exportRows.map((row) => ({
    Grade: row.grade,
    Class: row.className,
    Subject: row.subject,
    Teacher: row.teacher,
    Assessed: row.assessed,
    Average: row.average,
    Median: row.median,
    "Pass %": row.passRate,
    "Fail %": row.failRate,
    Symbols: row.symbols,
  }));
  const sheet = XLSX.utils.json_to_sheet(rows, { origin: "A5" });
  XLSX.utils.sheet_add_aoa(sheet, [
    ["ScolaPro Academic Analysis"],
    [`Academic year ${workspace.academicYear} · Term ${workspace.termNumber}`],
    [`Basis: ${basisLabel}`],
    [workspace.basis === "provisional"
      ? "Provisional analysis — calculated from current working assessment evidence; not approved official results."
      : "Official analysis — derived from approved official results."],
  ], { origin: "A1" });
  sheet["!cols"] = [
    { wch: 14 }, { wch: 14 }, { wch: 26 }, { wch: 28 }, { wch: 10 },
    { wch: 11 }, { wch: 11 }, { wch: 10 }, { wch: 10 }, { wch: 32 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Symbol distribution");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx", compression: true }));
}

export function academicAnalysisXlsxFilename(workspace: AcademicAnalysisWorkspace): string {
  return `academic-analysis-${workspace.academicYear}-term-${workspace.termNumber}-${workspace.basis}.xlsx`;
}
