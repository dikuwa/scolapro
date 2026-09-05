import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ReportCardStatusFilter = "all" | "not_generated" | "generated" | "certified" | "published";
export type ReportCardScopeType = "school" | "grade" | "class";

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

export type ReportCardScopeSummary = {
  scopeType: ReportCardScopeType;
  scopeId: string | null;
  scopeLabel: string;
  total: number;
  notGenerated: number;
  generated: number;
  certified: number;
  published: number;
  pdfReady: number;
};

type ReportCardStatusRpcRow = {
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
};

function mapStatusRow(row: ReportCardStatusRpcRow): ReportCardStatusPageRow {
  return {
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
  };
}

export async function getReportCardStatusForEnrolment(input: {
  schoolId: string;
  academicYear: number;
  termNumber: number;
  enrolmentId: string;
}): Promise<ReportCardStatusPageRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_report_card_status_for_enrolment", {
    p_school_id: input.schoolId,
    p_academic_year: input.academicYear,
    p_term_number: input.termNumber,
    p_enrolment_id: input.enrolmentId,
  });

  if (error) throw new Error("Unable to load the selected learner report-card status.");
  const row = ((data ?? [])[0] ?? null) as ReportCardStatusRpcRow | null;
  return row ? mapStatusRow(row) : null;
}

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

  const rawRows = (data ?? []) as Array<ReportCardStatusRpcRow & { total_count: number | string }>;
  const totalCount = Number(rawRows[0]?.total_count ?? 0);
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, pageCount);

  if (safePage !== page && totalCount > 0) {
    return getReportCardStatusPage({ ...input, page: safePage, pageSize });
  }

  return {
    rows: rawRows.map(mapStatusRow),
    totalCount,
    page: safePage,
    pageSize,
    pageCount,
  };
}

export async function getReportCardScopeSummary(input: {
  schoolId: string;
  academicYear: number;
  termNumber: number;
  scopeType: ReportCardScopeType;
  scopeId?: string | null;
}): Promise<ReportCardScopeSummary> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_report_card_scope_summary", {
    p_school_id: input.schoolId,
    p_academic_year: input.academicYear,
    p_term_number: input.termNumber,
    p_scope_type: input.scopeType,
    p_scope_id: input.scopeType === "school" ? null : input.scopeId ?? null,
  });

  if (error) throw new Error("Unable to load report-card scope summary.");

  const row = (data?.[0] ?? null) as {
    scope_type: ReportCardScopeType;
    scope_id: string | null;
    scope_label: string;
    total_count: number | string;
    not_generated_count: number | string;
    generated_count: number | string;
    certified_count: number | string;
    published_count: number | string;
    pdf_ready_count: number | string;
  } | null;

  if (!row) {
    return {
      scopeType: input.scopeType,
      scopeId: input.scopeType === "school" ? null : input.scopeId ?? null,
      scopeLabel: input.scopeType === "school" ? "Whole school" : "Selected scope",
      total: 0,
      notGenerated: 0,
      generated: 0,
      certified: 0,
      published: 0,
      pdfReady: 0,
    };
  }

  return {
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    scopeLabel: row.scope_label,
    total: Number(row.total_count),
    notGenerated: Number(row.not_generated_count),
    generated: Number(row.generated_count),
    certified: Number(row.certified_count),
    published: Number(row.published_count),
    pdfReady: Number(row.pdf_ready_count),
  };
}
