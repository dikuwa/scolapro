"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StaffConfigurationState = { success?: boolean; message?: string; fieldErrors?: Record<string, string[]> };

export async function configureStaffAssignment(_state: StaffConfigurationState, formData: FormData): Promise<StaffConfigurationState> {
  const parsed = z.object({
    assignmentId: z.string().uuid(),
    staffCode: z.string().trim().max(12).regex(/^[A-Za-z0-9_-]*$/, "Use letters, numbers, hyphens or underscores only."),
    defaultRoomId: z.string().uuid().optional().or(z.literal("")),
  }).safeParse({
    assignmentId: formData.get("assignmentId"),
    staffCode: String(formData.get("staffCode") ?? ""),
    defaultRoomId: String(formData.get("defaultRoomId") ?? ""),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors, message: "Check the staff configuration fields." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("configure_staff_school_assignment", {
    p_assignment_id: parsed.data.assignmentId,
    p_staff_code: parsed.data.staffCode || null,
    p_default_room_id: parsed.data.defaultRoomId || null,
  });
  if (error) return { message: error.message.includes("duplicate") ? "That staff code is already used by an active school placement." : error.message };
  revalidatePath("/staff");
  revalidatePath("/timetable");
  return { success: true, message: "Staff code and default room saved." };
}
