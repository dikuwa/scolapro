"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const gradeSchema = z.object({
  schoolId: z.string().uuid(),
  academicYear: z.coerce.number().int().min(2000).max(2200),
  gradeCode: z.string().trim().min(1, "Grade code is required."),
  displayName: z.string().trim().min(1, "Grade name is required."),
});

const classSchema = z.object({
  schoolId: z.string().uuid(),
  academicYear: z.coerce.number().int().min(2000).max(2200),
  gradeId: z.string().uuid("Choose a grade."),
  classCode: z.string().trim().min(1, "Class code is required."),
  displayName: z.string().trim().min(1, "Class name is required."),
});

export type AcademicStructureState = {
  message?: string;
  success?: boolean;
  fieldErrors?: Record<string, string[]>;
};

async function canManageSchool(schoolId: string) {
  const context = await getUserContext();
  const platformAdmin = context.platformMemberships.some((membership) => membership.roleKey === "platform_admin");
  const schoolAdmin = context.memberships.some((membership) => membership.schoolId === schoolId && membership.roleKey === "school_admin");
  return Boolean(context.user && (platformAdmin || schoolAdmin));
}

export async function saveGrade(_previous: AcademicStructureState, formData: FormData): Promise<AcademicStructureState> {
  const parsed = gradeSchema.safeParse({
    schoolId: formData.get("schoolId"),
    academicYear: formData.get("academicYear"),
    gradeCode: formData.get("gradeCode"),
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!(await canManageSchool(parsed.data.schoolId))) return { message: "You do not have permission to configure this school." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("upsert_school_grade", {
    p_school_id: parsed.data.schoolId,
    p_academic_year: parsed.data.academicYear,
    p_grade_code: parsed.data.gradeCode,
    p_display_name: parsed.data.displayName,
  });
  if (error) return { message: "The grade could not be saved. Review the information and try again." };

  revalidatePath("/school/setup");
  revalidatePath("/");
  return { success: true, message: "Grade saved." };
}

export async function saveRegisterClass(_previous: AcademicStructureState, formData: FormData): Promise<AcademicStructureState> {
  const parsed = classSchema.safeParse({
    schoolId: formData.get("schoolId"),
    academicYear: formData.get("academicYear"),
    gradeId: formData.get("gradeId"),
    classCode: formData.get("classCode"),
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!(await canManageSchool(parsed.data.schoolId))) return { message: "You do not have permission to configure this school." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("upsert_register_class", {
    p_school_id: parsed.data.schoolId,
    p_academic_year: parsed.data.academicYear,
    p_grade_id: parsed.data.gradeId,
    p_class_code: parsed.data.classCode,
    p_display_name: parsed.data.displayName,
  });
  if (error) return { message: "The register class could not be saved. Confirm the grade and academic year." };

  revalidatePath("/school/setup");
  revalidatePath("/");
  return { success: true, message: "Register class saved." };
}
