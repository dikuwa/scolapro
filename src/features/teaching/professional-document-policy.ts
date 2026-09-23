/**
 * Shared policy vocabulary for teacher-owned professional documents (Issue #676).
 *
 * The governed read model, the Server Actions and the client workspace must agree
 * on the same reasons and messages, so they live here instead of being duplicated
 * (and drifting) per layer. This module is deliberately plain: it holds no
 * authority of its own and imports nothing.
 */

/** One bucket per model: the existing private professional-document bucket. */
export const TEACHER_PROFESSIONAL_DOCUMENT_BUCKET = "teacher-professional-documents";

export const TEACHER_PROFESSIONAL_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export const TEACHER_PROFESSIONAL_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
] as const;

export const TEACHER_PROFESSIONAL_DOCUMENT_ACCEPT =
  TEACHER_PROFESSIONAL_DOCUMENT_MIME_TYPES.join(",");

/**
 * Some browsers report an empty `File.type` for office documents. The signed
 * upload ticket requires a supported MIME type, so fall back to the filename
 * extension rather than rejecting a valid selection.
 */
const EXTENSION_MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

export function resolveTeacherProfessionalDocumentMimeType(
  fileName: string,
  declaredType: string | null | undefined,
): string | null {
  const declared = (declaredType ?? "").trim().toLowerCase();
  if ((TEACHER_PROFESSIONAL_DOCUMENT_MIME_TYPES as readonly string[]).includes(declared)) {
    return declared;
  }
  const extension = fileName.includes(".")
    ? fileName.slice(fileName.lastIndexOf(".") + 1).trim().toLowerCase()
    : "";
  return EXTENSION_MIME_TYPES[extension] ?? null;
}

/** Client-side preflight so an unusable selection never reaches the server. */
export function teacherProfessionalDocumentUploadIssue(file: {
  name: string;
  size: number;
  type: string;
}): string | null {
  if (!file.size) return "Choose a professional document to upload.";
  if (!resolveTeacherProfessionalDocumentMimeType(file.name, file.type)) {
    return "Choose a PDF, DOCX, XLSX, PPTX, JPG or PNG file.";
  }
  if (file.size > TEACHER_PROFESSIONAL_DOCUMENT_MAX_BYTES) {
    return "Professional documents must be 10 MB or smaller.";
  }
  return null;
}

/** Shown beside any document the governed lifecycle must retain. */
export const PROFESSIONAL_DOCUMENT_REVIEW_RETENTION_REASON =
  "Retained as HOD review evidence, so it can only be archived.";

export const PROFESSIONAL_DOCUMENT_ARCHIVE_FIRST_MESSAGE =
  "Archive this document before deleting it permanently.";

export const PROFESSIONAL_DOCUMENT_GOVERNED_REFERENCE_MESSAGE =
  "This professional document is referenced by governed records and cannot be permanently deleted.";

export const PROFESSIONAL_DOCUMENT_DELETED_MESSAGE =
  "Professional document permanently deleted with its private file.";

export const PROFESSIONAL_DOCUMENT_ALREADY_DELETED_MESSAGE =
  "This professional document had already been permanently deleted.";

export const PROFESSIONAL_DOCUMENT_STORAGE_CLEANUP_MESSAGE =
  "The private file could not be removed from storage, so nothing was deleted. Try again.";

export const PROFESSIONAL_DOCUMENT_DELETE_UNAVAILABLE_MESSAGE =
  "The professional document could not be permanently deleted.";
