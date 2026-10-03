import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AdmissionIntakeJob = {
  id: string;
  academic_year: number;
  source_kind: string;
  document_type: string;
  status: string;
  extraction_status: string;
  candidate_payload: Record<string, string>;
  field_confidence: Record<string, number>;
  match_status: string;
  match_candidates: {
    learners?: Array<{ learner_id: string; display_name: string; date_of_birth: string | null; admission_number: string | null }>;
    guardians?: Array<{ guardian_id: string; guardian_name: string; contact_value: string }>;
  };
  review_decision: string;
  selected_learner_id: string | null;
  committed_entity_id: string | null;
  created_at: string;
};

export async function getAdmissionsIntakeWorkspace(schoolId: string, academicYear: number, selectedJobId?: string) {
  const supabase = await createSupabaseServerClient();
  const [jobsResult, applicationsResult, gradesResult] = await Promise.all([
    supabase
      .from("document_intake_jobs")
      .select("id,academic_year,source_kind,document_type,status,extraction_status,candidate_payload,field_confidence,match_status,match_candidates,review_decision,selected_learner_id,committed_entity_id,created_at")
      .eq("school_id", schoolId)
      .eq("intake_type", "admission")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("admission_applications")
      .select("id,academic_year,applicant_first_names,applicant_surname,date_of_birth,guardian_name,guardian_contact,previous_school,status,submitted_at,reviewed_at,decision_note,learner_id,enrolment_id,intake_job_id")
      .eq("school_id", schoolId)
      .order("submitted_at", { ascending: false })
      .limit(40),
    supabase
      .from("grades")
      .select("id,grade_code,display_name")
      .eq("school_id", schoolId)
      .eq("academic_year", academicYear)
      .order("display_name"),
  ]);
  if (jobsResult.error || applicationsResult.error || gradesResult.error) {
    throw new Error("Unable to load admissions workspace.");
  }

  const jobs = (jobsResult.data ?? []) as AdmissionIntakeJob[];
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;
  let artifacts: Array<{ id: string; artifact_kind: string; storage_path: string; file_name: string; mime_type: string; file_size_bytes: number }> = [];
  let signedSourceUrl: string | null = null;

  if (selectedJob) {
    const artifactsResult = await supabase
      .from("document_intake_artifacts")
      .select("id,artifact_kind,storage_path,file_name,mime_type,file_size_bytes")
      .eq("job_id", selectedJob.id)
      .order("created_at");
    if (artifactsResult.error) throw new Error("Unable to load intake source artifacts.");
    artifacts = artifactsResult.data ?? [];
    const primary = artifacts.find((item) => item.artifact_kind === "application_form") ?? artifacts[0];
    if (primary) {
      const signed = await supabase.storage.from("document-intake-private").createSignedUrl(primary.storage_path, 600);
      if (!signed.error) signedSourceUrl = signed.data.signedUrl;
    }
  }

  return {
    jobs,
    selectedJob,
    artifacts,
    signedSourceUrl,
    applications: applicationsResult.data ?? [],
    grades: gradesResult.data ?? [],
  };
}
