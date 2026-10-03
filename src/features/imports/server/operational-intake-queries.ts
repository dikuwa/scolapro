import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getOperationalIntakeWorkspace(
  schoolId: string,
  academicYear: number,
  adapter: "calendar" | "timetable",
  selectedJobId?: string,
) {
  const supabase = await createSupabaseServerClient();
  const { data: jobs, error: jobsError } = await supabase
    .from("document_intake_jobs")
    .select("id,intake_type,document_type,source_kind,status,extraction_status,created_at,reviewed_at,committed_at")
    .eq("school_id", schoolId)
    .eq("academic_year", academicYear)
    .eq("intake_type", adapter)
    .order("created_at", { ascending: false })
    .limit(30);
  if (jobsError) throw new Error("Unable to load operational intake jobs.");

  const selectedId = selectedJobId && (jobs ?? []).some((job) => job.id === selectedJobId)
    ? selectedJobId
    : (jobs?.[0]?.id ?? null);

  let rows: {
    id:string; row_number:number; adapter_kind:string; source_payload:Record<string,string>;
    normalized_payload:Record<string,string|number>; source_class:string|null; resolution:string;
    matched_entity_id:string|null; issues:string[]; review_decision:string; commit_status:string;
  }[] = [];
  let artifacts: { id:string; artifact_kind:string; file_name:string; storage_path:string; mime_type:string }[] = [];

  if (selectedId) {
    const [rowResult, artifactResult] = await Promise.all([
      supabase.from("document_intake_adapter_rows")
        .select("id,row_number,adapter_kind,source_payload,normalized_payload,source_class,resolution,matched_entity_id,issues,review_decision,commit_status")
        .eq("job_id", selectedId).order("row_number"),
      supabase.from("document_intake_artifacts")
        .select("id,artifact_kind,file_name,storage_path,mime_type")
        .eq("job_id", selectedId).order("created_at"),
    ]);
    if (rowResult.error || artifactResult.error) throw new Error("Unable to load operational intake review.");
    rows = (rowResult.data ?? []) as typeof rows;
    artifacts = (artifactResult.data ?? []) as typeof artifacts;
  }

  return {
    jobs: jobs ?? [],
    selectedJob: (jobs ?? []).find((job) => job.id === selectedId) ?? null,
    rows,
    artifacts,
    pendingReviewCount: rows.filter((row) => row.review_decision === "pending").length,
  };
}
