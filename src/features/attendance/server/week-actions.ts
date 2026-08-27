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

const daySchema = z.object({
  date: z.string().date(),
  client_mutation_id: z.string().uuid(),
  replaces_submission_id: z.string().uuid().nullable().optional(),
  exceptions: z.array(exceptionSchema),
});

const weeklySchema = z.object({
  registerClassId: z.string().uuid(),
  days: z.array(daySchema).min(1).max(5),
});

export type WeeklyRegisterState = { success?: boolean; message?: string };

export async function submitWeeklyRegister(_state: WeeklyRegisterState, formData: FormData): Promise<WeeklyRegisterState> {
  let parsedDays: unknown;
  try {
    parsedDays = JSON.parse(String(formData.get("days") ?? "[]"));
  } catch {
    return { message: "The weekly attendance changes could not be read." };
  }

  const parsed = weeklySchema.safeParse({ registerClassId: formData.get("registerClassId"), days: parsedDays });
  if (!parsed.success) return { message: "Review the weekly register and try again." };

  const context = await getUserContext();
  const allowed = new Set(["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher"]);
  const canRecord = context.platformMemberships.some((item) => item.roleKey === "platform_admin") || context.memberships.some((item) => allowed.has(item.roleKey));
  if (!context.user || !canRecord) return { message: "You do not have permission to record attendance." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_weekly_register", {
    p_register_class_id: parsed.data.registerClassId,
    p_days: parsed.data.days,
    p_source: "online",
  });

  if (error) return { message: "The weekly register could not be saved. Confirm the class and school days, then try again." };

  revalidatePath("/attendance");
  revalidatePath("/");
  return { success: true, message: "Weekly register saved." };
}
