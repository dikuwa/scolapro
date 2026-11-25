import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatLearnerName } from "@/lib/person-name";

export type ProgressionPublication = {
  id: string;
  destinationAcademicYear: number;
  destinationGradeCode: string | null;
  destinationEnrolmentId: string;
  publishedAt: string;
};

export type ProgressionStatus = "draft" | "reviewed" | "approved" | "locked";

export type ProgressionLearner = {
  enrolmentId: string;
  learnerId: string;
  learnerName: string;
  admissionNumber: string | null;
  gradeId: string;
  gradeCode: string;
  gradeName: string;
  registerClassId: string;
  registerClassName: string;
  ruleSetId: string | null;
  ruleSetLabel: string | null;
  recommendation: {
    outcome: string;
    passed: boolean;
    failedSubjects: number;
    subjectCount: number;
    overallAverage: number | null;
  } | null;
  progression: {
    id: string;
    status: ProgressionStatus;
    outcome: string;
    recommendedOutcome: string;
    destinationGradeCode: string | null;
    overrideReason: string | null;
    decidedAt: string | null;
    lockedAt: string | null;
  } | null;
  publication: ProgressionPublication | null;
};

export type ProgressionDestinationChoice = {
  id: string;
  gradeId: string;
  gradeCode: string;
  academicYear: number;
  displayName: string;
};

export type ProgressionWorkspace = {
  academicYear: number;
  /** True when the canonical readiness projection could not be evaluated. */
  readinessFailed: boolean;
  grades: Array<{ id: string; label: string }>;
  selectedGradeId: string | null;
  nextAcademicYear: number;
  nextYearConfigured: boolean;
  destinationChoices: ProgressionDestinationChoice[];
  learners: ProgressionLearner[];
  counts: {
    learners: number;
    notStarted: number;
    reviewed: number;
    approved: number;
    locked: number;
    published: number;
    missingRuleSet: number;
    notPublished: number;
  };
};

type Row = Record<string, unknown>;

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : value === null || value === undefined ? null : Number(value);
}

/**
 * Canonical progression workspace read model. It joins authoritative enrolment,
 * grade, class and progression records and uses the canonical bulk readiness RPC
 * for recommendations. No promotion rule is evaluated in application code.
 */
