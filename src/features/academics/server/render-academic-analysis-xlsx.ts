import "server-only";

import { Buffer } from "node:buffer";
import * as XLSX from "xlsx";
import type { AcademicAnalysisView, AcademicAnalysisWorkspace } from "@/features/academics/server/academic-analysis";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import {
  buildOfficialDocumentWorkbookSheet,
  finalizeOfficialDocumentWorkbook,
  OFFICIAL_DOCUMENT_WORKBOOK_TABLE_HEADER_ROW,
} from "@/features/documents/server/official-document-xlsx-chrome";

const VIEW_LABELS: Record<AcademicAnalysisView, string> = {
  overview: "Overview",
  results: "Results",
  grades: "Grades & Classes",
  learners: "Learners & Risk",
  promotion_exceptions: "Promotion Exceptions",
  trends: "Trends",
};

type AnalysisSheetData = {
  name: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  trailingRows?: Array<Array<string | number>>;
};

function cell(value: string | number | null | undefined): string | number {
  return value === null || value === undefined ? "" : value;
}

function analysisSheetData(
  workspace: AcademicAnalysisWorkspace,
  view: AcademicAnalysisView,
): AnalysisSheetData {
  if (view === "overview") {
    const riskAvailable = workspace.learnerRiskRows.some((row) => row.riskLevel !== "unavailable");
    return {
      name: "Overview",
      headers: ["Learner", "Admission No.", "Grade", "Class", "Average", "Risk"],
      rows: workspace.topLearners.map((row) => [
        row.learnerName,
        row.admissionNumber,
        row.grade,
        row.className,
        cell(row.average),
        row.riskLevel,
      ]),
      trailingRows: [[
        "Learners analysed",
        workspace.learnerRiskRows.length,
        "High risk",
        riskAvailable ? workspace.learnerRiskRows.filter((row) => row.riskLevel === "high").length : "Unavailable",
        "2+ failures",
        riskAvailable ? workspace.learnerRiskRows.filter((row) => row.failedSubjects >= 2).length : "Unavailable",
      ]],
    };
  }

  if (view === "results") {
    return {
      name: "Results",
      headers: ["Grade", "Class", "Subject", "Teacher", "Assessed", "Average", "Median", "Pass %", "Fail %", "Quality %", "Symbols"],
      rows: workspace.rows.map((row) => [
        row.grade,
        row.className ?? "",
        row.subject,
        row.teacher ?? "",
        row.summary.assessedLearners,
        cell(row.summary.average),
        cell(row.summary.median),
        cell(row.summary.passRate),
        cell(row.summary.failRate),
        cell(row.summary.qualityRate),
        row.summary.symbolDistribution.map((band) => band.symbol + " " + band.count).join(" · "),
      ]),
    };
  }

  if (view === "grades") {
    return {
      name: "Grades and Classes",
      headers: ["Type", "Group", "Assessed", "Average", "Pass %", "Fail %"],
      rows: [
        ...workspace.gradeSummaries.map((row) => [
          "Grade", row.label, row.summary.assessedLearners, cell(row.summary.average), cell(row.summary.passRate), cell(row.summary.failRate),
        ]),
        ...workspace.classSummaries.map((row) => [
          "Class", row.label, row.summary.assessedLearners, cell(row.summary.average), cell(row.summary.passRate), cell(row.summary.failRate),
        ]),
      ],
    };
  }

  if (view === "learners") {
    return {
      name: "Learners and Risk",
      headers: ["Learner", "Admission No.", "Grade", "Class", "Average", "Failures", "Promotional failures", "Near threshold", "Promotion readiness", "Risk"],
      rows: workspace.learnerRiskRows.map((row) => [
        row.learnerName,
        row.admissionNumber,
        row.grade,
        row.className,
        cell(row.average),
        row.riskLevel === "unavailable" ? "" : row.failedSubjects,
        row.riskLevel === "unavailable" ? "" : row.promotionalSubjectFailures,
        row.riskLevel === "unavailable" ? "" : row.nearThresholdSubjects,
        row.promotionReadiness.recommendedOutcome ?? row.promotionReadiness.status,
        row.riskLevel,
      ]),
    };
  }

  if (view === "promotion_exceptions") {
    return {
      name: "Promotion Exceptions",
      headers: ["Learner", "Admission No.", "Grade", "Class", "Recommended", "Final ruling", "Failed conditions", "Exception / reason", "Rule set", "Status"],
      rows: workspace.promotionExceptionRows.map((row) => {
        const decision = row.promotionDecision;
        const finalRuling = decision && ["approved", "locked"].includes(decision.status) ? decision.outcome : "";
        const ruleKey = decision?.ruleSetKey ?? row.promotionReadiness.ruleSetKey;
        const ruleVersion = decision?.ruleSetVersion ?? row.promotionReadiness.ruleSetVersion;
        return [
          row.learnerName,
          row.admissionNumber,
          row.grade,
          row.className,
          row.promotionReadiness.recommendedOutcome ?? decision?.recommendedOutcome ?? "",
          finalRuling ?? "",
          row.promotionReadiness.failedConditions,
          decision?.overrideReason ?? (row.promotionReadiness.failedConditions
            ? row.promotionReadiness.failedConditions + " failed governed condition" + (row.promotionReadiness.failedConditions === 1 ? "" : "s")
            : "Governed promotion-readiness exception"),
          ruleKey ? ruleKey + (ruleVersion ? " · " + ruleVersion : "") : "",
          decision?.status ?? row.promotionReadiness.status,
        ];
      }),
    };
  }

  return {
    name: "Trends",
    headers: ["Grade", "Subject", "Term-on-term pp", "Year-on-year pp", "Term comparability", "Year comparability"],
    rows: workspace.trends.map((row) => [
      row.grade,
      row.subject,
      cell(row.termOnTerm.passRateDelta),
      cell(row.yearOnYear.passRateDelta),
      row.termOnTerm.reason ?? "Comparable governed series",
      row.yearOnYear.reason ?? "Comparable governed series",
    ]),
  };
}

