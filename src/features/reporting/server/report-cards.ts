import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ReportCardLearner = {
  enrolmentId: string;
  learnerId: string;
  name: string;
  admissionNumber: string | null;
  gradeId: string | null;
  grade: string;
  registerClassId: string | null;
  registerClass: string;
};

export type ReportCardSnapshotRow = {
  id: string;
  enrolmentId: string;
  learnerId: string;
  termNumber: number;
  snapshotVersion: number;
  templateVersion: string;
  status: string;
  generatedAt: string;
  certifiedAt: string | null;
};

export type ReportCardRenderJobRow = {
  id: string;
  snapshotId: string;
  documentFormat: string;
  status: string;
  attemptCount: number;
  lastError: string | null;
  outputDocumentId: string | null;
  updatedAt: string;
};

export type ReportCardDocumentRow = {
  id: string;
  snapshotId: string;
  documentFormat: string;
  status: string;
  generatedAt: string;
};

export type ReportCardBatchRow = {
  id: string;
  termNumber: number;
  scopeType: "school" | "grade" | "class" | "custom";
  scopeLabel: string;
  operation: "generate" | "certify" | "pdf";
  status: "pending" | "processing" | "completed" | "partial" | "cancelled";
  totalItems: number;
  processedItems: number;
  completedItems: number;
  skippedItems: number;
  failedItems: number;
  createdAt: string;
  completedAt: string | null;
};

export type ReportCardBatchIssueRow = {
  batchId: string;
  enrolmentId: string;
  learnerId: string;
  status: "skipped" | "failed";
  resultCode: string | null;
  message: string | null;
};

function one<T>(value: T[] | T | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

export async function getReportCardWorkspace(schoolId: string, academicYear: number) {
  const supabase = await createSupabaseServerClient();
  const [enrolmentsResult, snapshotsResult, termsResult, renderJobsResult, documentsResult, batchesResult] = await Promise.all([
    supabase
      .from("enrolments")
      .select("id,learner_id,grade_id,register_class_id,admission_number,learners(first_names,surname),grades(display_name),register_classes(display_name)")
      .eq("school_id", schoolId)
      .eq("academic_year", academicYear)
      .eq("status", "current")
      .order("admission_number"),
    supabase
      .from("report_card_snapshots")
      .select("id,enrolment_id,learner_id,term_number,snapshot_version,template_version,status,generated_at,certified_at")
      .eq("school_id", schoolId)
      .eq("academic_year", academicYear)
      .order("generated_at", { ascending: false }),
    supabase
      .from("academic_terms")
      .select("term_number,display_name,academic_years!inner(year)")
      .eq("school_id", schoolId)
      .eq("academic_years.year", academicYear)
      .order("term_number"),
    supabase
      .from("report_card_render_jobs")
      .select("id,snapshot_id,document_format,status,attempt_count,last_error,output_document_id,updated_at")
      .eq("school_id", schoolId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("report_card_documents")
      .select("id,snapshot_id,document_format,status,generated_at")
      .eq("school_id", schoolId)
      .eq("status", "ready")
      .order("generated_at", { ascending: false }),
    supabase
      .from("report_card_batches")
      .select("id,term_number,scope_type,scope_label,operation,status,total_items,processed_items,completed_items,skipped_items,failed_items,created_at,completed_at")
      .eq("school_id", schoolId)
      .eq("academic_year", academicYear)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const error = enrolmentsResult.error || snapshotsResult.error || termsResult.error || renderJobsResult.error || documentsResult.error || batchesResult.error;
  if (error) throw new Error("Unable to load report-card workspace.");

  const { data: batchIssueData, error: batchIssueError } = await supabase
    .from("report_card_batch_items")
    .select("batch_id,enrolment_id,learner_id,status,result_code,message")
    .eq("school_id", schoolId)
    .in("status", ["skipped", "failed"])
    .order("completed_at", { ascending: false })
    .limit(100);
  if (batchIssueError) throw new Error("Unable to load report-card batch outcomes.");

  const learners: ReportCardLearner[] = (enrolmentsResult.data ?? []).map((item) => {
    const learner = one(item.learners);
    return {
      enrolmentId: item.id,
      learnerId: item.learner_id,
      name: learner ? `${learner.first_names} ${learner.surname}` : "Learner",
      admissionNumber: item.admission_number,
      gradeId: item.grade_id,
      grade: one(item.grades)?.display_name ?? "Grade",
      registerClassId: item.register_class_id,
      registerClass: one(item.register_classes)?.display_name ?? "Class",
    };
  });

  const snapshots: ReportCardSnapshotRow[] = (snapshotsResult.data ?? []).map((item) => ({
    id: item.id,
    enrolmentId: item.enrolment_id,
    learnerId: item.learner_id,
    termNumber: item.term_number,
    snapshotVersion: item.snapshot_version,
    templateVersion: item.template_version,
    status: item.status,
    generatedAt: item.generated_at,
    certifiedAt: item.certified_at,
  }));

  const renderJobs: ReportCardRenderJobRow[] = (renderJobsResult.data ?? []).map((item) => ({
    id: item.id,
    snapshotId: item.snapshot_id,
    documentFormat: item.document_format,
    status: item.status,
    attemptCount: item.attempt_count,
    lastError: item.last_error,
    outputDocumentId: item.output_document_id,
    updatedAt: item.updated_at,
  }));

  const documents: ReportCardDocumentRow[] = (documentsResult.data ?? []).map((item) => ({
    id: item.id,
    snapshotId: item.snapshot_id,
    documentFormat: item.document_format,
    status: item.status,
    generatedAt: item.generated_at,
  }));

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
    createdAt: item.created_at,
    completedAt: item.completed_at,
  }));

  const batchIssues: ReportCardBatchIssueRow[] = (batchIssueData ?? []).map((item) => ({
    batchId: item.batch_id,
    enrolmentId: item.enrolment_id,
    learnerId: item.learner_id,
    status: item.status as ReportCardBatchIssueRow["status"],
    resultCode: item.result_code,
    message: item.message,
  }));

  const terms = (termsResult.data ?? []).map((item) => ({ termNumber: item.term_number, name: item.display_name }));
  if (!terms.length) terms.push({ termNumber: 1, name: "Term 1" }, { termNumber: 2, name: "Term 2" }, { termNumber: 3, name: "Term 3" });

  return { learners, snapshots, terms, renderJobs, documents, batches, batchIssues, academicYear };
}
