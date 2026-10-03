import "server-only";

import { getAcademicAnalysisWorkspace, type AcademicAnalysisBasis, type AcademicAnalysisWorkspace } from "@/features/academics/server/academic-analysis";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";

export const ACADEMIC_SCHEDULE_TYPES = [
  "term_schedule",
  "promotion_schedule",
  "retention_at_risk",
  "incomplete_results",
  "subject_failure",
  "top_achievers",
  "class_grade_summary",
  "promotion_exceptions",
] as const;

export type AcademicScheduleType = (typeof ACADEMIC_SCHEDULE_TYPES)[number];
export type AcademicScheduleBasis = AcademicAnalysisBasis;

export const ACADEMIC_SCHEDULE_LABELS: Record<AcademicScheduleType,string> = {
  term_schedule: "Term Schedule",
  promotion_schedule: "Promotion Schedule",
  retention_at_risk: "Retention / At-Risk Schedule",
  incomplete_results: "Incomplete Results Schedule",
  subject_failure: "Subject Failure Schedule",
  top_achievers: "Top Achievers",
  class_grade_summary: "Class / Grade Results Summary",
  promotion_exceptions: "Promotion Decision Exceptions",
};

export type AcademicSchedulePayload = {
  scheduleType: AcademicScheduleType;
  title: string;
  basis: AcademicScheduleBasis;
  academicYear: number;
  termNumber: number;
  generatedAt: string;
  sourceDescription: string;
  columns: string[];
  rows: Array<Record<string,string|number|null>>;
  rowCount: number;
  notes: string[];
};

export type AcademicScheduleHistoryRow = {
  id: string;
  scheduleType: AcademicScheduleType;
  basis: AcademicScheduleBasis;
  version: number;
  status: "finalized" | "superseded";
  title: string;
  generatedAt: string;
  finalizedAt: string;
  supersessionReason: string | null;
};

export type AcademicScheduleSnapshot = {
  id: string;
  payload: AcademicSchedulePayload;
  header: OfficialDocumentHeaderModel | null;
  version: number;
  status: "finalized" | "superseded";
  supersessionReason: string | null;
  finalizedAt: string;
};

type QualityRow = {
  subject_name: string;
  grade_name: string;
  class_name: string;
  component_name: string | null;
  readiness_status: string;
  expected_learners: number;
  captured_records: number;
  missing_required_records: number;
  mark_status_counts: Record<string,number> | null;
  analysis_status: string;
};

function managerRole(role: string) {
  return ["school_admin","principal","deputy_principal"].includes(role);
}

function value(value: number | null) {
  return value == null ? null : value;
}

function basePayload(
  workspace: AcademicAnalysisWorkspace,
  type: AcademicScheduleType,
  columns: string[],
  rows: Array<Record<string,string|number|null>>,
  sourceDescription: string,
  notes: string[] = [],
): AcademicSchedulePayload {
  return {
    scheduleType: type,
    title: ACADEMIC_SCHEDULE_LABELS[type],
    basis: workspace.basis,
    academicYear: workspace.academicYear,
    termNumber: workspace.termNumber,
    generatedAt: new Date().toISOString(),
    sourceDescription,
    columns,
    rows,
    rowCount: rows.length,
    notes,
  };
}

async function qualityRows(schoolId: string, academicYear: number, termNumber: number): Promise<QualityRow[]> {
  const db = await createSupabaseServerClient();
  const { data, error } = await db.rpc("get_assessment_quality_readiness", {
    p_school_id: schoolId,
    p_academic_year: academicYear,
    p_term_number: termNumber,
  });
  if (error) throw new Error("Unable to load canonical assessment readiness.");
  return (data ?? []) as QualityRow[];
}

