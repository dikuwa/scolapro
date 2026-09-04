"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { processReportCardBatchExportQueue } from "@/features/reporting/server/process-report-card-batch-export-queue";
import { processReportCardBatchQueue } from "@/features/reporting/server/process-report-card-batch-queue";
import { processReportCardRenderQueue } from "@/features/reporting/server/process-report-card-render-queue";

export type ReportCardActionState = { success?: boolean; message?: string; batchId?: string };

const reportManagerRoles = new Set(["school_admin", "principal", "deputy_principal"]);
const generateSchema = z.object({ enrolmentId: z.string().uuid(), termNumber: z.coerce.number().int().min(1).max(6) });
const renderSchema = z.object({ snapshotId: z.string().uuid(), templateKey: z.string().trim().min(1).max(120).default("TERM_REPORT"), templateVersion: z.string().trim().min(1).max(120).default("SCOLAPRO_TERM_REPORT_V1"), documentFormat: z.enum(["html", "pdf"]).default("html") });
const batchSchema = z.object({
  academicYear: z.coerce.number().int().min(2000).max(2200),
  termNumber: z.coerce.number().int().min(1).max(6),
  scopeType: z.enum(["school", "grade", "class", "custom"]),
  scopeId: z.string().uuid().optional(),
  scopeLabel: z.string().trim().min(1).max(160),
  operation: z.enum(["generate", "certify", "publish", "pdf"]),
  enrolmentIds: z.array(z.string().uuid()).max(5000),
});

async function getReportManagerContext() {
  const context = await getUserContext();
  if (!context.user) return null;
  const membership = context.memberships.find((item) => reportManagerRoles.has(item.roleKey));
  if (!membership) return null;
  return { context, membership };
}

async function canManageReportCards() {
  return Boolean(await getReportManagerContext());
}

async function kickReportWorkers() {
  try {
    for (let pass = 0; pass < 8; pass += 1) {
      const batch = await processReportCardBatchQueue(100);
      if (batch.processed === 0 || batch.pendingBatches === 0) break;
    }
    await processReportCardRenderQueue(20);
    await processReportCardBatchExportQueue(1);
  } catch (workerError) {
    console.error("immediate report-card worker kick failed", workerError);
  }
}

