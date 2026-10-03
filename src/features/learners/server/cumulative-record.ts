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

export type AttendanceYearSummary = {
  academicYear: number;
  total: number;
  statuses: { status: string; count: number }[];
};

export type OfficialAcademicResult = {
  id: string;
  academicYear: number;
  termNumber: number;
  subjectName: string;
  resultValue: number | null;
  resultStatus: string;
  symbol: string | null;
  publishedAt: string | null;
};

export type CrcConductFact = {
  id: string;
  occurredOn: string;
  direction: string;
  categoryCode: string;
  severity: string;
  summary: string;
  status: string;
};

export type CrcSupportFact = {
  id: string;
  openedOn: string;
  caseType: string;
  sensitivity: string;
  status: string;
  closedOn: string | null;
};

export type CrcTransferFact = {
  id: string;
  requestedOn: string;
  effectiveOn: string | null;
  destinationName: string;
  status: string;
};

export type LearnerCumulativeRecord = {
  priorSchools: PriorSchoolRecord[];
  healthHistory: HealthHistoryRecord[];
  psychometricRecords: PsychometricRecord[];
  developmentObservations: DevelopmentObservation[];
  notes: CumulativeNote[];
  attendance: AttendanceYearSummary[];
  officialResults: OfficialAcademicResult[];
  conduct: CrcConductFact[];
  support: CrcSupportFact[];
  transfers: CrcTransferFact[];
  sourceAccess: {
    attendance: boolean;
    academics: boolean;
    conduct: boolean;
    support: boolean;
    transfers: boolean;
  };
};

function oneRelation(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, unknown> | undefined) ?? null;
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

