"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SchoolDutyActionState = {
  success?: boolean;
  message?: string;
};

const assignSchema = z.object({
  schoolId: z.string().uuid(),
  staffMemberId: z.string().uuid(),
  dutyKey: z.string().trim().min(1).max(80),
  activeFrom: z.iso.date(),
  activeTo: z.union([z.iso.date(), z.literal("")]).optional(),
});

export async function assignSchoolDuty(
  _state: SchoolDutyActionState,
  formData: FormData,
): Promise<SchoolDutyActionState> {
  const parsed = assignSchema.safeParse({
    schoolId: String(formData.get("schoolId") ?? ""),
    staffMemberId: String(formData.get("staffMemberId") ?? ""),
    dutyKey: String(formData.get("dutyKey") ?? ""),
    activeFrom: String(formData.get("activeFrom") ?? ""),
    activeTo: String(formData.get("activeTo") ?? ""),
  });
  if (!parsed.success) return { message: "Choose a staff member, responsibility, and valid dates." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("assign_school_duty", {
    p_school_id: parsed.data.schoolId,
    p_staff_member_id: parsed.data.staffMemberId,
    p_duty_key: parsed.data.dutyKey,
    p_active_from: parsed.data.activeFrom,
    p_active_to: parsed.data.activeTo || null,
  });

  if (error) {
    return {
      message: error.message.includes("overlapping")
        ? "That staff member already has an overlapping assignment for this responsibility."
        : "The responsibility could not be assigned.",
    };
  }

  revalidatePath("/school/responsibilities");
  return { success: true, message: "Responsibility assigned." };
}

const endSchema = z.object({
  assignmentId: z.string().uuid(),
  activeTo: z.iso.date(),
});

export async function endSchoolDuty(
  _state: SchoolDutyActionState,
  formData: FormData,
): Promise<SchoolDutyActionState> {
  const parsed = endSchema.safeParse({
    assignmentId: String(formData.get("assignmentId") ?? ""),
    activeTo: String(formData.get("activeTo") ?? ""),
  });
  if (!parsed.success) return { message: "Choose a valid responsibility and end date." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("end_school_duty", {
    p_assignment_id: parsed.data.assignmentId,
    p_active_to: parsed.data.activeTo,
  });
  if (error) return { message: "The responsibility could not be ended." };

  revalidatePath("/school/responsibilities");
  return { success: true, message: "Responsibility ended." };
}
