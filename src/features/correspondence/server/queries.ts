import "server-only";

import { validateCorrespondenceBody } from "@/features/correspondence/rich-text";
import type { CorrespondenceDocument } from "@/features/correspondence/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const fields = "id,tenant_id,school_id,lineage_id,revision_number,revises_document_id,revision_reason,status,template_key,document_date,recipient,attention,subject,body,closing,signatory_name,signatory_position,include_signature_block,attachments,author_user_id,created_at,updated_at,finalized_at,finalized_by_user_id,reference_number,header_snapshot,school_identity_snapshot,author_snapshot";

function mapDocument(row: Record<string, unknown>): CorrespondenceDocument {
  const body = validateCorrespondenceBody(row.body);
  if (!body) throw new Error("Stored correspondence body is invalid.");
  return {
    id: String(row.id), tenantId: String(row.tenant_id), schoolId: String(row.school_id), lineageId: String(row.lineage_id),
    revisionNumber: Number(row.revision_number), revisesDocumentId: row.revises_document_id ? String(row.revises_document_id) : null,
    revisionReason: String(row.revision_reason ?? ""), status: row.status as CorrespondenceDocument["status"],
    templateKey: row.template_key as CorrespondenceDocument["templateKey"], documentDate: String(row.document_date),
    recipient: String(row.recipient ?? ""), attention: String(row.attention ?? ""), subject: String(row.subject ?? ""), body,
    closing: String(row.closing ?? ""), signatoryName: String(row.signatory_name ?? ""), signatoryPosition: String(row.signatory_position ?? ""),
    includeSignatureBlock: Boolean(row.include_signature_block), attachments: Array.isArray(row.attachments) ? row.attachments.map(String) : [],
    authorUserId: String(row.author_user_id), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    finalizedAt: row.finalized_at ? String(row.finalized_at) : null, finalizedByUserId: row.finalized_by_user_id ? String(row.finalized_by_user_id) : null,
    referenceNumber: row.reference_number ? String(row.reference_number) : null,
    headerSnapshot: row.header_snapshot as CorrespondenceDocument["headerSnapshot"],
    schoolIdentitySnapshot: row.school_identity_snapshot as CorrespondenceDocument["schoolIdentitySnapshot"],
    authorSnapshot: row.author_snapshot as CorrespondenceDocument["authorSnapshot"],
  };
}

export async function getCorrespondenceDocuments(schoolId: string): Promise<CorrespondenceDocument[]> {
  const db = await createSupabaseServerClient();
  const { data, error } = await db.from("correspondence_documents").select(fields).eq("school_id", schoolId).order("updated_at", { ascending: false }).limit(100);
  if (error) throw new Error("Unable to load correspondence documents.");
  return (data ?? []).map((row) => mapDocument(row as Record<string, unknown>));
}

export async function getCorrespondenceDocument(documentId: string): Promise<CorrespondenceDocument | null> {
  const db = await createSupabaseServerClient();
  const { data, error } = await db.from("correspondence_documents").select(fields).eq("id", documentId).maybeSingle();
  if (error) throw new Error("Unable to load this correspondence document.");
  return data ? mapDocument(data as Record<string, unknown>) : null;
}
