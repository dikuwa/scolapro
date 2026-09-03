"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type TimetableActionState = { success?: boolean; message?: string; fieldErrors?: Record<string, string[]> };

async function canManageSchool(schoolId: string) {
  const context = await getUserContext();
  const platformAdmin = context.platformMemberships.some((item) => item.roleKey === "platform_admin");
  const schoolAdmin = context.memberships.some((item) => item.schoolId === schoolId && item.roleKey === "school_admin");
  return Boolean(context.user && (platformAdmin || schoolAdmin));
}

function finish(message: string): TimetableActionState {
  revalidatePath("/timetable");
  revalidatePath("/school/setup");
  return { success: true, message };
}

const subjectSchema = z.object({
  code: z.string().trim().min(1, "Subject code is required."),
  name: z.string().trim().min(1, "Subject name is required."),
});

function subjectError(message: string) {
  if (message.includes("code is already in use")) return "That subject code is already in use. Choose a unique code.";
  if (message.includes("subject with this name already exists")) return "A subject with that name already exists. Correct the existing subject instead of creating a duplicate.";
  return "Subject could not be saved. Review the code and name and try again.";
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const allocationDateSchema = z.string().refine(isIsoDate, "Choose a valid date.");

const allocationSchema = z.object({
  schoolId: z.string().uuid(),
  academicYear: z.coerce.number().int(),
  offeringId: z.string().uuid(),
  classId: z.string().uuid(),
  staffId: z.string().uuid(),
  activeFrom: allocationDateSchema,
  activeTo: z.preprocess((value) => {
    const normalized = String(value ?? "").trim();
    return normalized || undefined;
  }, allocationDateSchema.optional()),
}).superRefine((value, context) => {
  if (value.activeTo && value.activeTo < value.activeFrom) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["activeTo"], message: "End date cannot be before the start date." });
  }
});

function allocationError(message: string) {
  if (message.includes("Staff member placement does not cover teacher allocation period") || message.includes("Teacher allocation period must be covered by an active staff school placement")) {
    return "The selected teacher is not placed at this school for the full allocation period. Adjust the dates or the teacher's school placement.";
  }
  if (message.includes("Teacher allocation end date cannot precede start date") || message.includes("active-to date cannot precede active-from date")) {
    return "The allocation end date cannot be before its start date.";
  }
  if (message.includes("already exists with a different end date")) {
    return "This teacher allocation already starts on that date with a different end date. Review the existing allocation before saving another.";
  }
  if (message.includes("outside school/year scope") || message.includes("scope mismatch")) {
    return "The selected subject, class, teacher, or school year no longer matches this timetable. Refresh and try again.";
  }
  return "Teacher allocation could not be saved. Review the teacher and effective dates, then try again.";
}

export async function saveSubject(_state: TimetableActionState, formData: FormData): Promise<TimetableActionState> {
  const parsed = subjectSchema.extend({ schoolId: z.string().uuid() }).safeParse({ schoolId: formData.get("schoolId"), code: formData.get("code"), name: formData.get("name") });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!(await canManageSchool(parsed.data.schoolId))) return { message: "You do not have permission to manage this timetable." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("upsert_school_subject", { p_school_id: parsed.data.schoolId, p_subject_code: parsed.data.code.toUpperCase(), p_display_name: parsed.data.name });
  return error ? { message: subjectError(error.message) } : finish("Subject saved.");
}

export async function updateSubject(_state: TimetableActionState, formData: FormData): Promise<TimetableActionState> {
  const parsed = subjectSchema.extend({ subjectId: z.string().uuid() }).safeParse({ subjectId: formData.get("subjectId"), code: formData.get("code"), name: formData.get("name") });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_school_subject", { p_subject_id: parsed.data.subjectId, p_subject_code: parsed.data.code.toUpperCase(), p_display_name: parsed.data.name });
  return error ? { message: subjectError(error.message) } : finish("Subject corrected. Existing timetable and academic links were preserved.");
}

