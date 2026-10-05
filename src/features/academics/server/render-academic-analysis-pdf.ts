import "server-only";

import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import type { AcademicAnalysisView, AcademicAnalysisWorkspace } from "@/features/academics/server/academic-analysis";
import { OFFICIAL_DOCUMENT_PDF_GEOMETRY } from "@/features/documents/server/official-document-chrome";
import { drawOfficialDocumentPdfFooter } from "@/features/documents/server/official-document-pdf-footer";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import {
  createOfficialDocumentPdfResources,
  drawOfficialDocumentPdfHeader,
  fitOfficialDocumentPdfText,
} from "@/features/documents/server/official-document-pdf-header";

const LINE = rgb(0.25, 0.25, 0.25);
const FILL = rgb(0.93, 0.94, 0.96);
const INK = rgb(0.05, 0.05, 0.05);
const VIEW_LABELS: Record<AcademicAnalysisView, string> = {
  overview: "Overview",
  results: "Results",
  grades: "Grades & Classes",
  learners: "Learners & Risk",
  promotion_exceptions: "Promotion Exceptions",
  trends: "Trends",
};

type Table = { headers: string[]; rows: string[][] };

function value(input: unknown) {
  return input === null || input === undefined || input === "" ? "—" : String(input);
}

function pct(input: number | null) {
  return input === null ? "—" : String(input) + "%";
}

function tableFor(workspace: AcademicAnalysisWorkspace, view: AcademicAnalysisView): Table {
  if (view === "overview") {
    return {
      headers: ["Learner", "Admission No.", "Grade", "Class", "Average", "Risk"],
      rows: workspace.topLearners.map((row) => [
        row.learnerName,
        value(row.admissionNumber),
        row.grade,
        row.className,
        value(row.average),
        row.riskLevel,
      ]),
    };
  }
  if (view === "results") {
    return {
      headers: ["Grade", "Class", "Subject", "Teacher", "Assessed", "Average", "Pass %", "Fail %", "Quality %", "Symbols"],
      rows: workspace.rows.map((row) => [
        row.grade,
        value(row.className),
        row.subject,
        value(row.teacher),
        value(row.summary.assessedLearners),
        value(row.summary.average),
        pct(row.summary.passRate),
        pct(row.summary.failRate),
        pct(row.summary.qualityRate),
        row.summary.symbolDistribution.map((band) => band.symbol + " " + band.count).join(" · ") || "—",
      ]),
    };
  }
  if (view === "grades") {
    return {
      headers: ["Type", "Group", "Assessed", "Average", "Pass %", "Fail %"],
      rows: [
        ...workspace.gradeSummaries.map((row) => ["Grade", row.label, value(row.summary.assessedLearners), value(row.summary.average), pct(row.summary.passRate), pct(row.summary.failRate)]),
        ...workspace.classSummaries.map((row) => ["Class", row.label, value(row.summary.assessedLearners), value(row.summary.average), pct(row.summary.passRate), pct(row.summary.failRate)]),
      ],
    };
  }
  if (view === "learners") {
    return {
      headers: ["Learner", "Adm. no.", "Grade", "Class", "Average", "Failures", "Promotional", "Near threshold", "Promotion readiness", "Risk"],
      rows: workspace.learnerRiskRows.map((row) => [
        row.learnerName,
        value(row.admissionNumber),
        row.grade,
        row.className,
        value(row.average),
        row.riskLevel === "unavailable" ? "—" : value(row.failedSubjects),
        row.riskLevel === "unavailable" ? "—" : value(row.promotionalSubjectFailures),
        row.riskLevel === "unavailable" ? "—" : value(row.nearThresholdSubjects),
        value(row.promotionReadiness.recommendedOutcome ?? row.promotionReadiness.status),
        row.riskLevel,
      ]),
    };
  }
  if (view === "promotion_exceptions") {
    return {
      headers: ["Learner", "Adm. no.", "Grade", "Class", "Recommended", "Final ruling", "Exception / reason", "Rule set", "Status"],
      rows: workspace.promotionExceptionRows.map((row) => {
        const decision = row.promotionDecision;
        const finalRuling = decision && ["approved", "locked"].includes(decision.status) ? decision.outcome : null;
        const ruleKey = decision?.ruleSetKey ?? row.promotionReadiness.ruleSetKey;
        const ruleVersion = decision?.ruleSetVersion ?? row.promotionReadiness.ruleSetVersion;
        return [
          row.learnerName,
          value(row.admissionNumber),
          row.grade,
          row.className,
          value(row.promotionReadiness.recommendedOutcome ?? decision?.recommendedOutcome),
          value(finalRuling),
          decision?.overrideReason ?? (row.promotionReadiness.failedConditions ? row.promotionReadiness.failedConditions + " failed governed condition" + (row.promotionReadiness.failedConditions === 1 ? "" : "s") : "Governed promotion-readiness exception"),
          ruleKey ? ruleKey + (ruleVersion ? " · " + ruleVersion : "") : "—",
          value(decision?.status ?? row.promotionReadiness.status),
        ];
      }),
    };
  }
  return {
    headers: ["Grade", "Subject", "Term-on-term", "Year-on-year", "Comparability"],
    rows: workspace.trends.map((row) => [
      row.grade,
      row.subject,
      row.termOnTerm.passRateDelta === null ? "—" : row.termOnTerm.passRateDelta + " pp",
      row.yearOnYear.passRateDelta === null ? "—" : row.yearOnYear.passRateDelta + " pp",
      [row.termOnTerm.reason, row.yearOnYear.reason].filter(Boolean).join(" · ") || "Comparable governed series",
    ]),
  };
}

