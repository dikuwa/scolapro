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

export type LearnerRegistrationState = {
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function registerLearner(
  _previousState: LearnerRegistrationState,
  formData: FormData,
): Promise<LearnerRegistrationState> {
  const parsed = registrationSchema.safeParse({
    schoolId: formData.get("schoolId"),
    academicYear: formData.get("academicYear"),
    gradeId: formData.get("gradeId"),
    registerClassId: formData.get("registerClassId"),
    firstNames: formData.get("firstNames"),
    surname: formData.get("surname"),
    preferredName: formData.get("preferredName"),
    dateOfBirth: formData.get("dateOfBirth"),
    sex: formData.get("sex") || "unspecified",
    admissionNumber: formData.get("admissionNumber"),
    enrolledFrom: formData.get("enrolledFrom"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const context = await getUserContext();
  const membership = context.memberships.find(
    (item) => item.schoolId === parsed.data.schoolId && item.roleKey === "school_admin",
  );

  if (!context.user || !membership) {
    return { message: "You do not have permission to register learners for this school." };
  }

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
    return { message: "The learner could not be registered. Review the information and try again." };
  }

  const learnerId = (data as { learner_id?: string } | null)?.learner_id;
  revalidatePath("/learners");

  if (learnerId) redirect(`/learners/${learnerId}`);
  redirect("/learners");
}
