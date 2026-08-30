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
const bulkGenerateSchema = z.object({ enrolmentIds: z.array(z.string().uuid()).min(1).max(5000), termNumber: z.coerce.number().int().min(1).max(6) });
const renderSchema = z.object({ snapshotId: z.string().uuid(), templateKey: z.string().trim().min(1).max(120).default("TERM_REPORT"), templateVersion: z.string().trim().min(1).max(120).default("SCOLAPRO_TERM_REPORT_V1"), documentFormat: z.enum(["html", "pdf"]).default("html") });
const batchSchema = z.object({
  academicYear: z.coerce.number().int().min(2000).max(2200),
  termNumber: z.coerce.number().int().min(1).max(6),
  scopeType: z.enum(["school", "grade", "class", "custom"]),
  scopeLabel: z.string().trim().min(1).max(160),
  operation: z.enum(["generate", "certify", "publish", "pdf"]),
  enrolmentIds: z.array(z.string().uuid()).min(1).max(5000),
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

export async function generateReportCardsBulk(_state: ReportCardActionState, formData: FormData): Promise<ReportCardActionState> {
  if (!(await canManageReportCards())) return { message: "Bulk report-card preparation is restricted to School Administration and school management." };
  const parsed = bulkGenerateSchema.safeParse({ enrolmentIds: formData.getAll("enrolmentId"), termNumber: formData.get("termNumber") });
  if (!parsed.success) return { message: "Choose at least one learner and a valid term." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("build_report_card_snapshots_bulk", {
    p_enrolment_ids: parsed.data.enrolmentIds,
    p_term_number: parsed.data.termNumber,
    p_template_version: "SCOLAPRO_TERM_REPORT_V1",
  });
  if (error) return { message: "The report-card batch could not be prepared." };

  const result = (data ?? {}) as { generated?: number; skipped?: number };
  const generated = Number(result.generated ?? 0);
  const skipped = Number(result.skipped ?? 0);
  revalidatePath("/reports/report-cards");
  if (!generated) return { message: `No report cards were generated. ${skipped} learner${skipped === 1 ? "" : "s"} may not have approved official results for this term.` };
  return { success: true, message: `${generated} report card${generated === 1 ? "" : "s"} prepared${skipped ? `; ${skipped} skipped because approved results were unavailable` : ""}.` };
}

export async function createReportCardBatch(_state: ReportCardActionState, formData: FormData): Promise<ReportCardActionState> {
  const manager = await getReportManagerContext();
  if (!manager) return { message: "Bulk report-card actions are restricted to School Administration, the Principal and Deputy Principal." };

  const parsed = batchSchema.safeParse({
    academicYear: formData.get("academicYear"),
    termNumber: formData.get("termNumber"),
    scopeType: formData.get("scopeType"),
    scopeLabel: formData.get("scopeLabel"),
    operation: formData.get("operation"),
    enrolmentIds: formData.getAll("enrolmentId"),
  });
  if (!parsed.success) return { message: "Choose a valid report scope, term and at least one learner." };

  const uniqueEnrolmentIds = [...new Set(parsed.data.enrolmentIds)];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_report_card_batch", {
    p_school_id: manager.membership.schoolId,
    p_academic_year: parsed.data.academicYear,
    p_term_number: parsed.data.termNumber,
    p_scope_type: parsed.data.scopeType,
    p_scope_label: parsed.data.scopeLabel,
    p_operation: parsed.data.operation,
    p_enrolment_ids: uniqueEnrolmentIds,
  });
  if (error) return { message: error.message || "The report-card batch could not be created." };

  const batchId = String(data);
  after(kickReportWorkers);
  revalidatePath("/reports/report-cards");
  const operationLabel = parsed.data.operation === "generate"
    ? "Snapshot generation"
    : parsed.data.operation === "certify"
      ? "Certification"
      : parsed.data.operation === "publish"
        ? "Publication"
        : "PDF preparation";
  return { success: true, batchId, message: `${operationLabel} started for ${uniqueEnrolmentIds.length} learner${uniqueEnrolmentIds.length === 1 ? "" : "s"}. Progress is saved even if you leave this page.` };
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
