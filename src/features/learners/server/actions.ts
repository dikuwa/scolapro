"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const registrationSchema = z.object({
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
const learnerPhotoPathPattern = /^([0-9a-f-]{36})\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.(jpg|png|webp)$/i;

export type LearnerRegistrationState = {
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export type LearnerProfileState = LearnerRegistrationState & { success?: boolean };

function validatePhoto(photo: FormDataEntryValue | null): string | null {
  if (!(photo instanceof File) || photo.size === 0) return null;
  if (!allowedPhotoTypes.has(photo.type)) return "Use a JPG, PNG or WebP image.";
  if (photo.size > maxPhotoBytes) return "Learner photo must be 5 MB or smaller.";
  return null;
}

function photoExtension(photo: File) {
  return photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
}

export async function registerLearner(_previousState: LearnerRegistrationState, formData: FormData): Promise<LearnerRegistrationState> {
  const parsed = registrationSchema.safeParse({
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
  const { data, error } = await supabase.rpc("create_learner_enrolment", {
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
    if (error.message.toLowerCase().includes("admission number is already in use")) return { fieldErrors: { admissionNumber: ["That admission number is already assigned to another learner."] } };
    return { message: "The learner could not be registered. Review the information and try again." };
  }

  const learnerId = (data as { learner_id?: string } | null)?.learner_id;
  if (learnerId && photo instanceof File && photo.size > 0) {
    const photoPath = `${parsed.data.schoolId}/${learnerId}/${crypto.randomUUID()}.${photoExtension(photo)}`;
    const { error: uploadError } = await supabase.storage.from("learner-photos").upload(photoPath, photo, { contentType: photo.type, upsert: false });
    if (!uploadError) await supabase.rpc("set_learner_photo", { p_learner_id: learnerId, p_school_id: parsed.data.schoolId, p_photo_path: photoPath });
  }

  revalidatePath("/learners");
  if (learnerId) redirect(`/learners/${learnerId}`);
  redirect("/learners");
}

export async function updateLearnerOperationalProfile(_previousState: LearnerProfileState, formData: FormData): Promise<LearnerProfileState> {
  const parsed = z.object({
    learnerId: z.string().uuid(),
    schoolId: z.string().uuid(),
    preferredName: z.string().trim().max(120, "Preferred name is too long.").optional(),
    removePhoto: z.enum(["true", "false"]).default("false"),
  }).safeParse({
    learnerId: formData.get("learnerId"),
    schoolId: formData.get("schoolId"),
    preferredName: String(formData.get("preferredName") ?? ""),
    removePhoto: formData.get("removePhoto") === "true" ? "true" : "false",
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const photo = formData.get("photo");
  const photoError = validatePhoto(photo);
  if (photoError) return { fieldErrors: { photo: [photoError] } };

  const context = await getUserContext();
  const membership = context.memberships.find((item) => item.schoolId === parsed.data.schoolId && item.roleKey === "school_admin");
  if (!context.user || !membership) return { message: "Only the School Admin can edit this learner profile." };

  const supabase = await createSupabaseServerClient();
  const { data: currentLearner } = await supabase.from("learners").select("photo_path").eq("id", parsed.data.learnerId).maybeSingle();
  const oldPhotoPath = currentLearner?.photo_path ?? null;

  const { error: profileError } = await supabase.rpc("update_learner_operational_profile", {
    p_learner_id: parsed.data.learnerId,
    p_school_id: parsed.data.schoolId,
    p_preferred_name: parsed.data.preferredName || null,
  });
  if (profileError) return { message: "The learner profile could not be updated." };

  if (photo instanceof File && photo.size > 0) {
    const photoPath = `${parsed.data.schoolId}/${parsed.data.learnerId}/${crypto.randomUUID()}.${photoExtension(photo)}`;
    const { error: uploadError } = await supabase.storage.from("learner-photos").upload(photoPath, photo, { contentType: photo.type, upsert: false });
    if (uploadError) {
      revalidatePath(`/learners/${parsed.data.learnerId}`);
      return { success: false, message: "Preferred name was saved, but the new photo could not be uploaded. The editor is staying open so you can try the photo again." };
    }
    const { error: photoLinkError } = await supabase.rpc("set_learner_photo", { p_learner_id: parsed.data.learnerId, p_school_id: parsed.data.schoolId, p_photo_path: photoPath });
    if (photoLinkError) {
      await supabase.storage.from("learner-photos").remove([photoPath]);
      revalidatePath(`/learners/${parsed.data.learnerId}`);
      return { success: false, message: "Preferred name was saved, but the new photo could not be linked. The editor is staying open so you can try the photo again." };
    }
    if (oldPhotoPath && oldPhotoPath !== photoPath) await supabase.storage.from("learner-photos").remove([oldPhotoPath]);
  } else if (parsed.data.removePhoto === "true" && oldPhotoPath) {
    const { error: photoClearError } = await supabase.rpc("set_learner_photo", { p_learner_id: parsed.data.learnerId, p_school_id: parsed.data.schoolId, p_photo_path: null });
    if (photoClearError) return { success: false, message: "Profile information was saved, but the photo could not be removed. Try again." };
    await supabase.storage.from("learner-photos").remove([oldPhotoPath]);
  }

  revalidatePath(`/learners/${parsed.data.learnerId}`);
  revalidatePath("/learners");
  return { success: true, message: "Learner profile updated." };
}

export async function saveUploadedLearnerPhoto(learnerId: string, schoolId: string, path: string): Promise<LearnerProfileState> {
  const parsed = z.object({ learnerId: z.string().uuid(), schoolId: z.string().uuid(), path: z.string().min(1) }).safeParse({ learnerId, schoolId, path });
  if (!parsed.success) return { success: false, message: "The uploaded learner photo reference is invalid." };

  const pathMatch = learnerPhotoPathPattern.exec(parsed.data.path);
  if (!pathMatch || pathMatch[1] !== parsed.data.schoolId || pathMatch[2] !== parsed.data.learnerId) {
    return { success: false, message: "The uploaded learner photo path is invalid." };
  }

  const context = await getUserContext();
  const membership = context.memberships.find((item) => item.schoolId === parsed.data.schoolId && item.roleKey === "school_admin");
  if (!context.user || !membership) return { success: false, message: "Only the School Admin can update learner photos." };

  const supabase = await createSupabaseServerClient();
  const { data: currentLearner, error: learnerError } = await supabase
    .from("learners")
    .select("photo_path")
    .eq("id", parsed.data.learnerId)
    .maybeSingle();
  if (learnerError || !currentLearner) return { success: false, message: "The learner could not be loaded." };

  const oldPhotoPath = currentLearner.photo_path ?? null;
  const { error: photoLinkError } = await supabase.rpc("set_learner_photo", {
    p_learner_id: parsed.data.learnerId,
    p_school_id: parsed.data.schoolId,
    p_photo_path: parsed.data.path,
  });
  if (photoLinkError) return { success: false, message: "The new learner photo could not be linked to the learner profile." };

  if (oldPhotoPath && oldPhotoPath !== parsed.data.path) {
    const { error: cleanupError } = await supabase.storage.from("learner-photos").remove([oldPhotoPath]);
    if (cleanupError) console.warn("Previous learner photo cleanup failed", { learnerId: parsed.data.learnerId, error: cleanupError.message });
  }

  revalidatePath(`/learners/${parsed.data.learnerId}`);
  revalidatePath("/learners");
  return { success: true, message: "Learner photo updated." };
}
