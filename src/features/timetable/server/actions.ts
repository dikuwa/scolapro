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
  return { success: true, message };
}

export async function saveSubject(_state: TimetableActionState, formData: FormData): Promise<TimetableActionState> {
  const schema = z.object({ schoolId: z.string().uuid(), code: z.string().trim().min(1), name: z.string().trim().min(1) });
  const parsed = schema.safeParse({ schoolId: formData.get("schoolId"), code: formData.get("code"), name: formData.get("name") });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!(await canManageSchool(parsed.data.schoolId))) return { message: "You do not have permission to manage this timetable." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("upsert_school_subject", { p_school_id: parsed.data.schoolId, p_subject_code: parsed.data.code.toUpperCase(), p_display_name: parsed.data.name });
  return error ? { message: "Subject could not be saved." } : finish("Subject saved.");
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
  const schema = z.object({ schoolId: z.string().uuid(), academicYear: z.coerce.number().int(), offeringId: z.string().uuid(), classId: z.string().uuid(), staffId: z.string().uuid() });
  const parsed = schema.safeParse({ schoolId: formData.get("schoolId"), academicYear: formData.get("academicYear"), offeringId: formData.get("offeringId"), classId: formData.get("classId"), staffId: formData.get("staffId") });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!(await canManageSchool(parsed.data.schoolId))) return { message: "You do not have permission to manage this timetable." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_teacher_allocation", { p_school_id: parsed.data.schoolId, p_academic_year: parsed.data.academicYear, p_subject_offering_id: parsed.data.offeringId, p_register_class_id: parsed.data.classId, p_staff_member_id: parsed.data.staffId });
  return error ? { message: error.message.includes("outside") ? error.message : "Teacher allocation could not be saved." } : finish("Teacher allocation saved.");
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
    schoolId: z.string().uuid(),
    academicYear: z.coerce.number().int(),
    cycle: z.string().trim().min(1).max(8),
    weekday: z.coerce.number().int().min(1).max(5),
    periodId: z.string().uuid(),
    classId: z.string().uuid(),
    allocationId: z.string().uuid(),
    roomId: z.string().uuid().optional().or(z.literal("")),
  });
  const parsed = schema.safeParse({
    schoolId: formData.get("schoolId"), academicYear: formData.get("academicYear"), cycle: formData.get("cycle"), weekday: formData.get("weekday"), periodId: formData.get("periodId"), classId: formData.get("classId"), allocationId: formData.get("allocationId"), roomId: String(formData.get("roomId") ?? ""),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!(await canManageSchool(parsed.data.schoolId))) return { message: "You do not have permission to manage this timetable." };
  const supabase = await createSupabaseServerClient();
  const { data: slotId, error } = await supabase.rpc("create_timetable_slot", {
    p_school_id: parsed.data.schoolId,
    p_academic_year: parsed.data.academicYear,
    p_cycle_code: parsed.data.cycle.toUpperCase(),
    p_weekday: parsed.data.weekday,
    p_period_id: parsed.data.periodId,
    p_register_class_id: parsed.data.classId,
    p_teacher_allocation_id: parsed.data.allocationId,
    p_room_label: null,
  });
  if (error) return { message: error.message.includes("already booked") ? error.message : "Timetable slot could not be saved." };
  if (parsed.data.roomId && slotId) {
    const { error: roomError } = await supabase.rpc("assign_timetable_slot_room", { p_slot_id: slotId, p_room_id: parsed.data.roomId });
    if (roomError) return { message: roomError.message.includes("already booked") ? roomError.message : "The lesson was scheduled, but its room could not be assigned." };
  }
  return finish("Timetable slot added.");
}
