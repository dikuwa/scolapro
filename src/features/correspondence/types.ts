import type { JSONContent } from "@tiptap/core";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import type { CorrespondenceTemplateKey } from "@/features/correspondence/templates";

export type CorrespondenceStatus = "draft" | "finalized";

export type CorrespondenceDocument = {
  id: string;
  tenantId: string;
  schoolId: string;
  lineageId: string;
  revisionNumber: number;
  revisesDocumentId: string | null;
  revisionReason: string;
  status: CorrespondenceStatus;
  templateKey: CorrespondenceTemplateKey;
  documentDate: string;
  recipient: string;
  attention: string;
  subject: string;
  body: JSONContent;
  closing: string;
  signatoryName: string;
  signatoryPosition: string;
  includeSignatureBlock: boolean;
  attachments: string[];
  authorUserId: string;
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
  finalizedByUserId: string | null;
  referenceNumber: string | null;
  headerSnapshot: OfficialDocumentHeaderModel | null;
  schoolIdentitySnapshot: Record<string, unknown> | null;
  authorSnapshot: { userId?: string; displayName?: string } | null;
};

export type CorrespondenceActionResult = {
  success: boolean;
  message: string;
  documentId?: string;
  fieldErrors?: Record<string, string[]>;
};
