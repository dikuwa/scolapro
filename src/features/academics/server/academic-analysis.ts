import "server-only";

import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AcademicAnalysisBasis = "official" | "provisional";

export type AcademicAnalysisScope = {
  academicYear: number;
  termNumber: number;
  basis?: AcademicAnalysisBasis;
};

export type SymbolBandCount = {
  bandId: string | null;
  symbol: string;
  count: number;
  percentage: number | null;
};

export type PerformanceSummary = {
  eligibleLearners: number;
  assessedLearners: number;
  numericResults: number;
  classifiedResults: number;
  average: number | null;
  median: number | null;
  minimum: number | null;
  maximum: number | null;
  standardDeviation: number | null;
  passed: number;
  failed: number;
  passRate: number | null;
  failRate: number | null;
  qualityCount: number | null;
  qualityRate: number | null;
  symbolDistribution: SymbolBandCount[];
};

export type AcademicAnalysisRow = {
  subjectOfferingId: string;
  subject: string;
  grade: string;
  teacher: string | null;
  gradingScaleKey: string | null;
  gradingScaleVersion: string | null;
  summary: PerformanceSummary;
};

export type AcademicAnalysisWorkspace = {
  basis: AcademicAnalysisBasis;
  academicYear: number;
  termNumber: number;
  rows: AcademicAnalysisRow[];
  qualityConfigured: false;
};

type NumericResult = {
  result_value: number | string | null;
  result_status: string | null;
  symbol: string | null;
  subject_offering_id: string;
  grading_scale_key: string | null;
  grading_scale_version: string | null;
};

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

export function summarizeNumericValues(values: number[]) {
  if (!values.length) {
    return { average: null, median: null, minimum: null, maximum: null, standardDeviation: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  const variance = values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / values.length;
  return {
    average: rounded(average),
    median: rounded(median),
    minimum: sorted[0],
    maximum: sorted[sorted.length - 1],
    standardDeviation: rounded(Math.sqrt(variance)),
  };
}

function rate(count: number, denominator: number): number | null {
  return denominator ? rounded((count / denominator) * 100) : null;
}

export async function getAcademicAnalysisWorkspace(scope: AcademicAnalysisScope): Promise<AcademicAnalysisWorkspace | null> {
  const context = await getUserContext();
  if (!context.user || context.platformMemberships.length || !context.currentSchoolMembership) return null;
  const membership = context.currentSchoolMembership;
  if (!["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher"].includes(membership.roleKey)) return null;

  const basis = scope.basis ?? "official";
  // Phase 1A deliberately starts with immutable official results. Provisional analysis
  // will be enabled only after the same authority and denominator contract is proven.
  if (basis !== "official") {
    return { basis, academicYear: scope.academicYear, termNumber: scope.termNumber, rows: [], qualityConfigured: false };
  }

  const db = await createSupabaseServerClient();
  const { data: results, error } = await db.from("official_results")
    .select("result_value,result_status,symbol,subject_offering_id,grading_scale_key,grading_scale_version")
    .eq("school_id", membership.schoolId)
    .eq("academic_year", scope.academicYear)
    .eq("term_number", scope.termNumber);
  if (error) throw new Error("Unable to load academic analysis results.");

  const typedResults = (results ?? []) as NumericResult[];
  const offeringIds = [...new Set(typedResults.map((row) => row.subject_offering_id))];
  const { data: offerings, error: offeringError } = offeringIds.length
    ? await db.from("subject_offerings").select("id,subject_id,grade_id").in("id", offeringIds)
    : { data: [], error: null };
  if (offeringError) throw new Error("Unable to resolve academic analysis offerings.");

  const subjectIds = [...new Set((offerings ?? []).map((row) => row.subject_id))];
  const gradeIds = [...new Set((offerings ?? []).map((row) => row.grade_id))];
  const [{ data: subjects }, { data: grades }] = await Promise.all([
    subjectIds.length ? db.from("subjects").select("id,display_name").in("id", subjectIds) : Promise.resolve({ data: [] }),
    gradeIds.length ? db.from("grades").select("id,display_name").in("id", gradeIds) : Promise.resolve({ data: [] }),
  ]);
  const subjectMap = new Map((subjects ?? []).map((row) => [row.id, row.display_name]));
  const gradeMap = new Map((grades ?? []).map((row) => [row.id, row.display_name]));
  const offeringMap = new Map((offerings ?? []).map((row) => [row.id, row]));

  const rows: AcademicAnalysisRow[] = [];
  for (const offeringId of offeringIds) {
    const cohort = typedResults.filter((row) => row.subject_offering_id === offeringId);
    const numeric = cohort.filter((row) => row.result_value != null).map((row) => Number(row.result_value));
    const scaleKey = cohort.find((row) => row.grading_scale_key)?.grading_scale_key ?? null;
    const scaleVersion = cohort.find((row) => row.grading_scale_version)?.grading_scale_version ?? null;

    let bands: Array<{ id: string; symbol: string; pass_classification: string | null; sort_order: number }> = [];
    if (scaleKey && scaleVersion) {
      const { data: scales } = await db.from("grading_scales")
        .select("id").eq("school_id", membership.schoolId).eq("scale_key", scaleKey).eq("version", scaleVersion).limit(1);
      const scaleId = scales?.[0]?.id;
      if (scaleId) {
        const { data } = await db.from("grading_scale_bands")
          .select("id,symbol,pass_classification,sort_order").eq("grading_scale_id", scaleId).order("sort_order");
        bands = data ?? [];
      }
    }
    const bandMap = new Map(bands.map((band) => [band.symbol, band]));
    const classified = cohort.filter((row) => row.symbol && bandMap.has(row.symbol));
    const passed = classified.filter((row) => bandMap.get(row.symbol!)?.pass_classification === "pass").length;
    const failed = classified.filter((row) => bandMap.get(row.symbol!)?.pass_classification === "fail").length;
    const distribution = bands.map((band) => {
      const count = cohort.filter((row) => row.symbol === band.symbol).length;
      return { bandId: band.id, symbol: band.symbol, count, percentage: rate(count, classified.length) };
    });
    const offering = offeringMap.get(offeringId);
    rows.push({
      subjectOfferingId: offeringId,
      subject: subjectMap.get(offering?.subject_id) ?? "Subject",
      grade: gradeMap.get(offering?.grade_id) ?? "Grade",
      teacher: null,
      gradingScaleKey: scaleKey,
      gradingScaleVersion: scaleVersion,
      summary: {
        eligibleLearners: cohort.length,
        assessedLearners: cohort.filter((row) => row.result_value != null || row.result_status != null).length,
        numericResults: numeric.length,
        classifiedResults: classified.length,
        ...summarizeNumericValues(numeric),
        passed,
        failed,
        passRate: rate(passed, classified.length),
        failRate: rate(failed, classified.length),
        qualityCount: null,
        qualityRate: null,
        symbolDistribution: distribution,
      },
    });
  }

  return {
    basis,
    academicYear: scope.academicYear,
    termNumber: scope.termNumber,
    rows: rows.sort((a, b) => a.grade.localeCompare(b.grade) || a.subject.localeCompare(b.subject)),
    qualityConfigured: false,
  };
}
