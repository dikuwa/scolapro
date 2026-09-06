"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function isValidIsoDate(value: string) {
  if (!value) return true;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]);
}

const registrationSchema = z.object({
  schoolId: z.string().uuid(),
  academicYear: z.coerce.number().int().min(2000).max(2200),
  gradeId: z.string().uuid(),
  registerClassId: z.string().uuid(),
  firstNames: z.string().trim().min(1, "First names are required."),
  surname: z.string().trim().min(1, "Surname is required."),
  preferredName: z.string().trim().optional(),
  dateOfBirth: z.string().refine(isValidIsoDate, "Enter a valid date of birth.").refine((value) => !value || value <= new Date().toISOString().slice(0, 10), "Date of birth cannot be in the future.").optional(),
  sex: z.enum(["female", "male", "other", "unspecified"]),
  admissionNumber: z.string().trim().optional(),
  enrolledFrom: z.string().min(1, "Admission date is required."),
});

const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxPhotoBytes = 5 * 1024 * 1024;

export type LearnerRegistrationState = {
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function registerLearner(_previousState: LearnerRegistrationState, formData: FormData): Promise<LearnerRegistrationState> {
  const parsed = registrationSchema.safeParse({
    schoolId: formData.get("schoolId"), academicYear: formData.get("academicYear"), gradeId: formData.get("gradeId"), registerClassId: formData.get("registerClassId"),
    firstNames: formData.get("firstNames"), surname: formData.get("surname"), preferredName: formData.get("preferredName"), dateOfBirth: formData.get("dateOfBirth"),
    sex: formData.get("sex") || "unspecified", admissionNumber: formData.get("admissionNumber"), enrolledFrom: formData.get("enrolledFrom"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    if (!allowedPhotoTypes.has(photo.type)) return { fieldErrors: { photo: ["Use a JPG, PNG or WebP image."] } };
    if (photo.size > maxPhotoBytes) return { fieldErrors: { photo: ["Learner photo must be 5 MB or smaller."] } };
  }

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
    const extension = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
    const photoPath = `${parsed.data.schoolId}/${learnerId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("learner-photos").upload(photoPath, photo, { contentType: photo.type, upsert: false });
    if (!uploadError) await supabase.rpc("set_learner_photo", { p_learner_id: learnerId, p_school_id: parsed.data.schoolId, p_photo_path: photoPath });
  }

  revalidatePath("/learners");
  if (learnerId) redirect(`/learners/${learnerId}`);
  redirect("/learners");
}