export async function renderAcademicAnalysisPdf(
  workspace: AcademicAnalysisWorkspace,
  header: OfficialDocumentHeaderModel,
  view: AcademicAnalysisView,
  logoBytes: Uint8Array | null = null,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const resources = await createOfficialDocumentPdfResources(pdf, header, logoBytes);
  const { regular, bold } = resources;
  const pageWidth = OFFICIAL_DOCUMENT_PDF_GEOMETRY.pageHeight;
  const pageHeight = OFFICIAL_DOCUMENT_PDF_GEOMETRY.pageWidth;
  const margin = 24;
  const width = pageWidth - margin * 2;
  const table = tableFor(workspace, view);
  const unitWeights = table.headers.map((label) => Math.max(6, Math.min(18, label.length + 2)));
  const unitTotal = unitWeights.reduce((sum, item) => sum + item, 0);
  const widths = unitWeights.map((item) => width * item / unitTotal);
  const headerHeight = 24;
  const rowHeight = 14;
  const pages: PDFPage[] = [];

  const context = {
    title: "Academic Analysis — " + VIEW_LABELS[view],
    primaryContext: "Academic year " + workspace.academicYear + " · Term " + workspace.termNumber,
    secondaryContext: "Basis: " + workspace.basis.toUpperCase(),
    summary: table.rows.length + " row" + (table.rows.length === 1 ? "" : "s"),
  };

  const addPage = (continued = false) => {
    const page = pdf.addPage([pageWidth, pageHeight]);
    pages.push(page);
    let y = drawOfficialDocumentPdfHeader(page, header, resources, pageHeight - margin, {
      documentX: margin,
      documentWidth: width,
      context: continued ? { ...context, summary: "Continued" } : context,
    });
    y -= 8;
    let x = margin;
    table.headers.forEach((label, index) => {
      const cellWidth = widths[index];
      page.drawRectangle({ x, y: y - headerHeight, width: cellWidth, height: headerHeight, color: FILL, borderColor: LINE, borderWidth: 0.5 });
      page.drawText(fitOfficialDocumentPdfText(bold, label, 5.5, cellWidth - 5), { x: x + 2.5, y: y - headerHeight / 2 - 2, font: bold, size: 5.5, color: INK });
      x += cellWidth;
    });
    return { page, y: y - headerHeight };
  };

  let current = addPage();
  const rows = table.rows.length ? table.rows : [table.headers.map((_, index) => index === 0 ? "No rows available for this analysis scope." : "")];
  rows.forEach((row) => {
    if (current.y - rowHeight < margin + 30) current = addPage(true);
    let x = margin;
    row.forEach((cell, index) => {
      const cellWidth = widths[index];
      current.page.drawRectangle({ x, y: current.y - rowHeight, width: cellWidth, height: rowHeight, borderColor: LINE, borderWidth: 0.4 });
      current.page.drawText(fitOfficialDocumentPdfText(regular, value(cell), 5.2, cellWidth - 5), { x: x + 2.5, y: current.y - rowHeight / 2 - 1.8, font: regular, size: 5.2, color: INK });
      x += cellWidth;
    });
    current.y -= rowHeight;
  });

  pages.forEach((page, index) => drawOfficialDocumentPdfFooter({
    page,
    font: regular,
    pageNumber: index + 1,
    pageCount: pages.length,
    primaryLeft: "ScolaPro Academic Analysis · " + workspace.basis.toUpperCase(),
    secondaryLeft: VIEW_LABELS[view],
  }));

  return pdf.save();
}

export function academicAnalysisPdfFilename(workspace: AcademicAnalysisWorkspace, view: AcademicAnalysisView) {
  return "academic-analysis-" + view + "-" + workspace.academicYear + "-term-" + workspace.termNumber + "-" + workspace.basis + ".pdf";
}
