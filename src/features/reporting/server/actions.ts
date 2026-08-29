"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ReportCardActionState = { success?: boolean; message?: string };

const generateSchema = z.object({ enrolmentId: z.string().uuid(), termNumber: z.coerce.number().int().min(1).max(6) });
const bulkGenerateSchema = z.object({ enrolmentIds: z.array(z.string().uuid()).min(1).max(5000), termNumber: z.coerce.number().int().min(1).max(6) });
const renderSchema = z.object({ snapshotId: z.string().uuid(), templateKey: z.string().trim().min(1).max(120).default("TERM_REPORT"), templateVersion: z.string().trim().min(1).max(120).default("SCOLAPRO_TERM_REPORT_V1"), documentFormat: z.enum(["pdf", "html"]).default("pdf") });

export async function generateReportCard(_state: ReportCardActionState, formData: FormData): Promise<ReportCardActionState> {
  const parsed = generateSchema.safeParse({ enrolmentId: formData.get("enrolmentId"), termNumber: formData.get("termNumber") });
  if (!parsed.success) return { message: "Choose a learner and valid term." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("build_report_card_snapshot", { p_enrolment_id: parsed.data.enrolmentId, p_term_number: parsed.data.termNumber, p_template_version: "SCOLAPRO_TERM_REPORT_V1" });
  if (error) return { message: error.message.includes("No approved official results") ? "This learner has no approved official results for the selected term yet." : "The report-card snapshot could not be generated." };
  revalidatePath("/reports/report-cards");
  return { success: true, message: "Report-card snapshot generated." };
}

export async function generateReportCardsBulk(_state: ReportCardActionState, formData: FormData): Promise<ReportCardActionState> {
  const parsed = bulkGenerateSchema.safeParse({ enrolmentIds: formData.getAll("enrolmentId"), termNumber: formData.get("termNumber") });
  if (!parsed.success) return { message: "Choose at least one learner and a valid term." };

  const supabase = await createSupabaseServerClient();
  let generated = 0;
  let unavailable = 0;

  for (const enrolmentId of parsed.data.enrolmentIds) {
    const { error } = await supabase.rpc("build_report_card_snapshot", {
      p_enrolment_id: enrolmentId,
      p_term_number: parsed.data.termNumber,
      p_template_version: "SCOLAPRO_TERM_REPORT_V1",
    });
    if (error) unavailable += 1;
    else generated += 1;
  }

  revalidatePath("/reports/report-cards");
  if (!generated) return { message: `No report cards were generated. ${unavailable} learner${unavailable === 1 ? "" : "s"} may not have approved official results for this term.` };
  return {
    success: true,
    message: `${generated} report card${generated === 1 ? "" : "s"} prepared${unavailable ? `; ${unavailable} skipped because approved results were unavailable` : ""}.`,
  };
}

export async function certifyReportCard(formData: FormData) {
  const snapshotId = String(formData.get("snapshotId") ?? "");
  if (!z.string().uuid().safeParse(snapshotId).success) return;
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("certify_report_card_snapshot", { p_snapshot_id: snapshotId });
  revalidatePath("/reports/report-cards");
}

export async function publishReportCard(formData: FormData) {
  const snapshotId = String(formData.get("snapshotId") ?? "");
  if (!z.string().uuid().safeParse(snapshotId).success) return;
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("publish_report_card_snapshot", { p_snapshot_id: snapshotId });
  revalidatePath("/reports/report-cards");
}

export async function queueReportCardRender(_state: ReportCardActionState, formData: FormData): Promise<ReportCardActionState> {
  const parsed = renderSchema.safeParse({ snapshotId: formData.get("snapshotId"), templateKey: formData.get("templateKey") || "TERM_REPORT", templateVersion: formData.get("templateVersion") || "SCOLAPRO_TERM_REPORT_V1", documentFormat: formData.get("documentFormat") || "pdf" });
  if (!parsed.success) return { message: "The report render request is invalid." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("queue_report_card_render", { p_snapshot_id: parsed.data.snapshotId, p_template_key: parsed.data.templateKey, p_template_version: parsed.data.templateVersion, p_document_format: parsed.data.documentFormat });
  if (error) {
    if (error.message.includes("Only certified historical snapshots")) return { message: "Certify the report-card snapshot before rendering it." };
    return { message: "The report-card render could not be queued." };
  }
  revalidatePath("/reports/report-cards");
  return { success: true, message: "Report-card render queued." };
}
