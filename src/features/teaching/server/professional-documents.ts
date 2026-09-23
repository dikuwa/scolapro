"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PROFESSIONAL_DOCUMENT_ALREADY_DELETED_MESSAGE,
  PROFESSIONAL_DOCUMENT_ARCHIVE_FIRST_MESSAGE,
  PROFESSIONAL_DOCUMENT_DELETED_MESSAGE,
  PROFESSIONAL_DOCUMENT_DELETE_UNAVAILABLE_MESSAGE,
  PROFESSIONAL_DOCUMENT_GOVERNED_REFERENCE_MESSAGE,
  PROFESSIONAL_DOCUMENT_REVIEW_RETENTION_REASON,
  PROFESSIONAL_DOCUMENT_STORAGE_CLEANUP_MESSAGE,
  TEACHER_PROFESSIONAL_DOCUMENT_BUCKET,
  TEACHER_PROFESSIONAL_DOCUMENT_MAX_BYTES,
  TEACHER_PROFESSIONAL_DOCUMENT_MIME_TYPES,
} from "@/features/teaching/professional-document-policy";

const mimeTypeSchema = z.enum(TEACHER_PROFESSIONAL_DOCUMENT_MIME_TYPES);

const uploadRequestSchema = z.object({
  schoolId: z.string().uuid(),
  staffMemberId: z.string().uuid(),
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: mimeTypeSchema,
  fileSize: z.number().int().positive().max(TEACHER_PROFESSIONAL_DOCUMENT_MAX_BYTES),
});

const finalizeSchema = uploadRequestSchema.extend({
  documentId: z.string().uuid(),
  storagePath: z.string().min(1),
  title: z.string().trim().max(180).optional(),
  categoryLabel: z.string().trim().max(120).optional(),
});

const archiveSchema = z.object({
  documentId: z.string().uuid(),
});

const reviewSubmissionSchema = z.object({
  documentId: z.string().uuid(),
  subjectId: z.string().uuid(),
});


const teacherOwnerRoles = new Set(["teacher", "class_teacher", "hod"]);

export type TeacherDocumentUploadTicket = {
  success: boolean;
  message?: string;
  documentId?: string;
  storagePath?: string;
  token?: string;
  mimeType?: z.infer<typeof mimeTypeSchema>;
};

export type TeacherDocumentMutationResult = {
  success: boolean;
  message: string;
};

function extensionForMime(mimeType: z.infer<typeof mimeTypeSchema>) {
  switch (mimeType) {
    case "application/pdf": return "pdf";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": return "docx";
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": return "xlsx";
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation": return "pptx";
    case "image/png": return "png";
    default: return "jpg";
  }
}

async function actorOwnsTeachingFiles(schoolId: string, staffMemberId: string) {
  const context = await getUserContext();
  if (!context.user || context.platformMemberships.length) return false;
  return context.memberships.some(
    (membership) =>
      membership.schoolId === schoolId &&
      membership.staffMemberId === staffMemberId &&
      teacherOwnerRoles.has(membership.roleKey),
  );
}

export async function prepareTeacherProfessionalDocumentUpload(
  input: {
    schoolId: string;
    staffMemberId: string;
    originalFilename: string;
    mimeType: string;
    fileSize: number;
  },
): Promise<TeacherDocumentUploadTicket> {
  const parsed = uploadRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Choose a PDF, DOCX, XLSX, PPTX, JPG or PNG file up to 10 MB." };
  }
  if (!(await actorOwnsTeachingFiles(parsed.data.schoolId, parsed.data.staffMemberId))) {
    return { success: false, message: "Current teacher ownership is required to upload professional documents." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: allowed, error: authorizationError } = await supabase.rpc(
    "can_prepare_teacher_professional_document_upload",
    {
      p_school_id: parsed.data.schoolId,
      p_staff_member_id: parsed.data.staffMemberId,
    },
  );
  if (authorizationError || !allowed) {
    return { success: false, message: "Your current school placement does not allow this upload." };
  }

  const documentId = crypto.randomUUID();
  const storagePath = `${parsed.data.schoolId}/${parsed.data.staffMemberId}/${documentId}.${extensionForMime(parsed.data.mimeType)}`;

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.storage
      .from(TEACHER_PROFESSIONAL_DOCUMENT_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error || !data?.token) {
      console.error("Teacher professional document signed upload failed", {
        schoolId: parsed.data.schoolId,
        staffMemberId: parsed.data.staffMemberId,
        error: error?.message,
      });
      return { success: false, message: "The professional-document upload service is unavailable." };
    }

    return {
      success: true,
      documentId,
      storagePath,
      token: data.token,
      mimeType: parsed.data.mimeType,
    };
  } catch (error) {
    console.error("Teacher professional document ticket failed", error);
    return { success: false, message: "The professional-document upload service is not configured correctly." };
  }
}