export async function getProgressionWorkspace(schoolId: string, academicYear: number, requestedGradeId?: string | null): Promise<ProgressionWorkspace> {
  const supabase = await createSupabaseServerClient();
  const nextAcademicYear = academicYear + 1;

  // Bound the progression engine to one grade at a time. A whole-school run would
  // evaluate every learner's marks and attendance in one request.
  const [yearsResult, gradesResult, classesResult] = await Promise.all([
    supabase.from("academic_years").select("year,status").eq("school_id", schoolId).eq("year", nextAcademicYear).maybeSingle(),
    supabase.from("grades").select("id,grade_code,display_name,academic_year").eq("school_id", schoolId).in("academic_year", [academicYear, nextAcademicYear]).order("grade_code"),
    supabase.from("register_classes").select("id,grade_id,academic_year,display_name,class_code").eq("school_id", schoolId).eq("academic_year", nextAcademicYear).order("display_name"),
  ]);
  for (const result of [yearsResult, gradesResult, classesResult]) {
    if (result.error) throw new Error("Unable to load the year-end progression workspace.");
  }
  const gradeById = new Map((gradesResult.data ?? []).map((row) => [str(row.id), row]));
  const currentYearGrades = (gradesResult.data ?? []).filter((row) => Number(row.academic_year) === academicYear);
  const selectedGradeId = requestedGradeId && gradeById.has(requestedGradeId)
    ? requestedGradeId
    : currentYearGrades[0] ? str(currentYearGrades[0].id) : null;

  const enrolmentsResult = selectedGradeId
    ? await supabase.from("enrolments")
      .select("id,learner_id,academic_year,grade_id,register_class_id,admission_number")
      .eq("school_id", schoolId)
      .eq("academic_year", academicYear)
      .eq("grade_id", selectedGradeId)
      .eq("status", "current")
      .order("admission_number")
    : { data: [], error: null };
  if (enrolmentsResult.error) throw new Error("Unable to load the year-end progression workspace.");

  const enrolments = (enrolmentsResult.data ?? []) as Row[];
  const enrolmentIds = enrolments.map((row) => str(row.id));
  const learnerIds = [...new Set(enrolments.map((row) => str(row.learner_id)).filter(Boolean))];
  const registerClassIds = [...new Set(enrolments.map((row) => str(row.register_class_id)).filter(Boolean))];

  const [learnersResult, registerClassesResult, progressionsResult, ruleSetsResult, readinessResult] = await Promise.all([
    learnerIds.length ? supabase.from("learners").select("id,first_names,surname,preferred_name").in("id", learnerIds) : Promise.resolve({ data: [], error: null }),
    registerClassIds.length ? supabase.from("register_classes").select("id,display_name,class_code").in("id", registerClassIds) : Promise.resolve({ data: [], error: null }),
    enrolmentIds.length
      ? supabase.from("year_end_progressions")
        .select("id,enrolment_id,status,outcome,recommended_outcome,destination_grade_code,override_reason,decided_at,locked_at")
        .in("enrolment_id", enrolmentIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("promotion_rule_sets")
      .select("id,grade_id,rule_set_key,version")
      .eq("school_id", schoolId)
      .eq("academic_year", academicYear)
      .eq("status", "active"),
    supabase.rpc("get_academic_analysis_promotion_readiness", { p_school_id: schoolId, p_academic_year: academicYear }),
  ]);
  // Only the structural reads (year, grades, classes, enrolments) are essential.
  // Learner names, rule sets, existing decisions, publications and advisory
  // recommendations degrade gracefully: losing one of them must not blank the
  // whole grade workspace or block a legitimate decision.
  const partialFailure = [learnersResult, registerClassesResult, progressionsResult, ruleSetsResult, readinessResult]
    .some((result) => Boolean(result.error));
  const readinessFailed = partialFailure;
  if (partialFailure) {
    // Diagnose without learner-identifying detail: which optional read failed.
    console.error("progression.workspace.partial_read_failure", {
      learners: Boolean(learnersResult.error),
      registerClasses: Boolean(registerClassesResult.error),
      progressions: Boolean(progressionsResult.error),
      ruleSets: Boolean(ruleSetsResult.error),
      readiness: Boolean(readinessResult.error),
    });
  }

  const learnerById = new Map((learnersResult.data ?? []).map((row) => [str(row.id), row]));
  const registerClassById = new Map((registerClassesResult.data ?? []).map((row) => [str(row.id), row]));
  const progressionByEnrolment = new Map((progressionsResult.data ?? []).map((row) => [str(row.enrolment_id), row]));
  const ruleSetByGrade = new Map((ruleSetsResult.data ?? []).map((row) => [str(row.grade_id), row]));
  const readinessByEnrolment = new Map(
    ((readinessResult.data ?? []) as Row[]).map((row) => [str(row.enrolment_id), row]),
  );

  const progressionIds = (progressionsResult.data ?? []).map((row) => str(row.id)).filter(Boolean);
  const publicationsResult = progressionIds.length
    ? await supabase.from("year_end_progression_publications")
      .select("id,progression_id,destination_academic_year,destination_grade_code,destination_enrolment_id,published_at")
      .in("progression_id", progressionIds)
    : { data: [], error: null };
  if (publicationsResult.error) throw new Error("Unable to load progression publications.");
  const publicationByProgression = new Map((publicationsResult.data ?? []).map((row) => [str(row.progression_id), row]));

  const learners: ProgressionLearner[] = enrolments.map((enrolment) => {
    const learner = learnerById.get(str(enrolment.learner_id));
    const grade = gradeById.get(str(enrolment.grade_id));
    const registerClass = registerClassById.get(str(enrolment.register_class_id));
    const progression = progressionByEnrolment.get(str(enrolment.id));
    const ruleSet = ruleSetByGrade.get(str(enrolment.grade_id));
    const readiness = readinessByEnrolment.get(str(enrolment.id));
    const publication = progression ? publicationByProgression.get(str(progression.id)) : undefined;
    return {
      enrolmentId: str(enrolment.id),
      learnerId: str(enrolment.learner_id),
      learnerName: formatLearnerName(str(learner?.first_names), str(learner?.surname)),
      admissionNumber: strOrNull(enrolment.admission_number),
      gradeId: str(enrolment.grade_id),
      gradeCode: str(grade?.grade_code),
      gradeName: str(grade?.display_name),
      registerClassId: str(enrolment.register_class_id),
      registerClassName: str(registerClass?.display_name),
      ruleSetId: ruleSet ? str(ruleSet.id) : null,
      ruleSetLabel: ruleSet ? `${str(ruleSet.rule_set_key)} v${str(ruleSet.version)}` : null,
      recommendation: readiness
        ? {
          outcome: str(readiness.recommended_outcome),
          passed: Boolean(readiness.passed),
          failedSubjects: Number(readiness.failed_subjects ?? 0),
          subjectCount: Number(readiness.subject_count ?? 0),
          overallAverage: numOrNull(readiness.overall_average),
        }
        : null,
      progression: progression
        ? {
          id: str(progression.id),
          status: str(progression.status) as ProgressionStatus,
          outcome: str(progression.outcome),
          recommendedOutcome: str(progression.recommended_outcome),
          destinationGradeCode: strOrNull(progression.destination_grade_code),
          overrideReason: strOrNull(progression.override_reason),
          decidedAt: strOrNull(progression.decided_at),
          lockedAt: strOrNull(progression.locked_at),
        }
        : null,
      publication: publication
        ? {
          id: str(publication.id),
          destinationAcademicYear: Number(publication.destination_academic_year),
          destinationGradeCode: strOrNull(publication.destination_grade_code),
          destinationEnrolmentId: str(publication.destination_enrolment_id),
          publishedAt: str(publication.published_at),
        }
        : null,
    };
  });

  const destinationChoices: ProgressionDestinationChoice[] = (classesResult.data ?? [])
    .map((row) => {
      const grade = gradeById.get(str(row.grade_id));
      return {
        id: str(row.id),
        gradeId: str(row.grade_id),
        gradeCode: str(grade?.grade_code),
        academicYear: Number(row.academic_year),
        displayName: str(row.display_name),
      };
    })
    .filter((row) => row.gradeCode);

  const counts = {
    learners: learners.length,
    notStarted: learners.filter((item) => !item.progression).length,
    reviewed: learners.filter((item) => item.progression?.status === "reviewed").length,
    approved: learners.filter((item) => item.progression?.status === "approved").length,
    locked: learners.filter((item) => item.progression?.status === "locked").length,
    published: learners.filter((item) => item.publication).length,
    missingRuleSet: learners.filter((item) => !item.ruleSetId).length,
    notPublished: learners.filter((item) => !item.publication).length,
  };

  return {
    academicYear,
    readinessFailed,
    grades: currentYearGrades.map((row) => ({
      id: str(row.id),
      label: `${str(row.display_name) || str(row.grade_code)}`,
    })),
    selectedGradeId,
    nextAcademicYear,
    nextYearConfigured: Boolean(yearsResult.data),
    destinationChoices,
    learners,
    counts,
  };
}
