import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ReportCardStatusFilter = "all" | "not_generated" | "generated" | "certified" | "published";

export type ReportCardStatusPageRow = {
  enrolmentId: string;
  learnerId: string;
  name: string;
  admissionNumber: string | null;
  gradeId: string | null;
  grade: string;
  registerClassId: string | null;
  registerClass: string;
  snapshotId: string | null;
  snapshotVersion: number | null;
  templateVersion: string | null;
  reportStatus: Exclude<ReportCardStatusFilter, "all">;
  generatedAt: string | null;
  certifiedAt: string | null;
  pdfReady: boolean;
};

export type ReportCardStatusPage = {
  rows: ReportCardStatusPageRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export async function getReportCardStatusPage(input: {
  schoolId: string;
  academicYear: number;
  termNumber: number;
  query?: string;
  gradeId?: string;
  classId?: string;
  status?: ReportCardStatusFilter;
  page?: number;
  pageSize?: number;
}): Promise<ReportCardStatusPage> {
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(input.pageSize ?? 50)));
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_report_card_status_page", {
    p_school_id: input.schoolId,
    p_academic_year: input.academicYear,
    p_term_number: input.termNumber,
    p_query: input.query?.trim() || null,
    p_grade_id: input.gradeId || null,
    p_class_id: input.classId || null,
    p_report_status: input.status ?? "all",
    p_page: page,
    p_page_size: pageSize,
  });

  if (error) throw new Error("Unable to load report-card status.");

  const rawRows = (data ?? []) as Array<{
    enrolment_id: string;
    learner_id: string;
    first_names: string;
    surname: string;
    admission_number: string | null;
    grade_id: string | null;
    grade_name: string;
    register_class_id: string | null;
    class_name: string;
    snapshot_id: string | null;
    snapshot_version: number | null;
    template_version: string | null;
    report_status: Exclude<ReportCardStatusFilter, "all">;
    generated_at: string | null;
    certified_at: string | null;
    pdf_ready: boolean;
    total_count: number | string;
  }>;

  const totalCount = Number(rawRows[0]?.total_count ?? 0);
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, pageCount);

  if (safePage !== page && totalCount > 0) {
    return getReportCardStatusPage({ ...input, page: safePage, pageSize });
  }

  return {
    rows: rawRows.map((row) => ({
      enrolmentId: row.enrolment_id,
      learnerId: row.learner_id,
      name: `${row.first_names} ${row.surname}`.trim(),
      admissionNumber: row.admission_number,
      gradeId: row.grade_id,
      grade: row.grade_name,
      registerClassId: row.register_class_id,
      registerClass: row.class_name,
      snapshotId: row.snapshot_id,
      snapshotVersion: row.snapshot_version,
      templateVersion: row.template_version,
      reportStatus: row.report_status,
      generatedAt: row.generated_at,
      certifiedAt: row.certified_at,
      pdfReady: Boolean(row.pdf_ready),
    })),
    totalCount,
    page: safePage,
    pageSize,
    pageCount,
  };
}
