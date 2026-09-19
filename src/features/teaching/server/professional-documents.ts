"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const mimeTypeSchema = z.enum([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
]);

const uploadRequestSchema = z.object({
  schoolId: z.string().uuid(),
  staffMemberId: z.string().uuid(),
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: mimeTypeSchema,
  fileSize: z.number().int().positive().max(10 * 1024 * 1024),
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
      .from("teacher-professional-documents")
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
    return { success: false, message: "The file uploaded, but its governed document record could not be finalized." };
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
