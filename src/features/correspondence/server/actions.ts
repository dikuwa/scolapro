"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getLiveSchoolDocumentHeader } from "@/features/documents/server/live-school-document-profile";
import { CORRESPONDENCE_TEMPLATES, templateContent } from "@/features/correspondence/templates";
import { validateCorrespondenceBody } from "@/features/correspondence/rich-text";
import type { CorrespondenceActionResult } from "@/features/correspondence/types";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const managerRoles = new Set(["school_admin", "principal", "deputy_principal"]);
const templateKeys = CORRESPONDENCE_TEMPLATES.map((item) => item.key) as [string, ...string[]];

async function currentManager() {
  const context = await getUserContext();
  if (!context.user || context.platformMemberships.length > 0) return null;
  const membership = context.memberships.find((item) => managerRoles.has(item.roleKey));
  return membership ? { context, membership } : null;
}

const draftSchema = z.object({
  documentId: z.string().uuid(),
  templateKey: z.enum(templateKeys),
  documentDate: z.iso.date(),
  recipient: z.string().trim().max(500),
  attention: z.string().trim().max(500),
  subject: z.string().trim().max(500),
  body: z.string().max(500_000),
  closing: z.string().trim().max(200),
  signatoryName: z.string().trim().max(200),
  signatoryPosition: z.string().trim().max(200),
  includeSignatureBlock: z.boolean(),
  attachments: z.array(z.string().trim().min(1).max(200)).max(20),
});

export async function createCorrespondenceDraft(templateKey: string): Promise<CorrespondenceActionResult> {
  const manager = await currentManager();
  if (!manager) return { success: false, message: "Current-school leadership access is required." };
  const parsedTemplate = z.enum(templateKeys).safeParse(templateKey);
  if (!parsedTemplate.success) return { success: false, message: "Choose a valid correspondence template." };
  const template = CORRESPONDENCE_TEMPLATES.find((item) => item.key === parsedTemplate.data) ?? CORRESPONDENCE_TEMPLATES[0];
  const db = await createSupabaseServerClient();
  const { data, error } = await db.from("correspondence_documents").insert({
    tenant_id: manager.membership.tenantId,
    school_id: manager.membership.schoolId,
    template_key: parsedTemplate.data,
    document_date: new Date().toISOString().slice(0, 10),
    subject: template.subject,
    body: templateContent(parsedTemplate.data as Parameters<typeof templateContent>[0]),
    signatory_name: manager.context.displayName ?? "",
    signatory_position: manager.membership.roleKey.replaceAll("_", " "),
    author_user_id: manager.context.user.id,
  }).select("id").single();
  if (error || !data) return { success: false, message: "The correspondence draft could not be created." };
  revalidatePath("/correspondence");
  return { success: true, message: "Draft created.", documentId: data.id };
}

export async function saveCorrespondenceDraft(input: unknown): Promise<CorrespondenceActionResult> {
  const manager = await currentManager();
  if (!manager) return { success: false, message: "Current-school leadership access is required." };
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Review the highlighted correspondence fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  let rawBody: unknown;
  try { rawBody = JSON.parse(parsed.data.body); } catch { return { success: false, message: "The document body is invalid." }; }
  const body = validateCorrespondenceBody(rawBody);
  if (!body) return { success: false, message: "The document body contains unsupported formatting or is too large." };
  const db = await createSupabaseServerClient();
  const { data, error } = await db.from("correspondence_documents").update({
    template_key: parsed.data.templateKey,
    document_date: parsed.data.documentDate,
    recipient: parsed.data.recipient,
    attention: parsed.data.attention,
    subject: parsed.data.subject,
    body,
    closing: parsed.data.closing,
    signatory_name: parsed.data.signatoryName,
    signatory_position: parsed.data.signatoryPosition,
    include_signature_block: parsed.data.includeSignatureBlock,
    attachments: parsed.data.attachments,
  }).eq("id", parsed.data.documentId).eq("school_id", manager.membership.schoolId).eq("status", "draft").select("id").maybeSingle();
  if (error || !data) return { success: false, message: "The draft could not be saved. It may already be finalized or outside your current school." };
  revalidatePath("/correspondence");
  revalidatePath(`/correspondence/${parsed.data.documentId}`);
  return { success: true, message: "Draft saved.", documentId: data.id };
}

