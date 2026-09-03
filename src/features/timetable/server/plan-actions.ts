"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TimetableActionState } from "@/features/timetable/server/actions";

function finish(message: string): TimetableActionState {
  revalidatePath("/timetable");
  revalidatePath("/school/setup");
  return { success: true, message };
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const isoDate = z.string().refine(isIsoDate, "Choose a valid date.");
const correctionSchema = z.object({
  allocationId: z.string().uuid(),
  activeFrom: isoDate,
  activeTo: z.preprocess((value) => {
    const normalized = String(value ?? "").trim();
    return normalized || undefined;
  }, isoDate.optional()),
}).superRefine((value, context) => {
  if (value.activeTo && value.activeTo < value.activeFrom) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["activeTo"], message: "End date cannot be before the start date." });
  }
});

function correctionError(message: string) {
  if (message.includes("Only planned future teacher allocations can be corrected")) return "This allocation has already started and can no longer be edited as a future plan.";
  if (message.includes("cannot be backdated")) return "A planned handover cannot be moved into the past.";
  if (message.includes("placement") && message.includes("cover")) return "The teacher's school placement does not cover the corrected handover period.";
  if (message.includes("overlapping timetable conflict")) return "Those dates would overlap an existing class, teacher, or room booking. Adjust the handover period first.";
  if (message.includes("cannot precede")) return "The allocation end date cannot be before its start date.";
  if (message.includes("Permission denied")) return "You do not have permission to correct this timetable plan.";
  return "The planned handover could not be corrected. Refresh and try again.";
}

export async function updatePlannedAllocation(_state: TimetableActionState, formData: FormData): Promise<TimetableActionState> {
  const parsed = correctionSchema.safeParse({
    allocationId: formData.get("allocationId"),
    activeFrom: formData.get("activeFrom"),
    activeTo: formData.get("activeTo"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_teacher_allocation_period", {
    p_allocation_id: parsed.data.allocationId,
    p_active_from: parsed.data.activeFrom,
    p_active_to: parsed.data.activeTo ?? null,
  });
  return error ? { message: correctionError(error.message) } : finish("Planned teacher handover updated.");
}

export async function cancelTimetableSlot(_state: TimetableActionState, formData: FormData): Promise<TimetableActionState> {
  const parsed = z.object({ slotId: z.string().uuid() }).safeParse({ slotId: formData.get("slotId") });
  if (!parsed.success) return { message: "This timetable slot could not be identified." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_timetable_slot", { p_slot_id: parsed.data.slotId });
  if (error) {
    if (error.message.includes("Permission denied")) return { message: "You do not have permission to cancel this timetable slot." };
    if (error.message.includes("Only an active timetable slot")) return { message: "This timetable slot is no longer active. Refresh the timetable." };
    return { message: "Timetable slot could not be cancelled. Refresh and try again." };
  }
  return finish("Timetable slot cancelled. Its history was preserved.");
}
