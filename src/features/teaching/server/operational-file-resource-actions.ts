"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getGovernedAcademicYear } from "@/features/calendar/server/calendar";
import { getTeachingFilesHub } from "@/features/teaching/server/file-queries";
import { getOperationalTeachingFilesWorkspace } from "@/features/teaching/server/operational-files-workspace";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OperationalFileReferenceActionState = {
  success: boolean;
  message: string;
};

const externalReferenceSchema = z.object({
  templateItemId: z.string().uuid(),
  title: z.string().trim().min(1).max(180),
  provider: z.string().trim().min(1).max(120),
  url: z.string().trim().url().refine((value) => value.toLocaleLowerCase().startsWith("https://"), {
    message: "External references must use HTTPS.",
  }),
});

export async function addTeacherOperationalFileExternalReference(
  _state: OperationalFileReferenceActionState,
  formData: FormData,
): Promise<OperationalFileReferenceActionState> {
  const parsed = externalReferenceSchema.safeParse({
    templateItemId: formData.get("templateItemId"),
    title: formData.get("title"),
    provider: formData.get("provider"),
    url: formData.get("url"),
  });
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message || "Enter a valid HTTPS reference and provider.",
    };
  }

  const context = await getUserContext();
  if (!context.user || context.platformMemberships.length) {
    return { success: false, message: "A current school teaching identity is required." };
  }
  const current = context.currentSchoolMembership;
  if (!current) return { success: false, message: "A current school teaching identity is required." };

  const ownerMembership = context.memberships.find(
    (item) =>
      item.schoolId === current.schoolId &&
      item.staffMemberId &&
      ["teacher", "class_teacher", "hod"].includes(item.roleKey),
  );
  if (!ownerMembership?.staffMemberId) {
    return { success: false, message: "A staff-backed teaching identity is required." };
  }

  const academicYear = await getGovernedAcademicYear(current.schoolId);
  const hub = await getTeachingFilesHub({
    schoolId: current.schoolId,
    academicYear,
    staffMemberId: ownerMembership.staffMemberId,
    canOpenLessonPreparations: ["teacher", "class_teacher"].includes(ownerMembership.roleKey),
  });
  const workspace = await getOperationalTeachingFilesWorkspace({
    academicYear,
    effectiveOn: hub.today,
    allocations: hub.allocations,
  });

  const eligibleItem = workspace.allocations
    .flatMap((allocation) => allocation.fileTypes)
    .flatMap((fileType) => fileType.sections)
    .flatMap((section) => section.items)
    .find((item) => item.id === parsed.data.templateItemId);

  if (
    !eligibleItem ||
    !["shared_resource", "external_link"].includes(eligibleItem.resolverType) ||
    eligibleItem.evidence.status !== "missing"
  ) {
    return {
      success: false,
      message: "This operational-file requirement is not eligible for a teacher external reference.",
    };
  }

  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("create_operational_file_resource", {
    p_scope_type: "teacher",
    p_school_id: current.schoolId,
    p_subject_id: null,
    p_owner_staff_member_id: ownerMembership.staffMemberId,
    p_teacher_document_id: null,
    p_title: parsed.data.title,
    p_description: null,
    p_provider: parsed.data.provider,
    p_authority_label: "Teacher-provided reference",
    p_external_url: parsed.data.url,
    p_academic_year: academicYear,
    p_grade_from: null,
    p_grade_to: null,
    p_effective_from: hub.today,
    p_effective_to: null,
    p_template_item_ids: [parsed.data.templateItemId],
  });

  if (error) {
    return {
      success: false,
      message: error.message.toLocaleLowerCase().includes("https")
        ? "External references must use HTTPS."
        : "The external reference could not be saved.",
    };
  }

  revalidatePath("/teaching/files");
  return { success: true, message: "External reference added to this operational-file requirement." };
}


const documentBindingSchema = z.object({
  templateItemId: z.string().uuid(),
  documentId: z.string().uuid(),
});

export async function bindTeacherOperationalFileDocument(
  _state: OperationalFileReferenceActionState,
  formData: FormData,
): Promise<OperationalFileReferenceActionState> {
  const parsed = documentBindingSchema.safeParse({
    templateItemId: formData.get("templateItemId"),
    documentId: formData.get("documentId"),
  });
  if (!parsed.success) {
    return { success: false, message: "Choose a valid professional document." };
  }

  const context = await getUserContext();
  if (!context.user || context.platformMemberships.length) {
    return { success: false, message: "A current school teaching identity is required." };
  }
  const current = context.currentSchoolMembership;
  if (!current) return { success: false, message: "A current school teaching identity is required." };

  const ownerMembership = context.memberships.find(
    (item) =>
      item.schoolId === current.schoolId &&
      item.staffMemberId &&
      ["teacher", "class_teacher", "hod"].includes(item.roleKey),
  );
  if (!ownerMembership?.staffMemberId) {
    return { success: false, message: "A staff-backed teaching identity is required." };
  }

  const academicYear = await getGovernedAcademicYear(current.schoolId);
  const hub = await getTeachingFilesHub({
    schoolId: current.schoolId,
    academicYear,
    staffMemberId: ownerMembership.staffMemberId,
    canOpenLessonPreparations: ["teacher", "class_teacher"].includes(ownerMembership.roleKey),
  });
  const workspace = await getOperationalTeachingFilesWorkspace({
    academicYear,
    effectiveOn: hub.today,
    allocations: hub.allocations,
  });
  const eligibleItem = workspace.allocations
    .flatMap((allocation) => allocation.fileTypes)
    .flatMap((fileType) => fileType.sections)
    .flatMap((section) => section.items)
    .find((item) => item.id === parsed.data.templateItemId);

  if (
    !eligibleItem ||
    eligibleItem.resolverType !== "teacher_document" ||
    eligibleItem.evidence.status !== "missing"
  ) {
    return {
      success: false,
      message: "This operational-file requirement is not eligible for a teacher document binding.",
    };
  }

  const document = hub.professionalDocuments.find((item) => item.id === parsed.data.documentId);
  if (!document || document.status !== "active") {
    return { success: false, message: "That professional document is not available in your current owner scope." };
  }

  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("create_operational_file_resource", {
    p_scope_type: "teacher",
    p_school_id: current.schoolId,
    p_subject_id: null,
    p_owner_staff_member_id: ownerMembership.staffMemberId,
    p_teacher_document_id: document.id,
    p_title: document.title?.trim() || document.originalFilename,
    p_description: null,
    p_provider: "Teacher upload",
    p_authority_label: "Teacher-provided evidence",
    p_external_url: null,
    p_academic_year: academicYear,
    p_grade_from: null,
    p_grade_to: null,
    p_effective_from: hub.today,
    p_effective_to: null,
    p_template_item_ids: [parsed.data.templateItemId],
  });

  if (error) {
    return { success: false, message: "The professional document could not be linked to this requirement." };
  }

  revalidatePath("/teaching/files");
  return { success: true, message: "Professional document linked to this operational-file requirement." };
}
