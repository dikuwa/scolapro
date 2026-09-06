"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TimetableActionState } from "@/features/timetable/server/actions";

async function hasTimetableConfigurationRole(schoolId: string) {
  const context = await getUserContext();
  const platformAdmin = context.platformMemberships.some((item) => item.roleKey === "platform_admin");
  const schoolRole = context.memberships.some((item) => item.schoolId === schoolId && ["school_admin", "principal"].includes(item.roleKey));
  return Boolean(context.user && (platformAdmin || schoolRole));
}

async function canManageTimetableSlots(schoolId: string) {
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

const cycleSchema = z.object({
  schoolId: z.string().uuid(),
  cycleMode: z.enum(["weekday", "rotating"]),
  cycleLength: z.coerce.number().int().min(1).max(10),
}).superRefine((value, context) => {
  if (value.cycleMode === "weekday" && value.cycleLength > 7) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["cycleLength"], message: "A standard weekday timetable cannot exceed 7 days." });
  }
});

export async function saveTimetableCycleSettings(_state: TimetableActionState, formData: FormData): Promise<TimetableActionState> {
  const parsed = cycleSchema.safeParse({
    schoolId: formData.get("schoolId"),
    cycleMode: formData.get("cycleMode"),
    cycleLength: formData.get("cycleLength"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!(await hasTimetableConfigurationRole(parsed.data.schoolId))) return { message: "You do not have permission to change this school's timetable workflow." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_school_timetable_cycle", {
    p_school_id: parsed.data.schoolId,
    p_cycle_mode: parsed.data.cycleMode,
    p_cycle_length: parsed.data.cycleLength,
  });

  if (error) {
    if (error.message.includes("cannot be shortened below Day")) return { message: error.message };
    if (error.message.includes("cannot exceed 7 days")) return { message: "A standard weekday timetable cannot exceed 7 days." };
    return { message: "The timetable workflow could not be updated. Review the cycle mode and length, then try again." };
  }
  return finish(parsed.data.cycleMode === "rotating" ? `Rotating ${parsed.data.cycleLength}-day timetable cycle saved.` : `Standard ${parsed.data.cycleLength}-day timetable week saved.`);
}

const slotSchema = z.object({
  schoolId: z.string().uuid(),
  academicYear: z.coerce.number().int(),
  cycle: z.string().trim().min(1).max(8),
  weekday: z.coerce.number().int().min(1).max(10),
  periodId: z.string().uuid(),
  classId: z.string().uuid(),
  allocationId: z.string().uuid(),
  roomId: z.string().uuid().optional().or(z.literal("")),
});

export async function saveCycleAwareSlot(_state: TimetableActionState, formData: FormData): Promise<TimetableActionState> {
  const parsed = slotSchema.safeParse({
    schoolId: formData.get("schoolId"), academicYear: formData.get("academicYear"), cycle: formData.get("cycle"), weekday: formData.get("weekday"), periodId: formData.get("periodId"), classId: formData.get("classId"), allocationId: formData.get("allocationId"), roomId: String(formData.get("roomId") ?? ""),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!(await canManageTimetableSlots(parsed.data.schoolId))) return { message: "You do not have permission to manage this timetable." };

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
  if (error) {
    if (error.message.includes("outside this school's configured timetable cycle") || error.message.includes("already booked")) return { message: error.message };
    return { message: "Timetable slot could not be saved." };
  }

  if (parsed.data.roomId && slotId) {
    const { error: roomError } = await supabase.rpc("assign_timetable_slot_room", { p_slot_id: slotId, p_room_id: parsed.data.roomId });
    if (roomError) return { message: roomError.message.includes("already booked") ? roomError.message : "The lesson was scheduled, but its room could not be assigned." };
  }
  return finish("Timetable slot added.");
}
