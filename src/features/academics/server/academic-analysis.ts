import "server-only";

import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AcademicAnalysisBasis = "official" | "provisional";

export type AcademicAnalysisScope = {
  academicYear: number;
  termNumber: number;
  basis?: AcademicAnalysisBasis;
  subjectOfferingId?: string;
  grade?: string;
  className?: string;
  teacher?: string;
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
  className: string | null;
  teacher: string | null;
  teacherAttribution: "assessment_allocation" | "multiple_assessment_allocations" | "unavailable";
  gradingScaleKey: string | null;
  gradingScaleVersion: string | null;
  summary: PerformanceSummary;
};

export type AcademicAnalysisAggregate = {
  key: string;
  label: string;
  summary: PerformanceSummary;
};

export type AcademicAnalysisWorkspace = {
  basis: AcademicAnalysisBasis;
  academicYear: number;
  termNumber: number;
  rows: AcademicAnalysisRow[];
  subjectSummaries: AcademicAnalysisAggregate[];
  gradeSummaries: AcademicAnalysisAggregate[];
  classSummaries: AcademicAnalysisAggregate[];
  teacherSummaries: AcademicAnalysisAggregate[];
  qualityConfigured: false;
};

type NumericResult = {
  result_value: number | string | null;
  result_status: string | null;
  symbol: string | null;
  subject_offering_id: string;
  enrolment_id: string;
  grading_scale_key: string | null;
  grading_scale_version: string | null;
};

type ProvisionalResult = NumericResult & {
  assessment_scheme_id: string;
};