export async function finalizeTeacherProfessionalDocument(
  input: {
    documentId: string;
    schoolId: string;
    staffMemberId: string;
    storagePath: string;
    originalFilename: string;
    mimeType: string;
    fileSize: number;
    title?: string;
    categoryLabel?: string;
  },
): Promise<TeacherDocumentMutationResult> {
  const parsed = finalizeSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "The uploaded document metadata is invalid." };
  if (!(await actorOwnsTeachingFiles(parsed.data.schoolId, parsed.data.staffMemberId))) {
    return { success: false, message: "Current teacher ownership is required to finalize this document." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("register_teacher_professional_document", {
    p_document_id: parsed.data.documentId,
    p_school_id: parsed.data.schoolId,
    p_staff_member_id: parsed.data.staffMemberId,
    p_storage_path: parsed.data.storagePath,
    p_original_filename: parsed.data.originalFilename,
    p_mime_type: parsed.data.mimeType,
    p_file_size: parsed.data.fileSize,
    p_title: parsed.data.title || null,
    p_category_label: parsed.data.categoryLabel || null,
  });

  if (error) {
    console.error("Teacher professional document registration failed", {
      documentId: parsed.data.documentId,
      error: error.message,
    });

    // A retry after an ambiguous failure must not discard a document that was in
    // fact registered, and a genuine failure must not leave an unreferenced
    // teacher file in private storage. Resolve which case this is, then repair.
    const { data: registered } = await supabase
      .from("teacher_professional_documents")
      .select("id")
      .eq("id", parsed.data.documentId)
      .maybeSingle();
    if (registered) {
      revalidatePath("/teaching/files");
      return { success: true, message: "Professional document uploaded." };
    }

    try {
      const { error: cleanupError } = await createSupabaseAdminClient().storage
        .from(TEACHER_PROFESSIONAL_DOCUMENT_BUCKET)
        .remove([parsed.data.storagePath]);
      if (cleanupError) {
        console.error("Teacher professional document orphan cleanup failed", {
          documentId: parsed.data.documentId,
          error: cleanupError.message,
        });
      }
    } catch (cleanupFailure) {
      console.error("Teacher professional document orphan cleanup failed", cleanupFailure);
    }

    return {
      success: false,
      message: "The upload could not be finalized, so the private file was discarded. Try again.",
    };
  }

  revalidatePath("/teaching/files");
  return { success: true, message: "Professional document uploaded." };
}

export async function submitTeacherProfessionalDocumentForReview(
  documentId: string,
  subjectId: string,
): Promise<TeacherDocumentMutationResult> {
  const parsed = reviewSubmissionSchema.safeParse({ documentId, subjectId });
  if (!parsed.success) return { success: false, message: "Choose a valid professional document and review subject." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_teacher_professional_document_for_review", {
    p_document_id: parsed.data.documentId,
    p_subject_id: parsed.data.subjectId,
  });
  if (error) {
    const detail = error.message.toLowerCase();
    if (detail.includes("already awaiting")) return { success: false, message: "This document is already awaiting HOD review." };
    if (detail.includes("reviewed professional")) return { success: false, message: "This document has already completed its review cycle." };
    if (detail.includes("review subject")) return { success: false, message: "Choose one of your current teaching subjects for this review." };
    if (detail.includes("owner authority")) return { success: false, message: "Current teacher ownership is required to submit this document." };
    return { success: false, message: "The professional document could not be submitted for review." };
  }

  revalidatePath("/teaching/files");
  revalidatePath("/teaching/reviews");
  return { success: true, message: "Professional document submitted for HOD review." };
}

const permanentDeleteSchema = z.object({
  documentId: z.string().uuid(),
});

/**
 * Governed permanent deletion (Issue #676), alongside the existing archive
 * lifecycle. Ordering is deliberate: the private binary is removed first and the
 * governed database function refuses to delete metadata while that object still
 * exists, so a reported success can never orphan teacher data in private storage.
 * The database function stays authoritative for authority, for refused review
 * evidence and for the audit record.
 */
