import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PriorSchoolRecord = {
  id: string;
  schoolName: string;
  medium: string | null;
  admissionDate: string | null;
  admissionGrade: string | null;
  departureDate: string | null;
  departureGrade: string | null;
};

export type HealthHistoryRecord = {
  id: string;
  observedOn: string;
  generalHealth: string | null;
  problemOrDisability: string | null;
  managementOrSupport: string | null;
  previousIllnesses: string | null;
};

export type PsychometricRecord = {
  id: string;
  testDate: string;
  testName: string;
  gradeLabel: string | null;
  testerName: string | null;
  remarks: string | null;
};

export type DevelopmentObservation = {
  id: string;
  academicYear: number;
  gradeLabel: string | null;
  domain: string;
  observation: string;
  observedOn: string | null;
};

export type CumulativeNote = {
  id: string;
  noteDate: string;
  noteType: string;
  note: string;
  sensitivity: string;
};

export type LearnerCumulativeRecord = {
  priorSchools: PriorSchoolRecord[];
  healthHistory: HealthHistoryRecord[];
  psychometricRecords: PsychometricRecord[];
  developmentObservations: DevelopmentObservation[];
  notes: CumulativeNote[];
};

export async function getLearnerCumulativeRecord(learnerId: string, schoolId: string): Promise<LearnerCumulativeRecord> {
  const supabase = await createSupabaseServerClient();

  const [priorSchoolsResult, healthResult, psychometricResult, developmentResult, notesResult] = await Promise.all([
    supabase.from("learner_prior_school_history").select("id, school_name, medium_of_instruction, admission_date, admission_grade, departure_date, departure_grade").eq("learner_id", learnerId).eq("school_id", schoolId).order("admission_date", { ascending: true, nullsFirst: false }),
    supabase.from("learner_health_history").select("id, observed_on, general_health, problem_or_disability, management_or_support, previous_illnesses").eq("learner_id", learnerId).eq("school_id", schoolId).order("observed_on", { ascending: false }),
    supabase.from("learner_psychometric_records").select("id, test_date, test_name, grade_label, tester_name, remarks").eq("learner_id", learnerId).eq("school_id", schoolId).order("test_date", { ascending: false }),
    supabase.from("learner_development_observations").select("id, academic_year, grade_label, domain, observation, observed_on").eq("learner_id", learnerId).eq("school_id", schoolId).order("academic_year", { ascending: false }),
    supabase.from("learner_cumulative_notes").select("id, note_date, note_type, note, sensitivity").eq("learner_id", learnerId).eq("school_id", schoolId).order("note_date", { ascending: false }),
  ]);

  const results = [
    ["priorSchools", priorSchoolsResult],
    ["healthHistory", healthResult],
    ["psychometricRecords", psychometricResult],
    ["developmentObservations", developmentResult],
    ["notes", notesResult],
  ] as const;

  // RLS intentionally makes restricted collections look empty to unauthorized roles.
  // A genuine database/query failure should still be surfaced rather than silently
  // presenting an incomplete record to an authorized user.
  const failedQueries = results.filter(([, result]) => result.error);
  if (failedQueries.length) {
    for (const [query, result] of failedQueries) {
      console.error("Learner cumulative record query failed", {
        query,
        learnerId,
        schoolId,
        error: result.error?.message,
        code: result.error?.code,
        details: result.error?.details,
        hint: result.error?.hint,
      });
    }
    throw new Error("Unable to load the cumulative learner record.");
  }

  return {
    priorSchools: (priorSchoolsResult.data ?? []).map((row) => ({
      id: row.id,
      schoolName: row.school_name,
      medium: row.medium_of_instruction,
      admissionDate: row.admission_date,
      admissionGrade: row.admission_grade,
      departureDate: row.departure_date,
      departureGrade: row.departure_grade,
    })),
    healthHistory: (healthResult.data ?? []).map((row) => ({
      id: row.id,
      observedOn: row.observed_on,
      generalHealth: row.general_health,
      problemOrDisability: row.problem_or_disability,
      managementOrSupport: row.management_or_support,
      previousIllnesses: row.previous_illnesses,
    })),
    psychometricRecords: (psychometricResult.data ?? []).map((row) => ({
      id: row.id,
      testDate: row.test_date,
      testName: row.test_name,
      gradeLabel: row.grade_label,
      testerName: row.tester_name,
      remarks: row.remarks,
    })),
    developmentObservations: (developmentResult.data ?? []).map((row) => ({
      id: row.id,
      academicYear: row.academic_year,
      gradeLabel: row.grade_label,
      domain: row.domain,
      observation: row.observation,
      observedOn: row.observed_on,
    })),
    notes: (notesResult.data ?? []).map((row) => ({
      id: row.id,
      noteDate: row.note_date,
      noteType: row.note_type,
      note: row.note,
      sensitivity: row.sensitivity,
    })),
  };
}