async function loadProvisionalResults(
  db: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  schoolId: string,
  academicYear: number,
  termNumber: number,
): Promise<ProvisionalResult[]> {
  const [{ data: schemes, error: schemeError }, { data: instances, error: instanceError }] = await Promise.all([
    db.from("assessment_schemes")
      .select("id,subject_offering_id,scheme_key,version")
      .eq("school_id", schoolId)
      .eq("status", "active"),
    db.from("assessment_instances")
      .select("assessment_scheme_id,register_class_id")
      .eq("school_id", schoolId)
      .eq("academic_year", academicYear)
      .eq("term_number", termNumber)
      .neq("status", "cancelled"),
  ]);
  if (schemeError) throw new Error("Unable to load provisional assessment schemes.");
  if (instanceError) throw new Error("Unable to load provisional assessment scope.");

  const classIds = [...new Set((instances ?? []).map((row) => row.register_class_id))];
  const { data: enrolments, error: enrolmentError } = classIds.length
    ? await db.from("enrolments")
        .select("id,learner_id,register_class_id")
        .eq("school_id", schoolId)
        .eq("academic_year", academicYear)
        .eq("status", "current")
        .in("register_class_id", classIds)
    : { data: [], error: null };
  if (enrolmentError) throw new Error("Unable to load provisional analysis enrolments.");

  const classesByScheme = new Map<string, Set<string>>();
  for (const instance of instances ?? []) {
    const classes = classesByScheme.get(instance.assessment_scheme_id) ?? new Set<string>();
    classes.add(instance.register_class_id);
    classesByScheme.set(instance.assessment_scheme_id, classes);
  }

  const calculations: Array<Promise<ProvisionalResult | null>> = [];
  for (const scheme of schemes ?? []) {
    const eligibleClasses = classesByScheme.get(scheme.id);
    if (!eligibleClasses?.size) continue;
    for (const enrolment of enrolments ?? []) {
      if (!eligibleClasses.has(enrolment.register_class_id)) continue;
      calculations.push((async () => {
        const { data: calculated, error } = await db.rpc("calculate_subject_result", {
          p_assessment_scheme_id: scheme.id,
          p_enrolment_id: enrolment.id,
          p_term_number: termNumber,
        });
        if (error || !calculated || calculated.complete !== true || calculated.result_value == null) return null;
        return {
          result_value: Number(calculated.result_value),
          result_status: null,
          symbol: null,
          subject_offering_id: scheme.subject_offering_id,
          enrolment_id: enrolment.id,
          grading_scale_key: null,
          grading_scale_version: null,
          assessment_scheme_id: scheme.id,
        };
      })());
    }
  }
  return (await Promise.all(calculations)).filter((row): row is ProvisionalResult => row !== null);
}

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
  const db = await createSupabaseServerClient();
  let typedResults: NumericResult[];
  if (basis === "official") {
    const { data: results, error } = await db.from("official_results")
      .select("result_value,result_status,symbol,subject_offering_id,enrolment_id,grading_scale_key,grading_scale_version")
      .eq("school_id", membership.schoolId)
      .eq("academic_year", scope.academicYear)
      .eq("term_number", scope.termNumber);
    if (error) throw new Error("Unable to load academic analysis results.");
    typedResults = (results ?? []) as NumericResult[];
  } else {
    typedResults = await loadProvisionalResults(db, membership.schoolId, scope.academicYear, scope.termNumber);
  }
  const offeringIds = [...new Set(typedResults.map((row) => row.subject_offering_id))];
  const { data: offerings, error: offeringError } = offeringIds.length
    ? await db.from("subject_offerings").select("id,subject_id,grade_id").in("id", offeringIds)
    : { data: [], error: null };
  if (offeringError) throw new Error("Unable to resolve academic analysis offerings.");

  const enrolmentIds = [...new Set(typedResults.map((row) => row.enrolment_id))];
  const { data: enrolments, error: enrolmentError } = enrolmentIds.length
    ? await db.from("enrolments").select("id,register_class_id").in("id", enrolmentIds)
    : { data: [], error: null };
  if (enrolmentError) throw new Error("Unable to resolve academic analysis enrolments.");
  const classIds = [...new Set((enrolments ?? []).map((row) => row.register_class_id).filter(Boolean))];
  const { data: classes, error: classError } = classIds.length
    ? await db.from("register_classes").select("id,display_name").in("id", classIds)
    : { data: [], error: null };
  if (classError) throw new Error("Unable to resolve academic analysis classes.");
  const enrolmentClassMap = new Map((enrolments ?? []).map((row) => [row.id, row.register_class_id]));
  const classMap = new Map((classes ?? []).map((row) => [row.id, row.display_name]));

  const subjectIds = [...new Set((offerings ?? []).map((row) => row.subject_id))];
  const gradeIds = [...new Set((offerings ?? []).map((row) => row.grade_id))];
  const [{ data: subjects }, { data: grades }] = await Promise.all([
    subjectIds.length ? db.from("subjects").select("id,display_name").in("id", subjectIds) : Promise.resolve({ data: [] }),
    gradeIds.length ? db.from("grades").select("id,display_name").in("id", gradeIds) : Promise.resolve({ data: [] }),
  ]);
  const subjectMap = new Map((subjects ?? []).map((row) => [row.id, row.display_name]));
  const gradeMap = new Map((grades ?? []).map((row) => [row.id, row.display_name]));
  const offeringMap = new Map((offerings ?? []).map((row) => [row.id, row]));

  const { data: instances, error: instanceError } = offeringIds.length
    ? await db.from("assessment_instances")
        .select("subject_offering_id,register_class_id,teacher_allocation_id")
        .eq("school_id", membership.schoolId)
        .eq("academic_year", scope.academicYear)
        .eq("term_number", scope.termNumber)
        .in("subject_offering_id", offeringIds)
        .neq("status", "cancelled")
    : { data: [], error: null };
  if (instanceError) throw new Error("Unable to resolve historical assessment teacher attribution.");

  const allocationIds = [...new Set((instances ?? []).map((row) => row.teacher_allocation_id).filter(Boolean))];
  const { data: allocations, error: allocationError } = allocationIds.length
    ? await db.from("teacher_allocations").select("id,staff_member_id").in("id", allocationIds)
    : { data: [], error: null };
  if (allocationError) throw new Error("Unable to resolve historical teacher allocations.");
  const staffIds = [...new Set((allocations ?? []).map((row) => row.staff_member_id).filter(Boolean))];
  const { data: staff, error: staffError } = staffIds.length
    ? await db.from("staff_members").select("id,first_name,last_name").in("id", staffIds)
    : { data: [], error: null };
  if (staffError) throw new Error("Unable to resolve historical teacher identities.");
  const staffNameMap = new Map((staff ?? []).map((row) => [row.id, [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || "Staff member"]));
  const allocationStaffMap = new Map((allocations ?? []).map((row) => [row.id, row.staff_member_id]));

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
    const cohortClassIds = [...new Set(cohort.map((result) => enrolmentClassMap.get(result.enrolment_id)).filter(Boolean))];
    const historicalAllocationIds = [...new Set((instances ?? [])
      .filter((instance) => instance.subject_offering_id === offeringId && cohortClassIds.includes(instance.register_class_id))
      .map((instance) => instance.teacher_allocation_id)
      .filter(Boolean))];
    const historicalTeacherNames = [...new Set(historicalAllocationIds
      .map((allocationId) => staffNameMap.get(allocationStaffMap.get(allocationId) ?? ""))
      .filter(Boolean))];

    rows.push({
      subjectOfferingId: offeringId,
      subject: subjectMap.get(offering?.subject_id) ?? "Subject",
      grade: gradeMap.get(offering?.grade_id) ?? "Grade",
      className: (() => {
        const names = [...new Set(cohort.map((result) => classMap.get(enrolmentClassMap.get(result.enrolment_id) ?? "")).filter(Boolean))];
        return names.length === 1 ? names[0] ?? null : names.length > 1 ? "Multiple classes" : null;
      })(),
      teacher: historicalTeacherNames.length === 1 ? historicalTeacherNames[0] ?? null : historicalTeacherNames.length > 1 ? historicalTeacherNames.join(" · ") : null,
      teacherAttribution: historicalTeacherNames.length === 1 ? "assessment_allocation" : historicalTeacherNames.length > 1 ? "multiple_assessment_allocations" : "unavailable",
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

  const filteredRows = rows
    .filter((row) => !scope.subjectOfferingId || row.subjectOfferingId === scope.subjectOfferingId)
    .filter((row) => !scope.grade || row.grade === scope.grade)
    .filter((row) => !scope.className || row.className === scope.className)
    .filter((row) => !scope.teacher || row.teacher?.includes(scope.teacher));

  function aggregateBy(select: (row: AcademicAnalysisRow) => string | null): AcademicAnalysisAggregate[] {
    const groups = new Map<string, AcademicAnalysisRow[]>();
    for (const row of filteredRows) {
      const key = select(row);
      if (!key) continue;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups.entries()].map(([label, group]) => {
      const numericWeight = group.reduce((sum, row) => sum + row.summary.numericResults, 0);
      const classified = group.reduce((sum, row) => sum + row.summary.classifiedResults, 0);
      const passed = group.reduce((sum, row) => sum + row.summary.passed, 0);
      const failed = group.reduce((sum, row) => sum + row.summary.failed, 0);
      const weightedAverage = numericWeight
        ? group.reduce((sum, row) => sum + ((row.summary.average ?? 0) * row.summary.numericResults), 0) / numericWeight
        : null;
      return {
        key: label,
        label,
        summary: {
          eligibleLearners: group.reduce((sum, row) => sum + row.summary.eligibleLearners, 0),
          assessedLearners: group.reduce((sum, row) => sum + row.summary.assessedLearners, 0),
          numericResults: numericWeight,
          classifiedResults: classified,
          average: weightedAverage == null ? null : rounded(weightedAverage),
          median: null,
          minimum: null,
          maximum: null,
          standardDeviation: null,
          passed,
          failed,
          passRate: rate(passed, classified),
          failRate: rate(failed, classified),
          qualityCount: null,
          qualityRate: null,
          symbolDistribution: [],
        },
      };
    }).sort((a, b) => a.label.localeCompare(b.label));
  }

  return {
    basis,
    academicYear: scope.academicYear,
    termNumber: scope.termNumber,
    rows: filteredRows.sort((a, b) => a.grade.localeCompare(b.grade) || a.subject.localeCompare(b.subject)),
    subjectSummaries: aggregateBy((row) => row.subject),
    gradeSummaries: aggregateBy((row) => row.grade),
    classSummaries: aggregateBy((row) => row.className),
    teacherSummaries: aggregateBy((row) => row.teacher),
    qualityConfigured: false,
  };
}
