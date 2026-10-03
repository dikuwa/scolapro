import "server-only";

import * as XLSX from "xlsx";
import type { AcademicAnalysisView, AcademicAnalysisWorkspace } from "@/features/academics/server/academic-analysis";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";

function addHeader(
  sheet: XLSX.WorkSheet,
  workspace: AcademicAnalysisWorkspace,
  header: OfficialDocumentHeaderModel,
  view: AcademicAnalysisView,
) {
  XLSX.utils.sheet_add_aoa(sheet, [
    [header.schoolName],
    [header.contactLines.map((line) => line.text).join(" · ")],
    ["Academic Analysis — " + ({ overview: "Overview", results: "Results", grades: "Grades & Classes", learners: "Learners & Risk", trends: "Trends" }[view])],
    ["Academic year " + workspace.academicYear + " · Term " + workspace.termNumber + " · Basis: " + workspace.basis.toUpperCase()],
  ], { origin: "A1" });
}

export function renderAcademicAnalysisXlsx(
  workspace: AcademicAnalysisWorkspace,
  header: OfficialDocumentHeaderModel,
  view: AcademicAnalysisView,
): Buffer {
  const workbook = XLSX.utils.book_new();

  if (view === "overview") {
    const rows = workspace.topLearners.map((row) => ({
      Learner: row.learnerName,
      "Admission No.": row.admissionNumber,
      Grade: row.grade,
      Class: row.className,
      Average: row.average,
      Risk: row.riskLevel,
    }));
    const sheet = XLSX.utils.json_to_sheet(rows, { origin: "A6" });
    addHeader(sheet, workspace, header, view);
    XLSX.utils.sheet_add_aoa(sheet, [[
      "Learners analysed", workspace.learnerRiskRows.length,
      "High risk", workspace.learnerRiskRows.filter((row) => row.riskLevel === "high").length,
      "2+ failures", workspace.learnerRiskRows.filter((row) => row.failedSubjects >= 2).length,
    ]], { origin: "A5" });
    XLSX.utils.book_append_sheet(workbook, sheet, "Overview");
  } else if (view === "results") {
    const rows = workspace.rows.map((row) => ({
      Grade: row.grade,
      Class: row.className ?? "",
      Subject: row.subject,
      Teacher: row.teacher ?? "",
      Assessed: row.summary.assessedLearners,
      Average: row.summary.average,
      Median: row.summary.median,
      "Pass %": row.summary.passRate,
      "Fail %": row.summary.failRate,
      "Quality %": row.summary.qualityRate,
      Symbols: row.summary.symbolDistribution.map((band) => band.symbol + " " + band.count).join(" · "),
    }));
    const sheet = XLSX.utils.json_to_sheet(rows, { origin: "A5" });
    addHeader(sheet, workspace, header, view);
    XLSX.utils.book_append_sheet(workbook, sheet, "Results");
  } else if (view === "grades") {
    const rows = [
      ...workspace.gradeSummaries.map((row) => ({ Type: "Grade", Group: row.label, Assessed: row.summary.assessedLearners, Average: row.summary.average, "Pass %": row.summary.passRate, "Fail %": row.summary.failRate })),
      ...workspace.classSummaries.map((row) => ({ Type: "Class", Group: row.label, Assessed: row.summary.assessedLearners, Average: row.summary.average, "Pass %": row.summary.passRate, "Fail %": row.summary.failRate })),
    ];
    const sheet = XLSX.utils.json_to_sheet(rows, { origin: "A5" });
    addHeader(sheet, workspace, header, view);
    XLSX.utils.book_append_sheet(workbook, sheet, "Grades and Classes");
  } else if (view === "learners") {
    const rows = workspace.learnerRiskRows.map((row) => ({
      Learner: row.learnerName,
      "Admission No.": row.admissionNumber,
      Grade: row.grade,
      Class: row.className,
      Average: row.average,
      Failures: row.failedSubjects,
      "Promotional failures": row.promotionalSubjectFailures,
      "Near threshold": row.nearThresholdSubjects,
      "Promotion readiness": row.promotionReadiness.recommendedOutcome ?? row.promotionReadiness.status,
      Risk: row.riskLevel,
    }));
    const sheet = XLSX.utils.json_to_sheet(rows, { origin: "A5" });
    addHeader(sheet, workspace, header, view);
    XLSX.utils.book_append_sheet(workbook, sheet, "Learners and Risk");
  } else {
    const rows = workspace.trends.map((row) => ({
      Grade: row.grade,
      Subject: row.subject,
      "Term-on-term pp": row.termOnTerm.passRateDelta,
      "Year-on-year pp": row.yearOnYear.passRateDelta,
      "Term comparability": row.termOnTerm.reason ?? "Comparable governed series",
      "Year comparability": row.yearOnYear.reason ?? "Comparable governed series",
    }));
    const sheet = XLSX.utils.json_to_sheet(rows, { origin: "A5" });
    addHeader(sheet, workspace, header, view);
    XLSX.utils.book_append_sheet(workbook, sheet, "Trends");
  }

  for (const name of workbook.SheetNames) {
    workbook.Sheets[name]["!cols"] = Array.from({ length: 12 }, () => ({ wch: 20 }));
  }
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx", compression: true }));
}

export function academicAnalysisXlsxFilename(workspace: AcademicAnalysisWorkspace, view: AcademicAnalysisView): string {
  return "academic-analysis-" + view + "-" + workspace.academicYear + "-term-" + workspace.termNumber + "-" + workspace.basis + ".xlsx";
}
