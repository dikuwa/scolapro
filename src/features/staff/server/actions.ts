"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const singleStaffSchema = z.object({
  schoolId: z.string().uuid(),
  employeeNumber: z.string().trim().min(1, "Employee number is required.").max(80),
  firstName: z.string().trim().min(1, "First name is required.").max(120),
  lastName: z.string().trim().min(1, "Last name is required.").max(120),
  assignmentType: z.enum(["staff", "teacher", "management", "support", "temporary", "other"]),
  positionTitle: z.string().trim().max(160).optional(),
  effectiveFrom: z.string().min(1, "Start date is required."),
});

export type SingleStaffState = {
  success?: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function createSingleStaff(_previous: SingleStaffState, formData: FormData): Promise<SingleStaffState> {
  const parsed = singleStaffSchema.safeParse({
    schoolId: formData.get("schoolId"),
    employeeNumber: formData.get("employeeNumber"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    assignmentType: formData.get("assignmentType") || "staff",
    positionTitle: String(formData.get("positionTitle") ?? ""),
    effectiveFrom: formData.get("effectiveFrom"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const context = await getUserContext();
  const allowed = Boolean(
    context.user && (
      context.platformMemberships.some((item) => item.roleKey === "platform_admin") ||
      context.memberships.some((item) => item.schoolId === parsed.data.schoolId && item.roleKey === "school_admin")
    )
  );
  if (!allowed) return { message: "Only the School Admin can add staff to this school." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_or_assign_school_staff", {
    p_school_id: parsed.data.schoolId,
    p_employee_number: parsed.data.employeeNumber,
    p_first_name: parsed.data.firstName,
    p_last_name: parsed.data.lastName,
    p_assignment_type: parsed.data.assignmentType,
    p_position_title: parsed.data.positionTitle || null,
    p_effective_from: parsed.data.effectiveFrom,
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("different staff identity")) return { fieldErrors: { employeeNumber: ["That employee number already belongs to a different staff member. Check the number or existing staff record."] } };
    if (message.includes("already has a school assignment")) return { fieldErrors: { effectiveFrom: ["This staff member already has a school placement covering that date."] } };
    if (message.includes("later school assignment")) return { fieldErrors: { effectiveFrom: ["A later placement already exists. Choose a non-overlapping start date or manage the existing placement."] } };
    return { message: "The staff member could not be added. Review the details and try again." };
  }

  const result = data as { created_identity?: boolean } | null;
  revalidatePath("/staff");
  revalidatePath("/timetable");
  return {
    success: true,
    message: result?.created_identity ? "Staff member added. You can invite them to ScolaPro separately if they need a login." : "Existing staff identity linked to this school. No login account was created.",
  };
}
