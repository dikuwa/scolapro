import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ReportCardBatchIssueRow,
  ReportCardBatchRow,
  ReportCardDocumentRow,
  ReportCardRenderJobRow,
} from "@/features/reporting/server/report-cards";

export type ReportCardGradeOption = { id: string; label: string };
export type ReportCardClassOption = { id: string; label: string; gradeId: string | null };

export type ReportCardManagementMeta = {
  terms: { termNumber: number; name: string }[];
  grades: ReportCardGradeOption[];
  classes: ReportCardClassOption[];
  batches: ReportCardBatchRow[];
  batchIssues: ReportCardBatchIssueRow[];
  academicYear: number;
};

export type ReportCardPageArtifacts = {
  renderJobs: ReportCardRenderJobRow[];
  documents: ReportCardDocumentRow[];
};

export async function getReportCardManagementMeta(
  schoolId: string,
  academicYear: number,
): Promise<ReportCardManagementMeta> {
  const supabase = await createSupabaseServerClient();
  const [termsResult, gradesResult, classesResult, batchesResult] = await Promise.all([
    supabase
      .from("academic_terms")
      .select("term_number,display_name,academic_years!inner(year)")
      .eq("school_id", schoolId)
      .eq("academic_years.year", academicYear)
      .order("term_number"),
    supabase
      .from("grades")
      .select("id,display_name")
      .eq("school_id", schoolId)
      .eq("academic_year", academicYear)
      .order("display_name"),
    supabase
      .from("register_classes")
      .select("id,display_name,grade_id")
      .eq("school_id", schoolId)
      .eq("academic_year", academicYear)
      .order("display_name"),
    supabase
      .from("report_card_batches")
      .select("id,term_number,scope_type,scope_label,operation,status,total_items,processed_items,completed_items,skipped_items,failed_items,export_status,export_page_count,export_error,created_at,completed_at")
      .eq("school_id", schoolId)
      .eq("academic_year", academicYear)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const error = termsResult.error || gradesResult.error || classesResult.error || batchesResult.error;
  if (error) throw new Error("Unable to load report-card management metadata.");

  const terms = (termsResult.data ?? []).map((item) => ({
    termNumber: item.term_number,
    name: item.display_name,
  }));
  if (!terms.length) {
    terms.push(
      { termNumber: 1, name: "Term 1" },
      { termNumber: 2, name: "Term 2" },
      { termNumber: 3, name: "Term 3" },
    );
  }

  const batches: ReportCardBatchRow[] = (batchesResult.data ?? []).map((item) => ({
    id: item.id,
    termNumber: item.term_number,
    scopeType: item.scope_type as ReportCardBatchRow["scopeType"],
    scopeLabel: item.scope_label,
    operation: item.operation as ReportCardBatchRow["operation"],
    status: item.status as ReportCardBatchRow["status"],
    totalItems: item.total_items,
    processedItems: item.processed_items,
    completedItems: item.completed_items,
    skippedItems: item.skipped_items,
    failedItems: item.failed_items,
    exportStatus: item.export_status as ReportCardBatchRow["exportStatus"],
    exportPageCount: item.export_page_count,
    exportError: item.export_error,
    createdAt: item.created_at,
    completedAt: item.completed_at,
  }));

  let batchIssues: ReportCardBatchIssueRow[] = [];
  const recentBatchIds = batches.map((batch) => batch.id);
  if (recentBatchIds.length) {
    const { data: batchIssueData, error: batchIssueError } = await supabase
      .from("report_card_batch_items")
      .select("batch_id,enrolment_id,learner_id,status,result_code,message")
      .eq("school_id", schoolId)
      .in("batch_id", recentBatchIds)
      .in("status", ["skipped", "failed"])
      .order("completed_at", { ascending: false })
      .limit(240);
    if (batchIssueError) throw new Error("Unable to load report-card batch outcomes.");

    batchIssues = (batchIssueData ?? []).map((item) => ({
      batchId: item.batch_id,
      enrolmentId: item.enrolment_id,
      learnerId: item.learner_id,
      status: item.status as ReportCardBatchIssueRow["status"],
      resultCode: item.result_code,
      message: item.message,
    }));
  }

  return {
    terms,
    grades: (gradesResult.data ?? []).map((item) => ({ id: item.id, label: item.display_name })),
    classes: (classesResult.data ?? []).map((item) => ({ id: item.id, label: item.display_name, gradeId: item.grade_id })),
    batches,
    batchIssues,
    academicYear,
  };
}

export async function getReportCardPageArtifacts(
  schoolId: string,
  snapshotIds: string[],
): Promise<ReportCardPageArtifacts> {
  const uniqueSnapshotIds = [...new Set(snapshotIds.filter(Boolean))].slice(0, 100);
  if (!uniqueSnapshotIds.length) return { renderJobs: [], documents: [] };

  const supabase = await createSupabaseServerClient();
  const [renderJobsResult, documentsResult] = await Promise.all([
    supabase
      .from("report_card_render_jobs")
      .select("id,snapshot_id,document_format,status,attempt_count,last_error,output_document_id,updated_at")
      .eq("school_id", schoolId)
      .in("snapshot_id", uniqueSnapshotIds)
      .order("updated_at", { ascending: false }),
    supabase
      .from("report_card_documents")
      .select("id,snapshot_id,document_format,status,generated_at")
      .eq("school_id", schoolId)
      .eq("status", "ready")
      .in("snapshot_id", uniqueSnapshotIds)
      .order("generated_at", { ascending: false }),
  ]);

  if (renderJobsResult.error || documentsResult.error) {
    throw new Error("Unable to load report-card page artifacts.");
  }

  return {
    renderJobs: (renderJobsResult.data ?? []).map((item) => ({
      id: item.id,
      snapshotId: item.snapshot_id,
      documentFormat: item.document_format,
      status: item.status,
      attemptCount: item.attempt_count,
      lastError: item.last_error,
      outputDocumentId: item.output_document_id,
      updatedAt: item.updated_at,
    })),
    documents: (documentsResult.data ?? []).map((item) => ({
      id: item.id,
      snapshotId: item.snapshot_id,
      documentFormat: item.document_format,
      status: item.status,
      generatedAt: item.generated_at,
    })),
  };
}