export async function generateReportCard(_state: ReportCardActionState, formData: FormData): Promise<ReportCardActionState> {
  if (!(await canManageReportCards())) return { message: "Report-card generation is restricted to School Administration and school management." };
  const parsed = generateSchema.safeParse({ enrolmentId: formData.get("enrolmentId"), termNumber: formData.get("termNumber") });
  if (!parsed.success) return { message: "Choose a learner and valid term." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("build_report_card_snapshot", { p_enrolment_id: parsed.data.enrolmentId, p_term_number: parsed.data.termNumber, p_template_version: "SCOLAPRO_TERM_REPORT_V1" });
  if (error) return { message: error.message.includes("No approved official results") ? "This learner has no approved official results for the selected term yet." : "The report-card snapshot could not be generated." };
  revalidatePath("/reports/report-cards");
  return { success: true, message: "Report-card snapshot generated." };
}

export async function createReportCardBatch(_state: ReportCardActionState, formData: FormData): Promise<ReportCardActionState> {
  const manager = await getReportManagerContext();
  if (!manager) return { message: "Bulk report-card actions are restricted to School Administration, the Principal and Deputy Principal." };

  const rawScopeId = String(formData.get("scopeId") ?? "").trim();
  const parsed = batchSchema.safeParse({
    academicYear: formData.get("academicYear"),
    termNumber: formData.get("termNumber"),
    scopeType: formData.get("scopeType"),
    scopeId: rawScopeId || undefined,
    scopeLabel: formData.get("scopeLabel"),
    operation: formData.get("operation"),
    enrolmentIds: formData.getAll("enrolmentId"),
  });
  if (!parsed.success) return { message: "Choose a valid report scope and term." };

  const uniqueEnrolmentIds = [...new Set(parsed.data.enrolmentIds)];
  const supabase = await createSupabaseServerClient();
  let batchId: string | null = null;
  let affectedCount = uniqueEnrolmentIds.length;

  if (parsed.data.scopeType === "custom") {
    if (uniqueEnrolmentIds.length === 0) return { message: "Choose at least one learner for a custom report scope." };
    const { data, error } = await supabase.rpc("create_report_card_batch", {
      p_school_id: manager.membership.schoolId,
      p_academic_year: parsed.data.academicYear,
      p_term_number: parsed.data.termNumber,
      p_scope_type: "custom",
      p_scope_label: parsed.data.scopeLabel,
      p_operation: parsed.data.operation,
      p_enrolment_ids: uniqueEnrolmentIds,
    });
    if (error) return { message: error.message || "The report-card batch could not be created." };
    batchId = String(data);
  } else {
    if ((parsed.data.scopeType === "grade" || parsed.data.scopeType === "class") && !parsed.data.scopeId) {
      return { message: "Choose a valid grade or class report scope." };
    }

    const { data, error } = await supabase.rpc("create_report_card_batch_for_scope", {
      p_school_id: manager.membership.schoolId,
      p_academic_year: parsed.data.academicYear,
      p_term_number: parsed.data.termNumber,
      p_scope_type: parsed.data.scopeType,
      p_scope_id: parsed.data.scopeType === "school" ? null : parsed.data.scopeId ?? null,
      p_operation: parsed.data.operation,
    });
    if (error) return { message: error.message || "The report-card batch could not be created." };
    batchId = String(data);

    const { data: batch } = await supabase
      .from("report_card_batches")
      .select("total_items")
      .eq("id", batchId)
      .eq("school_id", manager.membership.schoolId)
      .single();
    affectedCount = Number(batch?.total_items ?? 0);
  }

  after(kickReportWorkers);
  revalidatePath("/reports/report-cards");
  const operationLabel = parsed.data.operation === "generate"
    ? "Snapshot generation"
    : parsed.data.operation === "certify"
      ? "Certification"
      : parsed.data.operation === "publish"
        ? "Publication"
        : "PDF preparation";
  return { success: true, batchId: batchId ?? undefined, message: `${operationLabel} started for ${affectedCount} learner${affectedCount === 1 ? "" : "s"}. Progress is saved even if you leave this page.` };
}

export async function certifyReportCard(formData: FormData) {
  if (!(await canManageReportCards())) return;
  const snapshotId = String(formData.get("snapshotId") ?? "");
  if (!z.string().uuid().safeParse(snapshotId).success) return;
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("certify_report_card_snapshot", { p_snapshot_id: snapshotId });
  revalidatePath("/reports/report-cards");
}

export async function publishReportCard(formData: FormData) {
  if (!(await canManageReportCards())) return;
  const snapshotId = String(formData.get("snapshotId") ?? "");
  if (!z.string().uuid().safeParse(snapshotId).success) return;
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("publish_report_card_snapshot", { p_snapshot_id: snapshotId });
  revalidatePath("/reports/report-cards");
}

export async function queueReportCardRender(_state: ReportCardActionState, formData: FormData): Promise<ReportCardActionState> {
  if (!(await canManageReportCards())) return { message: "Report-card rendering and printing are restricted to School Administration and school management." };
  const parsed = renderSchema.safeParse({ snapshotId: formData.get("snapshotId"), templateKey: formData.get("templateKey") || "TERM_REPORT", templateVersion: formData.get("templateVersion") || "SCOLAPRO_TERM_REPORT_V1", documentFormat: formData.get("documentFormat") || "html" });
  if (!parsed.success) return { message: "Choose a supported report-card document format." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("queue_report_card_render", { p_snapshot_id: parsed.data.snapshotId, p_template_key: parsed.data.templateKey, p_template_version: parsed.data.templateVersion, p_document_format: parsed.data.documentFormat });
  if (error) {
    if (error.message.includes("Only certified historical snapshots")) return { message: "Certify the report-card snapshot before rendering it." };
    return { message: "The report-card render could not be queued." };
  }

  after(async () => {
    try {
      await processReportCardRenderQueue(10);
      await processReportCardBatchExportQueue(1);
    } catch (workerError) {
      console.error("immediate report-card render kick failed", workerError);
    }
  });

  revalidatePath("/reports/report-cards");
  return { success: true, message: `${parsed.data.documentFormat === "pdf" ? "PDF" : "Digital"} report queued and rendering will start automatically.` };
}
