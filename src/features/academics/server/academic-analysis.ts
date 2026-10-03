import "server-only";

import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getHodScopeConfiguration } from "@/features/academics/server/hod-scope";

export type AcademicAnalysisBasis = "official" | "provisional";
export type AcademicAnalysisView = "overview" | "results" | "grades" | "learners" | "trends";

const NEAR_THRESHOLD_MARGIN = 5;

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
  numericValues: number[];
};

export type AcademicAnalysisExportRow = {
  grade: string;
  className: string;
  subject: string;
  teacher: string;
  assessed: number;
  average: number | null;
  median: number | null;
  passRate: number | null;
  failRate: number | null;
  symbols: string;
};

export type AcademicAnalysisAggregate = {
  key: string;
  label: string;
  summary: PerformanceSummary;
};

export type PromotionReadiness = {
  status: "ready" | "not_ready" | "unavailable";
  recommendedOutcome: string | null;
  ruleSetKey: string | null;
  ruleSetVersion: string | null;
  failedConditions: number;
};

export type LearnerRiskRow = {
  enrolmentId: string;
  learnerId: string;
  learnerName: string;
  admissionNumber: string;
  grade: string;
  className: string;
  assessedSubjects: number;
  average: number | null;
  failedSubjects: number;
  promotionalSubjectFailures: number;
  nearThresholdSubjects: number;
  qualityCount: number | null;
  qualityRate: number | null;
  improvement: number | null;
  sharedImprovementSubjects: number;
  riskLevel: "high" | "watch" | "stable";
  promotionReadiness: PromotionReadiness;
};

export type AcademicTrendComparison = {
  status: "comparable" | "not_comparable";
  passRateDelta: number | null;
  leftPassRate: number | null;
  rightPassRate: number | null;
  reason: string | null;
};

export type AcademicTrendRow = {
  subjectOfferingId: string;
  subject: string;
  grade: string;
  termOnTerm: AcademicTrendComparison;
  yearOnYear: AcademicTrendComparison;
};