export async function retireSubject(formData: FormData): Promise<TimetableActionState> {
  const subjectId = String(formData.get("subjectId") ?? "");
  if (!z.string().uuid().safeParse(subjectId).success) return { message: "This subject could not be identified." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("retire_school_subject", { p_subject_id: subjectId });
  if (error) return { message: "Subject could not be removed. Refresh and try again." };
  return finish(data === "archived" ? "Subject archived because it is already used by academic records. Existing history was preserved." : "Unused subject deleted.");
}

export async function saveOffering(_state: TimetableActionState, formData: FormData): Promise<TimetableActionState> {
  const schema = z.object({ schoolId: z.string().uuid(), academicYear: z.coerce.number().int(), subjectId: z.string().uuid(), gradeId: z.string().uuid(), periods: z.coerce.number().int().min(1).max(30) });
  const parsed = schema.safeParse({ schoolId: formData.get("schoolId"), academicYear: formData.get("academicYear"), subjectId: formData.get("subjectId"), gradeId: formData.get("gradeId"), periods: formData.get("periods") });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!(await canManageSchool(parsed.data.schoolId))) return { message: "You do not have permission to manage this timetable." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("upsert_subject_offering", { p_school_id: parsed.data.schoolId, p_academic_year: parsed.data.academicYear, p_subject_id: parsed.data.subjectId, p_grade_id: parsed.data.gradeId, p_periods_per_cycle: parsed.data.periods });
  return error ? { message: "Subject offering could not be saved." } : finish("Subject offering saved.");
}

export async function saveAllocation(_state: TimetableActionState, formData: FormData): Promise<TimetableActionState> {
  const parsed = allocationSchema.safeParse({
    schoolId: formData.get("schoolId"),
    academicYear: formData.get("academicYear"),
    offeringId: formData.get("offeringId"),
    classId: formData.get("classId"),
    staffId: formData.get("staffId"),
    activeFrom: formData.get("activeFrom"),
    activeTo: formData.get("activeTo"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!(await canManageSchool(parsed.data.schoolId))) return { message: "You do not have permission to manage this timetable." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_teacher_allocation_period", {
    p_school_id: parsed.data.schoolId,
    p_academic_year: parsed.data.academicYear,
    p_subject_offering_id: parsed.data.offeringId,
    p_register_class_id: parsed.data.classId,
    p_staff_member_id: parsed.data.staffId,
    p_active_from: parsed.data.activeFrom,
    p_active_to: parsed.data.activeTo ?? null,
  });
  return error ? { message: allocationError(error.message) } : finish(parsed.data.activeFrom > new Date().toISOString().slice(0, 10) ? "Future teacher handover scheduled." : "Teacher allocation saved.");
}

export async function savePeriod(_state: TimetableActionState, formData: FormData): Promise<TimetableActionState> {
  const schema = z.object({ schoolId: z.string().uuid(), academicYear: z.coerce.number().int(), number: z.coerce.number().int().min(1).max(30), name: z.string().trim().min(1), startsAt: z.string().optional(), endsAt: z.string().optional() });
  const parsed = schema.safeParse({ schoolId: formData.get("schoolId"), academicYear: formData.get("academicYear"), number: formData.get("number"), name: formData.get("name"), startsAt: String(formData.get("startsAt") ?? ""), endsAt: String(formData.get("endsAt") ?? "") });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!(await canManageSchool(parsed.data.schoolId))) return { message: "You do not have permission to manage this timetable." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("upsert_timetable_period", { p_school_id: parsed.data.schoolId, p_academic_year: parsed.data.academicYear, p_period_number: parsed.data.number, p_display_name: parsed.data.name, p_starts_at: parsed.data.startsAt || null, p_ends_at: parsed.data.endsAt || null, p_is_teaching_period: true });
  return error ? { message: "Timetable period could not be saved." } : finish("Timetable period saved.");
}

export async function saveSlot(_state: TimetableActionState, formData: FormData): Promise<TimetableActionState> {
  const schema = z.object({
    schoolId: z.string().uuid(), academicYear: z.coerce.number().int(), cycle: z.string().trim().min(1).max(8), weekday: z.coerce.number().int().min(1).max(5), periodId: z.string().uuid(), classId: z.string().uuid(), allocationId: z.string().uuid(), roomId: z.string().uuid().optional().or(z.literal("")),
  });
  const parsed = schema.safeParse({ schoolId: formData.get("schoolId"), academicYear: formData.get("academicYear"), cycle: formData.get("cycle"), weekday: formData.get("weekday"), periodId: formData.get("periodId"), classId: formData.get("classId"), allocationId: formData.get("allocationId"), roomId: String(formData.get("roomId") ?? "") });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!(await canManageSchool(parsed.data.schoolId))) return { message: "You do not have permission to manage this timetable." };
  const supabase = await createSupabaseServerClient();
  const { data: slotId, error } = await supabase.rpc("create_timetable_slot", { p_school_id: parsed.data.schoolId, p_academic_year: parsed.data.academicYear, p_cycle_code: parsed.data.cycle.toUpperCase(), p_weekday: parsed.data.weekday, p_period_id: parsed.data.periodId, p_register_class_id: parsed.data.classId, p_teacher_allocation_id: parsed.data.allocationId, p_room_label: null });
  if (error) return { message: error.message.includes("already booked") ? error.message : "Timetable slot could not be saved." };
  if (parsed.data.roomId && slotId) {
    const { error: roomError } = await supabase.rpc("assign_timetable_slot_room", { p_slot_id: slotId, p_room_id: parsed.data.roomId });
    if (roomError) return { message: roomError.message.includes("already booked") ? roomError.message : "The lesson was scheduled, but its room could not be assigned." };
  }
  return finish("Timetable slot added.");
}
