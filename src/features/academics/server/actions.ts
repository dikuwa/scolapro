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
const gradeUpdateSchema = gradeSchema.omit({ schoolId: true, academicYear: true }).extend({ gradeId: z.string().uuid() });

const classSchema = z.object({
  schoolId: z.string().uuid(),
  academicYear: z.coerce.number().int().min(2000).max(2200),
  gradeId: z.string().uuid("Choose a grade."),
  classCode: z.string().trim().min(1, "Class code is required."),
  displayName: z.string().trim().min(1, "Class name is required."),
});

const classUpdateSchema = classSchema.omit({ schoolId: true, academicYear: true }).extend({ classId: z.string().uuid() });

export type AcademicStructureState = { message?: string; success?: boolean; fieldErrors?: Record<string, string[]> };

function normalizeGradeCode(value: string) {
  const code = value.trim().toUpperCase();
  return /^\d+$/.test(code) ? `G${code}` : code;
}
function normalizeCode(value: string) { return value.trim().toUpperCase(); }

async function canManageSchool(schoolId: string) {
  const context = await getUserContext();
  const platformAdmin = context.platformMemberships.some((membership) => membership.roleKey === "platform_admin");
  const schoolAdmin = context.memberships.some((membership) => membership.schoolId === schoolId && membership.roleKey === "school_admin");
  return Boolean(context.user && (platformAdmin || schoolAdmin));
}

async function canManageAnyAcademicStructure() {
  const context = await getUserContext();
  return Boolean(context.user && (context.platformMemberships.some((item) => item.roleKey === "platform_admin") || context.memberships.some((item) => item.roleKey === "school_admin")));
}

export async function saveGrade(_previous: AcademicStructureState, formData: FormData): Promise<AcademicStructureState> {
  const parsed = gradeSchema.safeParse({ schoolId: formData.get("schoolId"), academicYear: formData.get("academicYear"), gradeCode: formData.get("gradeCode"), displayName: formData.get("displayName") });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!(await canManageSchool(parsed.data.schoolId))) return { message: "You do not have permission to configure this school." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("upsert_school_grade", { p_school_id: parsed.data.schoolId, p_academic_year: parsed.data.academicYear, p_grade_code: normalizeGradeCode(parsed.data.gradeCode), p_display_name: parsed.data.displayName });
  if (error) return { message: "The grade could not be saved. Review the information and try again." };
  revalidatePath("/school/setup"); revalidatePath("/");
  return { success: true, message: "Grade saved." };
}

export async function updateGrade(_previous: AcademicStructureState, formData: FormData): Promise<AcademicStructureState> {
  const parsed = gradeUpdateSchema.safeParse({ gradeId: formData.get("gradeId"), gradeCode: formData.get("gradeCode"), displayName: formData.get("displayName") });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!(await canManageAnyAcademicStructure())) return { message: "You do not have permission to update this grade." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_school_grade", { p_grade_id: parsed.data.gradeId, p_grade_code: normalizeGradeCode(parsed.data.gradeCode), p_display_name: parsed.data.displayName });
  if (error) return { message: error.message.includes("duplicate") ? "That grade code is already in use." : "The grade could not be updated." };
  revalidatePath("/school/setup"); revalidatePath("/learners/register"); revalidatePath("/");
  return { success: true, message: "Grade updated." };
}

export async function deleteGrade(formData: FormData): Promise<AcademicStructureState> {
  const gradeId = String(formData.get("gradeId") ?? "");
  if (!z.string().uuid().safeParse(gradeId).success) return { message: "This grade could not be identified." };
  if (!(await canManageAnyAcademicStructure())) return { message: "You do not have permission to delete this grade." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_school_grade", { p_grade_id: gradeId });
  if (error) return { message: error.message.includes("already in use") ? "This grade is already used by classes, enrolments, subjects or progression records and cannot be deleted." : "The grade could not be deleted." };
  revalidatePath("/school/setup"); revalidatePath("/learners/register"); revalidatePath("/");
  return { success: true, message: "Unused grade deleted." };
}

export async function saveRegisterClass(_previous: AcademicStructureState, formData: FormData): Promise<AcademicStructureState> {
  const parsed = classSchema.safeParse({ schoolId: formData.get("schoolId"), academicYear: formData.get("academicYear"), gradeId: formData.get("gradeId"), classCode: formData.get("classCode"), displayName: formData.get("displayName") });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!(await canManageSchool(parsed.data.schoolId))) return { message: "You do not have permission to configure this school." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("upsert_register_class", { p_school_id: parsed.data.schoolId, p_academic_year: parsed.data.academicYear, p_grade_id: parsed.data.gradeId, p_class_code: normalizeCode(parsed.data.classCode), p_display_name: parsed.data.displayName });
  if (error) return { message: "The register class could not be saved. Confirm the grade and academic year." };
  revalidatePath("/school/setup"); revalidatePath("/");
  return { success: true, message: "Register class saved." };
}

export async function updateRegisterClass(_previous: AcademicStructureState, formData: FormData): Promise<AcademicStructureState> {
  const parsed = classUpdateSchema.safeParse({ classId: formData.get("classId"), gradeId: formData.get("gradeId"), classCode: formData.get("classCode"), displayName: formData.get("displayName") });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!(await canManageAnyAcademicStructure())) return { message: "You do not have permission to update this class." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_register_class", { p_class_id: parsed.data.classId, p_grade_id: parsed.data.gradeId, p_class_code: normalizeCode(parsed.data.classCode), p_display_name: parsed.data.displayName });
  if (error) return { message: "The class could not be updated. Check for duplicate codes and try again." };
  revalidatePath("/school/setup"); revalidatePath("/");
  return { success: true, message: "Register class updated." };
}

export async function deleteRegisterClass(formData: FormData): Promise<AcademicStructureState> {
  const classId = String(formData.get("classId") ?? "");
  if (!z.string().uuid().safeParse(classId).success) return { message: "This class could not be identified." };
  if (!(await canManageAnyAcademicStructure())) return { message: "You do not have permission to delete this class." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_register_class", { p_class_id: classId });
  if (error) return { message: error.message.includes("already in use") ? "This class is already used by enrolment, attendance or timetable data and cannot be deleted." : "The class could not be deleted." };
  revalidatePath("/school/setup"); revalidatePath("/");
  return { success: true, message: "Register class deleted." };
}
