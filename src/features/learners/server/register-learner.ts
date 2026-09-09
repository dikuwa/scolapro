"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const registrationSchema = z.object({
  clientOperationId: z.string().uuid(),
  schoolId: z.string().uuid(),
  academicYear: z.coerce.number().int().min(2000).max(2200),
  gradeId: z.string().uuid(),
  registerClassId: z.string().uuid(),
  firstNames: z.string().trim().min(1, "First names are required."),
  surname: z.string().trim().min(1, "Surname is required."),
  preferredName: z.string().trim().optional(),
  dateOfBirth: z.string().optional(),
  sex: z.enum(["female", "male", "other", "unspecified"]),
  admissionNumber: z.string().trim().optional(),
  enrolledFrom: z.string().min(1, "Admission date is required."),
});

const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxPhotoBytes = 5 * 1024 * 1024;

export type LearnerRegistrationState = {
  message?: string;
  fieldErrors?: Record<string, string[]>;
  learnerId?: string;
};

function validatePhoto(photo: FormDataEntryValue | null): string | null {
  if (!(photo instanceof File) || photo.size === 0) return null;
  if (!allowedPhotoTypes.has(photo.type)) return "Use a JPG, PNG or WebP image.";
  if (photo.size > maxPhotoBytes) return "Learner photo must be 5 MB or smaller.";
  return null;
}

function photoExtension(photo: File) {
  return photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
}

export async function registerLearnerRetrySafe(_previousState: LearnerRegistrationState, formData: FormData): Promise<LearnerRegistrationState> {
  const parsed = registrationSchema.safeParse({
    clientOperationId: formData.get("clientOperationId"),
    schoolId: formData.get("schoolId"), academicYear: formData.get("academicYear"), gradeId: formData.get("gradeId"), registerClassId: formData.get("registerClassId"),
    firstNames: formData.get("firstNames"), surname: formData.get("surname"), preferredName: formData.get("preferredName"), dateOfBirth: formData.get("dateOfBirth"),
    sex: formData.get("sex") || "unspecified", admissionNumber: formData.get("admissionNumber"), enrolledFrom: formData.get("enrolledFrom"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const photo = formData.get("photo");
  const photoError = validatePhoto(photo);
  if (photoError) return { fieldErrors: { photo: [photoError] } };

  const context = await getUserContext();
  const membership = context.memberships.find((item) => item.schoolId === parsed.data.schoolId && item.roleKey === "school_admin");
  if (!context.user || !membership) return { message: "You do not have permission to register learners for this school." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_learner_enrolment_idempotent", {
    p_client_operation_id: parsed.data.clientOperationId,
    p_school_id: parsed.data.schoolId,
    p_academic_year: parsed.data.academicYear,
    p_grade_id: parsed.data.gradeId,
    p_register_class_id: parsed.data.registerClassId,
    p_first_names: parsed.data.firstNames,
    p_surname: parsed.data.surname,
    p_preferred_name: parsed.data.preferredName || null,
    p_date_of_birth: parsed.data.dateOfBirth || null,
    p_sex: parsed.data.sex,
    p_admission_number: parsed.data.admissionNumber || null,
    p_enrolled_from: parsed.data.enrolledFrom,
  });

  if (error) {
    const lowerMessage = error.message.toLowerCase();
    if (lowerMessage.includes("admission number is already in use")) return { fieldErrors: { admissionNumber: ["That admission number is already assigned to another learner."] } };
    if (lowerMessage.includes("client operation id was already used with different learner registration data")) {
      return { message: "This registration was changed after a retry. Reload the form and submit it again." };
    }
    console.error("Retry-safe learner registration RPC failed", { schoolId: parsed.data.schoolId, error: error.message, code: error.code });
    return { message: "The learner could not be registered. Review the information and try again." };
  }

  const learnerId = (data as { learner_id?: string } | null)?.learner_id;
  if (!learnerId) return { message: "The learner was registered, but the resulting learner record could not be resolved." };

  if (photo instanceof File && photo.size > 0) {
    const photoPath = `${parsed.data.schoolId}/${learnerId}/${crypto.randomUUID()}.${photoExtension(photo)}`;
    const { error: uploadError } = await supabase.storage.from("learner-photos").upload(photoPath, photo, { contentType: photo.type, upsert: false });
    if (uploadError) {
      console.error("Learner registration photo upload failed", { learnerId, schoolId: parsed.data.schoolId, path: photoPath, error: uploadError.message });
    } else {
      const { error: photoLinkError } = await supabase.rpc("set_learner_photo", { p_learner_id: learnerId, p_school_id: parsed.data.schoolId, p_photo_path: photoPath });
      if (photoLinkError) console.error("Learner registration photo link failed", { learnerId, schoolId: parsed.data.schoolId, path: photoPath, error: photoLinkError.message, code: photoLinkError.code });
    }
  }

  revalidatePath("/learners");
  revalidatePath(`/learners/${learnerId}`);
  return { learnerId };
}