export async function getAcademicSchedulePayload(input: {
  academicYear: number;
  termNumber: number;
  basis: AcademicScheduleBasis;
  scheduleType: AcademicScheduleType;
}): Promise<AcademicSchedulePayload | null> {
  const context = await getUserContext();
  if (!context.user || context.platformMemberships.length || !context.currentSchoolMembership) return null;
  const membership = context.currentSchoolMembership;
  if (!managerRole(membership.roleKey)) return null;

  const workspace = await getAcademicAnalysisWorkspace({
    academicYear: input.academicYear,
    termNumber: input.termNumber,
    basis: input.basis,
  });
  if (!workspace) return null;

  const type = input.scheduleType;
  if (type === "term_schedule") {
    const rows = workspace.learnerRiskRows.map((row) => ({
      Learner: row.learnerName,
      "Admission No.": row.admissionNumber,
      Grade: row.grade,
      Class: row.className,
      "Subjects assessed": row.assessedSubjects,
      Average: value(row.average),
      Failures: row.riskLevel === "unavailable" ? null : row.failedSubjects,
      "Promotion readiness": row.promotionReadiness.recommendedOutcome ?? row.promotionReadiness.status,
    }));
    return basePayload(workspace,type,["Learner","Admission No.","Grade","Class","Subjects assessed","Average","Failures","Promotion readiness"],rows,"Canonical academic results and promotion-readiness read model.");
  }

  if (type === "promotion_schedule") {
    const rows = workspace.learnerRiskRows
      .filter((row) => row.promotionReadiness.status !== "unavailable")
      .map((row) => ({
        Learner: row.learnerName,
        "Admission No.": row.admissionNumber,
        Grade: row.grade,
        Class: row.className,
        Average: value(row.average),
        "Recommended outcome": row.promotionReadiness.recommendedOutcome ?? (row.promotionReadiness.status === "ready" ? "ready" : "not ready"),
        "Failed conditions": row.promotionReadiness.failedConditions,
        "Rule set": row.promotionReadiness.ruleSetKey ? row.promotionReadiness.ruleSetKey + " · " + (row.promotionReadiness.ruleSetVersion ?? "") : null,
      }));
    return basePayload(workspace,type,["Learner","Admission No.","Grade","Class","Average","Recommended outcome","Failed conditions","Rule set"],rows,"Canonical promotion-readiness engine; no report-side promotion calculation.",["Empty when no active governed promotion rule set is available."]);
  }

  if (type === "retention_at_risk") {
    const rows = workspace.learnerRiskRows
      .filter((row) => row.riskLevel === "high" || row.riskLevel === "watch" || row.promotionReadiness.status === "not_ready")
      .map((row) => ({
        Learner: row.learnerName,
        "Admission No.": row.admissionNumber,
        Grade: row.grade,
        Class: row.className,
        Average: value(row.average),
        Failures: row.failedSubjects,
        "Promotional failures": row.promotionalSubjectFailures,
        "Near threshold": row.nearThresholdSubjects,
        Risk: row.riskLevel,
        "Promotion readiness": row.promotionReadiness.recommendedOutcome ?? row.promotionReadiness.status,
      }));
    return basePayload(workspace,type,["Learner","Admission No.","Grade","Class","Average","Failures","Promotional failures","Near threshold","Risk","Promotion readiness"],rows,"Governed Academic Analysis learner-risk indicators plus canonical promotion readiness.");
  }

  if (type === "incomplete_results") {
    const readiness = await qualityRows(workspace.schoolId,workspace.academicYear,workspace.termNumber);
    const rows = readiness
      .filter((row) => row.missing_required_records > 0 || !["verified","locked"].includes(row.readiness_status))
      .map((row) => ({
        Grade: row.grade_name,
        Class: row.class_name,
        Subject: row.subject_name,
        Component: row.component_name ?? "Final result",
        Readiness: row.readiness_status,
        Expected: row.expected_learners,
        Captured: row.captured_records,
        "Missing required": row.missing_required_records,
        "Absent / incomplete": Number(row.mark_status_counts?.absent ?? 0) + Number(row.mark_status_counts?.incomplete ?? 0),
        "Analysis status": row.analysis_status,
      }));
    return basePayload(workspace,type,["Grade","Class","Subject","Component","Readiness","Expected","Captured","Missing required","Absent / incomplete","Analysis status"],rows,"Canonical Assessment Quality/Readiness RPC with dated enrolment and subject-registration eligibility.");
  }

  if (type === "subject_failure") {
    const rows = workspace.rows
      .filter((row) => row.summary.failed > 0)
      .map((row) => ({
        Grade: row.grade,
        Class: row.className ?? "",
        Subject: row.subject,
        Assessed: row.summary.assessedLearners,
        Failed: row.summary.failed,
        "Fail %": value(row.summary.failRate),
        Average: value(row.summary.average),
        "Grading scale": row.gradingScaleKey ? row.gradingScaleKey + " · " + (row.gradingScaleVersion ?? "") : null,
      }));
    return basePayload(workspace,type,["Grade","Class","Subject","Assessed","Failed","Fail %","Average","Grading scale"],rows,"Canonical official/provisional academic result summaries with governed grading classifications.");
  }

  if (type === "top_achievers") {
    const rows = workspace.topLearners.map((row,index) => ({
      No: index + 1,
      Learner: row.learnerName,
      "Admission No.": row.admissionNumber,
      Grade: row.grade,
      Class: row.className,
      Average: value(row.average),
      "Subjects assessed": row.assessedSubjects,
    }));
    return basePayload(workspace,type,["No","Learner","Admission No.","Grade","Class","Average","Subjects assessed"],rows,"Canonical Academic Analysis top-N view; descriptive ordering only, not an evaluative learner label.");
  }

  if (type === "class_grade_summary") {
    const gradeRows = workspace.gradeSummaries.map((row) => ({
      Scope: "Grade",
      Group: row.label,
      Assessed: row.summary.assessedLearners,
      Average: value(row.summary.average),
      "Pass %": value(row.summary.passRate),
      "Fail %": value(row.summary.failRate),
    }));
    const classRows = workspace.classSummaries.map((row) => ({
      Scope: "Class",
      Group: row.label,
      Assessed: row.summary.assessedLearners,
      Average: value(row.summary.average),
      "Pass %": value(row.summary.passRate),
      "Fail %": value(row.summary.failRate),
    }));
    return basePayload(workspace,type,["Scope","Group","Assessed","Average","Pass %","Fail %"],[...gradeRows,...classRows],"Canonical Academic Analysis grade/class aggregates.");
  }

  const rows = workspace.learnerRiskRows
    .filter((row) => row.promotionReadiness.status === "not_ready" || row.promotionReadiness.failedConditions > 0)
    .map((row) => ({
      Learner: row.learnerName,
      "Admission No.": row.admissionNumber,
      Grade: row.grade,
      Class: row.className,
      "Recommended outcome": row.promotionReadiness.recommendedOutcome ?? "not ready",
      "Failed conditions": row.promotionReadiness.failedConditions,
      "Rule set": row.promotionReadiness.ruleSetKey ? row.promotionReadiness.ruleSetKey + " · " + (row.promotionReadiness.ruleSetVersion ?? "") : null,
    }));
  return basePayload(workspace,type,["Learner","Admission No.","Grade","Class","Recommended outcome","Failed conditions","Rule set"],rows,"Canonical promotion-readiness exceptions; no report-side decision engine.",["Empty when no governed promotion exception exists."]);
}