export function renderAcademicAnalysisXlsx(
  workspace: AcademicAnalysisWorkspace,
  header: OfficialDocumentHeaderModel,
  view: AcademicAnalysisView,
  logoBytes: Uint8Array | null = null,
): Buffer {
  const data = analysisSheetData(workspace, view);
  const columnCount = data.headers.length;
  const metaStartColumn = Math.max(3, Math.floor(columnCount * 0.58));
  const columnWidths = data.headers.map((label) => Math.max(11, Math.min(28, label.length + 5)));
  const worksheet = buildOfficialDocumentWorkbookSheet({
    header,
    context: {
      title: "Academic Analysis — " + VIEW_LABELS[view],
      primaryContext: "Academic year " + workspace.academicYear + " · Term " + workspace.termNumber,
      secondaryContext: "Basis: " + workspace.basis.toUpperCase(),
      summary: data.rows.length + " row" + (data.rows.length === 1 ? "" : "s"),
    },
    metaStartColumn,
    columnCount,
    columnWidths,
    dataHeaders: data.headers,
    dataRows: data.rows,
    trailingRows: data.trailingRows,
    landscape: true,
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, data.name.slice(0, 31));
  workbook.Props = {
    Title: "Academic Analysis — " + VIEW_LABELS[view],
    Subject: "ScolaPro academic analysis",
    Author: header.schoolName,
  };
  const base = Buffer.from(XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
    compression: true,
    cellStyles: true,
  }));

  return finalizeOfficialDocumentWorkbook(base, [{
    sheetNumber: 1,
    tableHeaderRow: OFFICIAL_DOCUMENT_WORKBOOK_TABLE_HEADER_ROW,
    dataRowCount: data.rows.length,
    columnCount,
    metaStartColumn,
    header,
  }], logoBytes);
}

export function academicAnalysisXlsxFilename(workspace: AcademicAnalysisWorkspace, view: AcademicAnalysisView): string {
  return "academic-analysis-" + view + "-" + workspace.academicYear + "-term-" + workspace.termNumber + "-" + workspace.basis + ".xlsx";
}