export type AcademicAnalysisWorkspace = {
  schoolId: string;
  basis: AcademicAnalysisBasis;
  academicYear: number;
  termNumber: number;
  rows: AcademicAnalysisRow[];
  subjectSummaries: AcademicAnalysisAggregate[];
  gradeSummaries: AcademicAnalysisAggregate[];
  classSummaries: AcademicAnalysisAggregate[];
  teacherSummaries: AcademicAnalysisAggregate[];
  qualityConfigured: boolean;
  learnerRiskRows: LearnerRiskRow[];
  topLearners: LearnerRiskRow[];
  topImprovers: LearnerRiskRow[];
  trends: AcademicTrendRow[];
  nearThresholdMargin: number;
  filterOptions: {
    grades: string[];
    classes: string[];
    subjects: Array<{ value: string; label: string; helper?: string }>;
    teachers: string[];
  };
  exportRows: AcademicAnalysisExportRow[];
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
      .select("assessment_scheme_id,subject_offering_id,register_class_id,assessment_date")
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
        .select("id,learner_id,register_class_id,enrolled_from,enrolled_to,status")
        .eq("school_id", schoolId)
        .eq("academic_year", academicYear)
        .in("register_class_id", classIds)
    : { data: [], error: null };
  if (enrolmentError) throw new Error("Unable to load provisional analysis enrolments.");

  const enrolmentIds = (enrolments ?? []).map((row) => row.id);
  const { data: registrations, error: registrationError } = enrolmentIds.length
    ? await db.from("learner_subject_registrations")
        .select("enrolment_id,subject_offering_id,status,registered_at,withdrawn_at")
        .in("enrolment_id", enrolmentIds)
    : { data: [], error: null };
  if (registrationError) throw new Error("Unable to load provisional subject registrations.");
  const registrationsByEnrolment = new Map<string, typeof registrations>();
  for (const registration of registrations ?? []) {
    const list = registrationsByEnrolment.get(registration.enrolment_id) ?? [];
    list.push(registration);
    registrationsByEnrolment.set(registration.enrolment_id, list);
  }

  const instancesByScheme = new Map<string, Array<{ subject_offering_id: string; register_class_id: string; assessment_date: string | null }>>();
  for (const instance of instances ?? []) {
    const list = instancesByScheme.get(instance.assessment_scheme_id) ?? [];
    list.push(instance);
    instancesByScheme.set(instance.assessment_scheme_id, list);
  }

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
      const relevantInstances = (instancesByScheme.get(scheme.id) ?? [])
        .filter((instance) => instance.register_class_id === enrolment.register_class_id);
      if (!relevantInstances.length) continue;
      const datedInstances = relevantInstances.filter((instance) => Boolean(instance.assessment_date));
      const eligibilityDate = datedInstances.length
        ? datedInstances.map((instance) => instance.assessment_date!).sort()[0]
        : null;
      const enrolmentEffective = eligibilityDate
        ? enrolment.enrolled_from <= eligibilityDate && (!enrolment.enrolled_to || enrolment.enrolled_to >= eligibilityDate)
        : enrolment.status === "current";
      if (!enrolmentEffective) continue;
      const subjectRegistrations = registrationsByEnrolment.get(enrolment.id) ?? [];
      const subjectEligible = !subjectRegistrations.length || subjectRegistrations.some((registration) => {
        if (registration.subject_offering_id !== scheme.subject_offering_id) return false;
        if (!eligibilityDate) return registration.status === "active";
        const registeredOn = registration.registered_at.slice(0, 10);
        const withdrawnOn = registration.withdrawn_at?.slice(0, 10) ?? null;
        return registeredOn <= eligibilityDate && (!withdrawnOn || withdrawnOn >= eligibilityDate);
      });
      if (!subjectEligible) continue;
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
    ? await db.from("enrolments").select("id,register_class_id,learner_id,grade_id,admission_number").in("id", enrolmentIds)
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
    subjectIds.length ? db.from("subjects").select("id,display_name,subject_code").in("id", subjectIds) : Promise.resolve({ data: [] }),
    gradeIds.length ? db.from("grades").select("id,display_name,grade_code").in("id", gradeIds) : Promise.resolve({ data: [] }),
  ]);
  const subjectMap = new Map((subjects ?? []).map((row) => [row.id, row.display_name]));
  const subjectCodeMap = new Map((subjects ?? []).map((row) => [row.id, row.subject_code]));
  const gradeMap = new Map((grades ?? []).map((row) => [row.id, row.display_name]));
  const gradeCodeMap = new Map((grades ?? []).map((row) => [row.id, row.grade_code]));
  const offeringMap = new Map((offerings ?? []).map((row) => [row.id, row]));

  // HOD analysis is governed by the same subject-responsibility registry used by Academics.
  // RLS remains defense-in-depth, but the read model must not treat HOD as whole-school authority.
  let authorizedOfferingIds: Set<string> | null = null;
  if (membership.roleKey === "hod") {
    const hodScope = await getHodScopeConfiguration(membership.schoolId);
    const activeResponsibilitySubjectIds = new Set(
      hodScope.responsibilities
        .filter((row) => row.effectiveFrom <= hodScope.today && (!row.effectiveTo || row.effectiveTo >= hodScope.today))
        .map((row) => row.subjectId),
    );
    authorizedOfferingIds = new Set(
      (offerings ?? [])
        .filter((offering) => activeResponsibilitySubjectIds.has(offering.subject_id))
        .map((offering) => offering.id),
    );
    typedResults = typedResults.filter((row) => authorizedOfferingIds?.has(row.subject_offering_id));
  }

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

  const scaleRefs = [...new Map(typedResults
    .filter((row) => row.grading_scale_key && row.grading_scale_version)
    .map((row) => [`${row.grading_scale_key}::${row.grading_scale_version}`, { key: row.grading_scale_key!, version: row.grading_scale_version! }])).values()];
  const scaleKeys = [...new Set(scaleRefs.map((ref) => ref.key))];
  const { data: resolvedScales, error: scaleError } = scaleKeys.length
    ? await db.from("grading_scales").select("id,scale_key,version").eq("school_id", membership.schoolId).in("scale_key", scaleKeys)
    : { data: [], error: null };
  if (scaleError) throw new Error("Unable to resolve historical grading scales.");
  const wantedScaleRefs = new Set(scaleRefs.map((ref) => `${ref.key}::${ref.version}`));
  const scales = (resolvedScales ?? []).filter((scale) => wantedScaleRefs.has(`${scale.scale_key}::${scale.version}`));
  const scaleIds = scales.map((scale) => scale.id);
  const { data: resolvedBands, error: bandError } = scaleIds.length
    ? await db.from("grading_scale_bands").select("id,grading_scale_id,symbol,pass_classification,minimum_value,maximum_value,sort_order").in("grading_scale_id", scaleIds).order("sort_order")
    : { data: [], error: null };
  if (bandError) throw new Error("Unable to resolve historical grading bands.");
  const scaleIdByRef = new Map(scales.map((scale) => [`${scale.scale_key}::${scale.version}`, scale.id]));
  const bandsByScaleId = new Map<string, Array<{ id: string; symbol: string; pass_classification: string | null; minimum_value: number | string; maximum_value: number | string | null; sort_order: number }>>();
  for (const band of resolvedBands ?? []) {
    const list = bandsByScaleId.get(band.grading_scale_id) ?? [];
    list.push(band);
    bandsByScaleId.set(band.grading_scale_id, list);
  }

  const { data: qualityRows, error: qualityError } = scaleIds.length
    ? await db.from("academic_analysis_quality_symbols")
        .select("grading_scale_id,symbol,effective_from_year,effective_to_year,status")
        .eq("school_id", membership.schoolId)
        .in("grading_scale_id", scaleIds)
    : { data: [], error: null };
  if (qualityError) throw new Error("Unable to resolve governed Academic Analysis quality symbols.");
  const qualitySymbolsByScaleId = new Map<string, Set<string>>();
  for (const row of qualityRows ?? []) {
    if (row.status !== "active") continue;
    if (row.effective_from_year > scope.academicYear) continue;
    if (row.effective_to_year != null && row.effective_to_year < scope.academicYear) continue;
    const set = qualitySymbolsByScaleId.get(row.grading_scale_id) ?? new Set<string>();
    set.add(row.symbol);
    qualitySymbolsByScaleId.set(row.grading_scale_id, set);
  }

  const learnerIds = [...new Set((enrolments ?? []).map((row) => row.learner_id).filter(Boolean))];
  const { data: learners, error: learnerError } = learnerIds.length
    ? await db.from("learners").select("id,first_names,surname,preferred_name").in("id", learnerIds)
    : { data: [], error: null };
  if (learnerError) throw new Error("Unable to resolve Academic Analysis learners.");
  const learnerNameMap = new Map((learners ?? []).map((row) => [
    row.id,
    [row.preferred_name || row.first_names, row.surname].filter(Boolean).join(" ").trim() || "Learner",
  ]));
  const enrolmentMap = new Map((enrolments ?? []).map((row) => [row.id, row]));

  const { data: activeRuleSets, error: ruleSetError } = await db.from("promotion_rule_sets")
    .select("id,grade_id,rule_set_key,version")
    .eq("school_id", membership.schoolId)
    .eq("academic_year", scope.academicYear)
    .eq("status", "active");
  if (ruleSetError) throw new Error("Unable to resolve promotion-readiness rules.");
  const ruleSetIds = (activeRuleSets ?? []).map((row) => row.id);
  const { data: ruleConditions, error: ruleConditionError } = ruleSetIds.length
    ? await db.from("promotion_rule_conditions")
        .select("promotion_rule_set_id,condition_type,subject_code,required")
        .in("promotion_rule_set_id", ruleSetIds)
    : { data: [], error: null };
  if (ruleConditionError) throw new Error("Unable to resolve promotional-subject rules.");
  const promotionalSubjectCodes = new Set(
    (ruleConditions ?? [])
      .filter((row) => row.required && row.condition_type === "minimum_subject_result" && row.subject_code)
      .map((row) => String(row.subject_code).toUpperCase()),
  );

  const rows: AcademicAnalysisRow[] = [];
  for (const offeringId of offeringIds) {
    const offeringResults = typedResults.filter((row) => row.subject_offering_id === offeringId);
    const cohortClassKeys = [...new Set(offeringResults.map((row) => enrolmentClassMap.get(row.enrolment_id) ?? "unassigned"))];
    for (const cohortClassKey of cohortClassKeys) {
    const cohort = offeringResults.filter((row) => (enrolmentClassMap.get(row.enrolment_id) ?? "unassigned") === cohortClassKey);
    const numeric = cohort.filter((row) => row.result_value != null).map((row) => Number(row.result_value));
    const scaleKey = cohort.find((row) => row.grading_scale_key)?.grading_scale_key ?? null;
    const scaleVersion = cohort.find((row) => row.grading_scale_version)?.grading_scale_version ?? null;

    const scaleId = scaleKey && scaleVersion ? scaleIdByRef.get(`${scaleKey}::${scaleVersion}`) : null;
    const bands = scaleId ? bandsByScaleId.get(scaleId) ?? [] : [];
    const bandMap = new Map(bands.map((band) => [band.symbol, band]));
    const classified = cohort.filter((row) => row.symbol && bandMap.has(row.symbol));
    const passed = classified.filter((row) => bandMap.get(row.symbol!)?.pass_classification === "pass").length;
    const failed = classified.filter((row) => bandMap.get(row.symbol!)?.pass_classification === "fail").length;
    const distribution = bands.map((band) => {
      const count = cohort.filter((row) => row.symbol === band.symbol).length;
      return { bandId: band.id, symbol: band.symbol, count, percentage: rate(count, classified.length) };
    });
    const qualitySymbols = scaleId ? qualitySymbolsByScaleId.get(scaleId) ?? new Set<string>() : new Set<string>();
    const qualityCount = qualitySymbols.size
      ? classified.filter((row) => row.symbol && qualitySymbols.has(row.symbol)).length
      : null;
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
      className: cohortClassKey === "unassigned" ? null : classMap.get(cohortClassKey) ?? null,
      teacher: historicalTeacherNames.length === 1 ? historicalTeacherNames[0] ?? null : historicalTeacherNames.length > 1 ? historicalTeacherNames.join(" · ") : null,
      teacherAttribution: historicalTeacherNames.length === 1 ? "assessment_allocation" : historicalTeacherNames.length > 1 ? "multiple_assessment_allocations" : "unavailable",
      gradingScaleKey: scaleKey,
      gradingScaleVersion: scaleVersion,
      numericValues: numeric,
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
        qualityCount,
        qualityRate: qualityCount == null ? null : rate(qualityCount, classified.length),
        symbolDistribution: distribution,
      },
    });
    }
  }

  const filterOptions = {
    grades: [...new Set(rows.map((row) => row.grade).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    classes: [...new Set(rows.map((row) => row.className).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    subjects: [...new Map(rows.map((row) => [row.subjectOfferingId, { value: row.subjectOfferingId, label: row.subject, helper: row.grade }])).values()]
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }) || (a.helper ?? "").localeCompare(b.helper ?? "", undefined, { numeric: true })),
    teachers: [...new Set(rows.map((row) => row.teacher).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b)),
  };

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
      const aggregateNumericValues = group.flatMap((row) => row.numericValues);
      const numericSummary = summarizeNumericValues(aggregateNumericValues);
      return {
        key: label,
        label,
        summary: {
          eligibleLearners: group.reduce((sum, row) => sum + row.summary.eligibleLearners, 0),
          assessedLearners: group.reduce((sum, row) => sum + row.summary.assessedLearners, 0),
          numericResults: numericWeight,
          classifiedResults: classified,
          ...numericSummary,
          passed,
          failed,
          passRate: rate(passed, classified),
          failRate: rate(failed, classified),
          qualityCount: group.some((row) => row.summary.qualityCount != null)
            ? group.reduce((sum, row) => sum + (row.summary.qualityCount ?? 0), 0)
            : null,
          qualityRate: group.some((row) => row.summary.qualityCount != null)
            ? rate(
                group.reduce((sum, row) => sum + (row.summary.qualityCount ?? 0), 0),
                classified,
              )
            : null,
          symbolDistribution: [],
        },
      };
    }).sort((a, b) => a.label.localeCompare(b.label));
  }

  const filteredCohortKeys = new Set(
    filteredRows.map((row) => {
      const offering = offeringMap.get(row.subjectOfferingId);
      const matchingClass = [...classMap.entries()].find(([, name]) => name === row.className)?.[0] ?? "unassigned";
      return `${row.subjectOfferingId}::${matchingClass}`;
    }),
  );
  const learnerResults = typedResults.filter((result) => {
    const classId = enrolmentClassMap.get(result.enrolment_id) ?? "unassigned";
    return filteredCohortKeys.has(`${result.subject_offering_id}::${classId}`);
  });

  const previousTermResults: NumericResult[] = [];
  if (basis === "official" && scope.termNumber > 1 && enrolmentIds.length) {
    const { data: previous, error: previousError } = await db.from("official_results")
      .select("result_value,result_status,symbol,subject_offering_id,enrolment_id,grading_scale_key,grading_scale_version")
      .eq("school_id", membership.schoolId)
      .eq("academic_year", scope.academicYear)
      .eq("term_number", scope.termNumber - 1)
      .in("enrolment_id", enrolmentIds);
    if (previousError) throw new Error("Unable to load prior-term learner comparison.");
    previousTermResults.push(...((previous ?? []) as NumericResult[]));
  }
  const previousByKey = new Map(previousTermResults
    .filter((row) => row.result_value != null)
    .map((row) => [`${row.enrolment_id}::${row.subject_offering_id}`, Number(row.result_value)]));

  const resultGroups = new Map<string, NumericResult[]>();
  for (const result of learnerResults) {
    resultGroups.set(result.enrolment_id, [...(resultGroups.get(result.enrolment_id) ?? []), result]);
  }

  const promotionByEnrolment = new Map<string, PromotionReadiness>();
  const canReadPromotionReadiness = ["school_admin","principal","deputy_principal","hod"].includes(membership.roleKey);
  if (basis === "official" && canReadPromotionReadiness && activeRuleSets?.length) {
    const { data: readiness, error: readinessError } = await db.rpc("get_academic_analysis_promotion_readiness", {
      p_school_id: membership.schoolId,
      p_academic_year: scope.academicYear,
    });
    if (readinessError) throw new Error("Unable to load canonical promotion readiness.");
    for (const raw of (readiness ?? []) as Array<Record<string, unknown>>) {
      const failures = Array.isArray(raw.failures) ? raw.failures : [];
      promotionByEnrolment.set(String(raw.enrolment_id), {
        status: raw.passed === true ? "ready" : "not_ready",
        recommendedOutcome: raw.recommended_outcome ? String(raw.recommended_outcome) : null,
        ruleSetKey: raw.rule_set_key ? String(raw.rule_set_key) : null,
        ruleSetVersion: raw.rule_set_version ? String(raw.rule_set_version) : null,
        failedConditions: failures.length,
      });
    }
  }

  const learnerRiskRows: LearnerRiskRow[] = [...resultGroups.entries()].map(([enrolmentId, learnerRows]) => {
    const enrolment = enrolmentMap.get(enrolmentId);
    const numeric = learnerRows.filter((row) => row.result_value != null).map((row) => Number(row.result_value));
    let failedSubjects = 0;
    let promotionalSubjectFailures = 0;
    let nearThresholdSubjects = 0;
    let qualityCount = 0;
    let qualityDenominator = 0;
    const sharedImprovements: number[] = [];

    for (const result of learnerRows) {
      const scaleId = result.grading_scale_key && result.grading_scale_version
        ? scaleIdByRef.get(`${result.grading_scale_key}::${result.grading_scale_version}`) ?? null
        : null;
      const bands = scaleId ? bandsByScaleId.get(scaleId) ?? [] : [];
      const band = result.symbol ? bands.find((candidate) => candidate.symbol === result.symbol) : null;
      if (band?.pass_classification === "fail") {
        failedSubjects += 1;
        const offering = offeringMap.get(result.subject_offering_id);
        const subjectCode = subjectCodeMap.get(offering?.subject_id ?? "")?.toUpperCase() ?? "";
        if (subjectCode && promotionalSubjectCodes.has(subjectCode)) promotionalSubjectFailures += 1;
        const passMinimums = bands
          .filter((candidate) => candidate.pass_classification === "pass")
          .map((candidate) => Number(candidate.minimum_value))
          .filter(Number.isFinite);
        const passThreshold = passMinimums.length ? Math.min(...passMinimums) : null;
        const value = result.result_value == null ? null : Number(result.result_value);
        if (passThreshold != null && value != null && value < passThreshold && passThreshold - value <= NEAR_THRESHOLD_MARGIN) {
          nearThresholdSubjects += 1;
        }
      }
      const qualitySymbols = scaleId ? qualitySymbolsByScaleId.get(scaleId) : null;
      if (qualitySymbols?.size && result.symbol) {
        qualityDenominator += 1;
        if (qualitySymbols.has(result.symbol)) qualityCount += 1;
      }
      const previous = previousByKey.get(`${enrolmentId}::${result.subject_offering_id}`);
      if (previous != null && result.result_value != null) sharedImprovements.push(Number(result.result_value) - previous);
    }

    const readiness = promotionByEnrolment.get(enrolmentId) ?? {
      status: "unavailable" as const,
      recommendedOutcome: null,
      ruleSetKey: null,
      ruleSetVersion: null,
      failedConditions: 0,
    };
    const riskLevel: LearnerRiskRow["riskLevel"] =
      readiness.status === "not_ready" || promotionalSubjectFailures > 0 || failedSubjects >= 2
        ? "high"
        : failedSubjects === 1 || nearThresholdSubjects > 0
          ? "watch"
          : "stable";

    return {
      enrolmentId,
      learnerId: enrolment?.learner_id ?? "",
      learnerName: learnerNameMap.get(enrolment?.learner_id ?? "") ?? "Learner",
      admissionNumber: enrolment?.admission_number ?? "",
      grade: gradeMap.get(enrolment?.grade_id ?? "") ?? "",
      className: classMap.get(enrolment?.register_class_id ?? "") ?? "",
      assessedSubjects: learnerRows.filter((row) => row.result_value != null || row.result_status != null).length,
      average: summarizeNumericValues(numeric).average,
      failedSubjects,
      promotionalSubjectFailures,
      nearThresholdSubjects,
      qualityCount: qualityDenominator ? qualityCount : null,
      qualityRate: qualityDenominator ? rate(qualityCount, qualityDenominator) : null,
      improvement: sharedImprovements.length
        ? rounded(sharedImprovements.reduce((sum, value) => sum + value, 0) / sharedImprovements.length)
        : null,
      sharedImprovementSubjects: sharedImprovements.length,
      riskLevel,
      promotionReadiness: readiness,
    };
  }).sort((a, b) => {
    const severity = { high: 0, watch: 1, stable: 2 };
    return severity[a.riskLevel] - severity[b.riskLevel]
      || b.failedSubjects - a.failedSubjects
      || a.learnerName.localeCompare(b.learnerName);
  });

  const topLearners = learnerRiskRows
    .filter((row) => row.average != null)
    .sort((a, b) => (b.average ?? -Infinity) - (a.average ?? -Infinity) || a.learnerName.localeCompare(b.learnerName))
    .slice(0, 10);
  const topImprovers = learnerRiskRows
    .filter((row) => row.improvement != null && row.sharedImprovementSubjects > 0)
    .sort((a, b) => (b.improvement ?? -Infinity) - (a.improvement ?? -Infinity) || a.learnerName.localeCompare(b.learnerName))
    .slice(0, 10);

  function passRateFromComparisonRows(rows: Array<Record<string, unknown>>, side: "left" | "right"): number | null {
    const sideRows = rows.filter((row) => row.series_side === side && row.outcome_type === "symbol");
    if (!sideRows.length) return null;
    const first = sideRows[0];
    const scaleRef = first.grading_scale_key && first.grading_scale_version
      ? `${String(first.grading_scale_key)}::${String(first.grading_scale_version)}`
      : null;
    const scaleId = scaleRef ? scaleIdByRef.get(scaleRef) : null;
    const passSymbols = new Set((scaleId ? bandsByScaleId.get(scaleId) ?? [] : [])
      .filter((band) => band.pass_classification === "pass")
      .map((band) => band.symbol));
    if (!passSymbols.size) return null;
    return rounded(sideRows
      .filter((row) => row.outcome_value && passSymbols.has(String(row.outcome_value)))
      .reduce((sum, row) => sum + Number(row.percentage ?? 0), 0));
  }

  const uniqueTrendRows = [...new Map(filteredRows.map((row) => [row.subjectOfferingId, row])).values()];
  const trends: AcademicTrendRow[] = [];
  if (basis === "official") {
    const currentOfferingMeta = uniqueTrendRows.map((row) => {
      const offering = offeringMap.get(row.subjectOfferingId);
      return {
        row,
        subjectId: offering?.subject_id ?? "",
        gradeCode: gradeCodeMap.get(offering?.grade_id ?? "") ?? "",
      };
    });
    const previousGradeCodes = [...new Set(currentOfferingMeta.map((item) => item.gradeCode).filter(Boolean))];
    const { data: priorGrades } = previousGradeCodes.length
      ? await db.from("grades").select("id,grade_code").eq("school_id", membership.schoolId).eq("academic_year", scope.academicYear - 1).in("grade_code", previousGradeCodes)
      : { data: [] };
    const priorGradeIdByCode = new Map((priorGrades ?? []).map((row) => [row.grade_code, row.id]));
    const priorGradeIds = [...priorGradeIdByCode.values()];
    const priorSubjectIds = [...new Set(currentOfferingMeta.map((item) => item.subjectId).filter(Boolean))];
    const { data: priorOfferings } = priorGradeIds.length && priorSubjectIds.length
      ? await db.from("subject_offerings").select("id,subject_id,grade_id").eq("school_id", membership.schoolId).eq("academic_year", scope.academicYear - 1).in("grade_id", priorGradeIds).in("subject_id", priorSubjectIds)
      : { data: [] };
    const priorOfferingMap = new Map((priorOfferings ?? []).map((row) => [`${row.subject_id}::${row.grade_id}`, row.id]));

    for (const item of currentOfferingMeta) {
      async function compare(
        leftOfferingId: string | null,
        leftYear: number,
        leftTerm: number,
      ): Promise<AcademicTrendComparison> {
        if (!leftOfferingId) return { status: "not_comparable", passRateDelta: null, leftPassRate: null, rightPassRate: null, reason: "No canonical comparison offering exists." };
        const { data, error } = await db.rpc("compare_official_result_series", {
          p_school_id: membership.schoolId,
          p_left_subject_offering_id: leftOfferingId,
          p_right_subject_offering_id: item.row.subjectOfferingId,
          p_left_academic_year: leftYear,
          p_left_term_number: leftTerm,
          p_right_academic_year: scope.academicYear,
          p_right_term_number: scope.termNumber,
        });
        if (error) return { status: "not_comparable", passRateDelta: null, leftPassRate: null, rightPassRate: null, reason: error.message };
        const comparisonRows = (data ?? []) as Array<Record<string, unknown>>;
        const leftPassRate = passRateFromComparisonRows(comparisonRows, "left");
        const rightPassRate = passRateFromComparisonRows(comparisonRows, "right");
        return {
          status: "comparable",
          leftPassRate,
          rightPassRate,
          passRateDelta: leftPassRate == null || rightPassRate == null ? null : rounded(rightPassRate - leftPassRate),
          reason: null,
        };
      }

      const termOnTerm = scope.termNumber > 1
        ? await compare(item.row.subjectOfferingId, scope.academicYear, scope.termNumber - 1)
        : { status: "not_comparable" as const, passRateDelta: null, leftPassRate: null, rightPassRate: null, reason: "No earlier term exists in this academic year." };
      const priorGradeId = priorGradeIdByCode.get(item.gradeCode);
      const priorOfferingId = priorGradeId ? priorOfferingMap.get(`${item.subjectId}::${priorGradeId}`) ?? null : null;
      const yearOnYear = await compare(priorOfferingId, scope.academicYear - 1, scope.termNumber);
      trends.push({
        subjectOfferingId: item.row.subjectOfferingId,
        subject: item.row.subject,
        grade: item.row.grade,
        termOnTerm,
        yearOnYear,
      });
    }
  } else {
    for (const row of uniqueTrendRows) {
      const unavailable: AcademicTrendComparison = {
        status: "not_comparable",
        passRateDelta: null,
        leftPassRate: null,
        rightPassRate: null,
        reason: "Governed trend comparison requires locked official result series.",
      };
      trends.push({ subjectOfferingId: row.subjectOfferingId, subject: row.subject, grade: row.grade, termOnTerm: unavailable, yearOnYear: unavailable });
    }
  }

  return {
    schoolId: membership.schoolId,
    basis,
    academicYear: scope.academicYear,
    termNumber: scope.termNumber,
    rows: filteredRows.sort((a, b) => a.grade.localeCompare(b.grade) || a.subject.localeCompare(b.subject)),
    subjectSummaries: aggregateBy((row) => row.subject),
    gradeSummaries: aggregateBy((row) => row.grade),
    classSummaries: aggregateBy((row) => row.className),
    teacherSummaries: aggregateBy((row) => row.teacher),
    qualityConfigured: qualitySymbolsByScaleId.size > 0,
    learnerRiskRows,
    topLearners,
    topImprovers,
    trends,
    nearThresholdMargin: NEAR_THRESHOLD_MARGIN,
    filterOptions,
    exportRows: filteredRows.map((row) => ({
      grade: row.grade,
      className: row.className ?? "",
      subject: row.subject,
      teacher: row.teacher ?? "",
      assessed: row.summary.assessedLearners,
      average: row.summary.average,
      median: row.summary.median,
      passRate: row.summary.passRate,
      failRate: row.summary.failRate,
      symbols: row.summary.symbolDistribution.map((band) => `${band.symbol} ${band.count}`).join(" · "),
    })),
  };
}