export async function getAcademicScheduleHistory(input: {
  academicYear: number;
  termNumber: number;
  scheduleType: AcademicScheduleType;
}): Promise<AcademicScheduleHistoryRow[]> {
  const context = await getUserContext();
  if (!context.user || !context.currentSchoolMembership || !managerRole(context.currentSchoolMembership.roleKey)) return [];
  const db = await createSupabaseServerClient();
  const { data, error } = await db.from("academic_schedule_snapshots")
    .select("id,schedule_type,basis,version,status,title,generated_at,finalized_at,supersession_reason")
    .eq("school_id",context.currentSchoolMembership.schoolId)
    .eq("academic_year",input.academicYear)
    .eq("term_number",input.termNumber)
    .eq("schedule_type",input.scheduleType)
    .order("version",{ascending:false});
  if (error) throw new Error("Unable to load academic schedule history.");
  return (data ?? []).map((row) => ({
    id:String(row.id),
    scheduleType:String(row.schedule_type) as AcademicScheduleType,
    basis:String(row.basis) as AcademicScheduleBasis,
    version:Number(row.version),
    status:String(row.status) as AcademicScheduleHistoryRow["status"],
    title:String(row.title),
    generatedAt:String(row.generated_at),
    finalizedAt:String(row.finalized_at),
    supersessionReason:row.supersession_reason ? String(row.supersession_reason) : null,
  }));
}

export async function getAcademicScheduleSnapshot(snapshotId: string): Promise<AcademicScheduleSnapshot | null> {
  const context = await getUserContext();
  if (!context.user || !context.currentSchoolMembership || !managerRole(context.currentSchoolMembership.roleKey)) return null;
  const db = await createSupabaseServerClient();
  const { data, error } = await db.from("academic_schedule_snapshots")
    .select("id,school_id,version,status,payload,metadata,finalized_at,supersession_reason")
    .eq("id",snapshotId)
    .eq("school_id",context.currentSchoolMembership.schoolId)
    .maybeSingle();
  if (error || !data) return null;
  const metadata = data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
    ? data.metadata as Record<string,unknown>
    : {};
  const rawHeader = metadata.documentHeader && typeof metadata.documentHeader === "object" && !Array.isArray(metadata.documentHeader)
    ? metadata.documentHeader as OfficialDocumentHeaderModel
    : null;
  const header: OfficialDocumentHeaderModel | null = rawHeader ? {
    ...rawHeader,
    provenance: { ...rawHeader.provenance, source: "frozen_snapshot" },
  } : null;
  return {
    id:String(data.id),
    payload:data.payload as unknown as AcademicSchedulePayload,
    header,
    version:Number(data.version),
    status:String(data.status) as AcademicScheduleSnapshot["status"],
    supersessionReason:data.supersession_reason ? String(data.supersession_reason) : null,
    finalizedAt:String(data.finalized_at),
  };
}