export async function permanentlyDeleteTeacherProfessionalDocument(
  documentId: string,
): Promise<TeacherDocumentMutationResult> {
  const parsed = permanentDeleteSchema.safeParse({ documentId });
  if (!parsed.success) return { success: false, message: "The document identifier is invalid." };

  const supabase = await createSupabaseServerClient();

  // Row-Level Security already narrows this read to the actor's own document.
  const { data: document, error: readError } = await supabase
    .from("teacher_professional_documents")
    .select("id,school_id,owner_staff_member_id,storage_path,status")
    .eq("id", parsed.data.documentId)
    .maybeSingle();

  if (readError) {
    console.error("Teacher professional document read failed", {
      documentId: parsed.data.documentId,
      error: readError.message,
    });
    return { success: false, message: PROFESSIONAL_DOCUMENT_DELETE_UNAVAILABLE_MESSAGE };
  }
  if (!document) return { success: true, message: PROFESSIONAL_DOCUMENT_ALREADY_DELETED_MESSAGE };
  if (!(await actorOwnsTeachingFiles(document.school_id, document.owner_staff_member_id))) {
    return { success: false, message: "Current teacher ownership is required to delete this document." };
  }

  // Option B UX gate (Issue #676): active documents are never purged. The UI
  // disables the action while active; the server refuses as defense in depth.
  // Review-submission checks come first for their specific retention message,
  // but an active status is still refused even without review history.
  // Retained review evidence is not deletable; refuse before touching storage.
  const { data: review } = await supabase
    .from("teacher_professional_document_review_submissions")
    .select("id,status")
    .eq("document_id", document.id)
    .maybeSingle();
  if (review) {
    return {
      success: false,
      message: `${PROFESSIONAL_DOCUMENT_REVIEW_RETENTION_REASON} Archive it instead.`,
    };
  }
  if (document.status !== "archived") {
    return { success: false, message: PROFESSIONAL_DOCUMENT_ARCHIVE_FIRST_MESSAGE };
  }

  // Storage is removed first with the trusted server-side service-role
  // client (no authenticated Storage DELETE policy exists by design). The
  // governed RPC then deletes metadata only after the binary is gone, so a
  // failed object removal leaves the record intact for retry. If metadata
  // deletion fails AFTER storage removal, the record is already gone from
  // private storage but no document row was deleted: the RPC failure message
  // tells the teacher the state and the non-sensitive diagnostics below stay
  // free of learner-document content.
  try {
    const { error: removalError } = await createSupabaseAdminClient().storage
      .from(TEACHER_PROFESSIONAL_DOCUMENT_BUCKET)
      .remove([document.storage_path]);
    if (removalError) {
      console.error("Teacher professional document storage removal failed", {
        documentId: document.id,
        error: removalError.message,
      });
      return { success: false, message: PROFESSIONAL_DOCUMENT_STORAGE_CLEANUP_MESSAGE };
    }
  } catch (removalFailure) {
    console.error("Teacher professional document storage removal failed", removalFailure);
    return { success: false, message: PROFESSIONAL_DOCUMENT_STORAGE_CLEANUP_MESSAGE };
  }

  const { error } = await supabase.rpc("permanently_delete_teacher_professional_document", {
    p_document_id: document.id,
  });
  if (error) {
    const detail = error.message.toLowerCase();
    if (detail.includes("not found")) {
      revalidatePath("/teaching/files");
      return { success: true, message: PROFESSIONAL_DOCUMENT_ALREADY_DELETED_MESSAGE };
    }
    if (detail.includes("entered hod review")) {
      return {
        success: false,
        message: `${PROFESSIONAL_DOCUMENT_REVIEW_RETENTION_REASON} Archive it instead.`,
      };
    }
    if (detail.includes("archive this document before")) {
      return { success: false, message: PROFESSIONAL_DOCUMENT_ARCHIVE_FIRST_MESSAGE };
    }
    if (detail.includes("owner authority")) {
      return { success: false, message: "Current teacher ownership is required to delete this document." };
    }
    if (detail.includes("private file must be removed")) {
      return { success: false, message: PROFESSIONAL_DOCUMENT_STORAGE_CLEANUP_MESSAGE };
    }
    // Governed FK references surface as foreign-key violations: the purge is
    // blocked and the metadata row is retained.
    if (detail.includes("foreign key") || detail.includes("violates foreign") || detail.includes("governed records")) {
      return { success: false, message: PROFESSIONAL_DOCUMENT_GOVERNED_REFERENCE_MESSAGE };
    }
    console.error("Teacher professional document permanent deletion failed", {
      documentId: document.id,
      error: error.message,
    });
    return { success: false, message: PROFESSIONAL_DOCUMENT_DELETE_UNAVAILABLE_MESSAGE };
  }

  revalidatePath("/teaching/files");
  return { success: true, message: PROFESSIONAL_DOCUMENT_DELETED_MESSAGE };
}

export async function archiveTeacherProfessionalDocument(
  documentId: string,
): Promise<TeacherDocumentMutationResult> {
  const parsed = archiveSchema.safeParse({ documentId });
  if (!parsed.success) return { success: false, message: "The document identifier is invalid." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("archive_teacher_professional_document", {
    p_document_id: parsed.data.documentId,
  });
  if (error) {
    return { success: false, message: "The professional document could not be archived." };
  }

  revalidatePath("/teaching/files");
  return { success: true, message: "Professional document archived." };
}
