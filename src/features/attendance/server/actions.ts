"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const exceptionSchema = z.object({
  enrolment_id: z.string().uuid(),
  status: z.enum(["absent", "late", "excused", "unknown"]),
  reason_id: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

const registerSchema = z.object({
  registerClassId: z.string().uuid(),
  attendanceDate: z.string().date(),
  clientMutationId: z.string().uuid(),
  replacesSubmissionId: z.string().uuid().nullable().optional(),
  exceptions: z.array(exceptionSchema),
});

export type DailyRegisterState = {
  message?: string;
  success?: boolean;
};

export async function submitDailyRegister(
  _previousState: DailyRegisterState,
  formData: FormData,
): Promise<DailyRegisterState> {
  let parsedExceptions: unknown = [];
  try {
    parsedExceptions = JSON.parse(String(formData.get("exceptions") ?? "[]"));
  } catch {
    return { message: "The attendance changes could not be read. Refresh and try again." };
  }

  const parsed = registerSchema.safeParse({
    registerClassId: formData.get("registerClassId"),
    attendanceDate: formData.get("attendanceDate"),
    clientMutationId: formData.get("clientMutationId"),
    replacesSubmissionId: formData.get("replacesSubmissionId") || null,
    exceptions: parsedExceptions,
  });

  if (!parsed.success) {
    return { message: "Review the attendance entries and try again." };
  }

  const context = await getUserContext();
  const allowedRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher"]);
  const canRecord = context.platformMemberships.some((item) => item.roleKey === "platform_admin")
    || context.memberships.some((item) => allowedRoles.has(item.roleKey));

  if (!context.user || !canRecord) {
    return { message: "You do not have permission to record attendance." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_daily_register", {
    p_register_class_id: parsed.data.registerClassId,
    p_attendance_date: parsed.data.attendanceDate,
    p_exceptions: parsed.data.exceptions,
    p_note: null,
    p_client_mutation_id: parsed.data.clientMutationId,
    p_replaces_submission_id: parsed.data.replacesSubmissionId || null,
    p_source: "online",
  });

  if (error) {
    return { message: "The register could not be saved. Confirm the class and learner entries, then try again." };
  }

  revalidatePath("/attendance");
  revalidatePath("/");
  return { success: true, message: "Attendance register saved." };
}