// RLS intentionally makes restricted collections look empty when the caller lacks need-to-know access.
export async function getLearnerCumulativeRecord(learnerId: string, schoolId: string): Promise<LearnerCumulativeRecord> {
  const supabase = await createSupabaseServerClient();

  const [
    priorSchoolsResult,
    healthResult,
    psychometricResult,
    developmentResult,
    notesResult,
    attendanceResult,
    resultsResult,
    conductResult,
    supportResult,
    transferResult,
  ] = await Promise.all([
    supabase.from("learner_prior_school_history").select("id, school_name, medium_of_instruction, admission_date, admission_grade, departure_date, departure_grade").eq("learner_id", learnerId).eq("school_id", schoolId).order("admission_date", { ascending: true, nullsFirst: false }),
    supabase.from("learner_health_history").select("id, observed_on, general_health, problem_or_disability, management_or_support, previous_illnesses").eq("learner_id", learnerId).eq("school_id", schoolId).order("observed_on", { ascending: false }),
    supabase.from("learner_psychometric_records").select("id, test_date, test_name, grade_label, tester_name, remarks").eq("learner_id", learnerId).eq("school_id", schoolId).order("test_date", { ascending: false }),
    supabase.from("learner_development_observations").select("id, academic_year, grade_label, domain, observation, observed_on").eq("learner_id", learnerId).eq("school_id", schoolId).order("academic_year", { ascending: false }),
    supabase.from("learner_cumulative_notes").select("id, note_date, note_type, note, sensitivity").eq("learner_id", learnerId).eq("school_id", schoolId).order("note_date", { ascending: false }),
    supabase.from("attendance_current").select("academic_year,status").eq("learner_id", learnerId).eq("school_id", schoolId).order("academic_year", { ascending: false }),
    supabase.from("official_results_current").select("id,academic_year,term_number,result_value,result_status,symbol,published_at,subject_offerings(subjects(display_name))").eq("learner_id", learnerId).eq("school_id", schoolId).order("academic_year", { ascending: false }).order("term_number", { ascending: false }),
    supabase.from("conduct_events").select("id,occurred_on,direction,category_code,severity,summary,status").eq("learner_id", learnerId).eq("school_id", schoolId).order("occurred_on", { ascending: false }).limit(100),
    supabase.from("learner_support_cases").select("id,opened_on,case_type,sensitivity,status,closed_on").eq("learner_id", learnerId).eq("school_id", schoolId).order("opened_on", { ascending: false }).limit(50),
    supabase.from("transfer_events").select("id,requested_on,effective_on,destination_name,status").eq("learner_id", learnerId).eq("source_school_id", schoolId).order("requested_on", { ascending: false }),
  ]);

  const coreResults = [
    ["priorSchools", priorSchoolsResult],
    ["healthHistory", healthResult],
    ["psychometricRecords", psychometricResult],
    ["developmentObservations", developmentResult],
    ["notes", notesResult],
  ] as const;
  const failedCore = coreResults.filter(([, result]) => result.error);
  if (failedCore.length) {
    for (const [query, result] of failedCore) {
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

  const attendanceByYear = new Map<number, Map<string, number>>();
  for (const row of attendanceResult.data ?? []) {
    const year = Number(row.academic_year);
    const status = String(row.status ?? "unknown");
    const statusCounts = attendanceByYear.get(year) ?? new Map<string, number>();
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    attendanceByYear.set(year, statusCounts);
  }

  return {
    priorSchools: (priorSchoolsResult.data ?? []).map((row) => ({
      id: row.id, schoolName: row.school_name, medium: row.medium_of_instruction,
      admissionDate: row.admission_date, admissionGrade: row.admission_grade,
      departureDate: row.departure_date, departureGrade: row.departure_grade,
    })),
    healthHistory: (healthResult.data ?? []).map((row) => ({
      id: row.id, observedOn: row.observed_on, generalHealth: row.general_health,
      problemOrDisability: row.problem_or_disability, managementOrSupport: row.management_or_support,
      previousIllnesses: row.previous_illnesses,
    })),
    psychometricRecords: (psychometricResult.data ?? []).map((row) => ({
      id: row.id, testDate: row.test_date, testName: row.test_name, gradeLabel: row.grade_label,
      testerName: row.tester_name, remarks: row.remarks,
    })),
    developmentObservations: (developmentResult.data ?? []).map((row) => ({
      id: row.id, academicYear: row.academic_year, gradeLabel: row.grade_label,
      domain: row.domain, observation: row.observation, observedOn: row.observed_on,
    })),
    notes: (notesResult.data ?? []).map((row) => ({
      id: row.id, noteDate: row.note_date, noteType: row.note_type, note: row.note, sensitivity: row.sensitivity,
    })),
    attendance: attendanceResult.error ? [] : Array.from(attendanceByYear.entries())
      .sort(([a],[b]) => b-a)
      .map(([academicYear, counts]) => ({
        academicYear,
        total: Array.from(counts.values()).reduce((sum, count) => sum + count, 0),
        statuses: Array.from(counts.entries()).map(([status, count]) => ({ status, count })).sort((a,b) => a.status.localeCompare(b.status)),
      })),
    officialResults: resultsResult.error ? [] : ((resultsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => {
      const offering = oneRelation(row.subject_offerings);
      const subject = oneRelation(offering?.subjects);
      return {
        id: String(row.id),
        academicYear: Number(row.academic_year),
        termNumber: Number(row.term_number),
        subjectName: String(subject?.display_name ?? "Subject"),
        resultValue: row.result_value === null ? null : Number(row.result_value),
        resultStatus: String(row.result_status ?? ""),
        symbol: row.symbol ? String(row.symbol) : null,
        publishedAt: row.published_at ? String(row.published_at) : null,
      };
    }),
    conduct: conductResult.error ? [] : (conductResult.data ?? []).map((row) => ({
      id: row.id, occurredOn: row.occurred_on, direction: row.direction, categoryCode: row.category_code,
      severity: row.severity, summary: row.summary, status: row.status,
    })),
    support: supportResult.error ? [] : (supportResult.data ?? []).map((row) => ({
      id: row.id, openedOn: row.opened_on, caseType: row.case_type, sensitivity: row.sensitivity,
      status: row.status, closedOn: row.closed_on,
    })),
    transfers: transferResult.error ? [] : (transferResult.data ?? []).map((row) => ({
      id: row.id, requestedOn: row.requested_on, effectiveOn: row.effective_on,
      destinationName: row.destination_name ?? "Destination school", status: row.status,
    })),
    sourceAccess: {
      attendance: !attendanceResult.error,
      academics: !resultsResult.error,
      conduct: !conductResult.error,
      support: !supportResult.error,
      transfers: !transferResult.error,
    },
  };
}