export async function finalizeCorrespondenceDocument(documentId: string): Promise<CorrespondenceActionResult> {
  const manager = await currentManager();
  if (!manager) return { success: false, message: "Current-school leadership access is required." };
  const parsedId = z.string().uuid().safeParse(documentId);
  if (!parsedId.success) return { success: false, message: "This document reference is invalid." };
  const db = await createSupabaseServerClient();
  const [header, schoolResult] = await Promise.all([
    getLiveSchoolDocumentHeader(manager.membership.schoolId, "external_correspondence"),
    db.from("schools").select("id,tenant_id,name,emis_number,town,status").eq("id", manager.membership.schoolId).single(),
  ]);
  if (schoolResult.error || !schoolResult.data) return { success: false, message: "School identity could not be frozen." };
  const { data, error } = await db.rpc("finalize_correspondence_document", {
    p_document_id: parsedId.data,
    p_header_snapshot: header,
    p_school_identity_snapshot: schoolResult.data,
    p_author_snapshot: { userId: manager.context.user.id, displayName: manager.context.displayName ?? "School staff", roleKey: manager.membership.roleKey },
  });
  if (error || !data) return { success: false, message: error?.message.includes("required") ? error.message : "The document could not be finalized." };
  revalidatePath("/correspondence");
  revalidatePath(`/correspondence/${parsedId.data}`);
  return { success: true, message: "Correspondence finalized. Its official record is now immutable.", documentId: parsedId.data };
}

export async function reviseCorrespondenceDocument(documentId: string, reason: string): Promise<CorrespondenceActionResult> {
  const manager = await currentManager();
  if (!manager) return { success: false, message: "Current-school leadership access is required." };
  const parsed = z.object({ documentId: z.string().uuid(), reason: z.string().trim().min(5).max(500) }).safeParse({ documentId, reason });
  if (!parsed.success) return { success: false, message: "Enter a clear revision reason (at least 5 characters)." };
  const db = await createSupabaseServerClient();
  const { data, error } = await db.rpc("revise_correspondence_document", { p_document_id: parsed.data.documentId, p_reason: parsed.data.reason });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row?.id) return { success: false, message: error?.message.includes("already exists") ? error.message : "A revision could not be created." };
  revalidatePath("/correspondence");
  return { success: true, message: "Revision draft created.", documentId: row.id };
}


const finalizedEmailSchema = z.object({
  documentId: z.string().uuid(),
  destination: z.string().trim().email().max(320),
});

export async function emailFinalizedCorrespondence(
  documentId: string,
  destination: string,
): Promise<CorrespondenceActionResult> {
  const manager = await currentManager();
  if (!manager) return { success: false, message: "Current-school leadership access is required." };
  const parsed = finalizedEmailSchema.safeParse({ documentId, destination });
  if (!parsed.success) return { success: false, message: "Enter a valid recipient email address." };

  const db = await createSupabaseServerClient();
  const { data, error } = await db.rpc("queue_finalized_correspondence_email", {
    p_document_id: parsed.data.documentId,
    p_destination: parsed.data.destination,
  });
  if (error || !data) {
    return {
      success: false,
      message: error?.message.includes("finalized")
        ? "Only finalized correspondence can be emailed."
        : "The finalized correspondence could not be queued for email.",
    };
  }

  revalidatePath(`/correspondence/${parsed.data.documentId}`);
  return { success: true, message: "Finalized PDF queued for email delivery.", documentId: parsed.data.documentId };
}

export async function recordFinalizedCorrespondenceShare(
  documentId: string,
  method: "web_share_pdf" | "download_for_whatsapp",
): Promise<CorrespondenceActionResult> {
  const manager = await currentManager();
  if (!manager) return { success: false, message: "Current-school leadership access is required." };
  const parsedId = z.string().uuid().safeParse(documentId);
  if (!parsedId.success) return { success: false, message: "This document reference is invalid." };

  const db = await createSupabaseServerClient();
  const { data, error } = await db.rpc("record_finalized_correspondence_device_share", {
    p_document_id: parsedId.data,
    p_share_method: method,
  });
  if (error || !data) {
    return { success: false, message: "The share action could not be recorded." };
  }
  return { success: true, message: "Share action recorded.", documentId: parsedId.data };
}
