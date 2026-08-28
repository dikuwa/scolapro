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
const evidenceTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const maxEvidenceBytes = 5 * 1024 * 1024;

function safeFilename(value: string) {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-100) || "evidence";
}

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

  for (const day of parsed.data.days) {
    for (const exception of day.exceptions) {
      const evidence = formData.get(`evidence-${exception.enrolment_id}-${day.date}`);
      if (!(evidence instanceof File) || evidence.size === 0) continue;
      if (!evidenceTypes.has(evidence.type)) return { message: "Attendance evidence must be JPG, PNG, WebP or PDF." };
      if (evidence.size > maxEvidenceBytes) return { message: "Attendance evidence files must be 5 MB or smaller." };
    }
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_weekly_register", {
    p_register_class_id: parsed.data.registerClassId,
    p_days: parsed.data.days,
    p_source: "online",
  });

  if (error) return { message: "The weekly register could not be saved. Confirm the class and school days, then try again." };

  const submissions = Array.isArray(data) ? data as Array<{ date?: string; submission_id?: string }> : [];
  const submissionByDate = new Map(submissions.map((item) => [String(item.date), item.submission_id]));
  let evidenceFailures = 0;

  for (const day of parsed.data.days) {
    const submissionId = submissionByDate.get(day.date);
    if (!submissionId) continue;
    const { data: submission } = await supabase.from("attendance_register_submissions").select("id,tenant_id,school_id").eq("id", submissionId).maybeSingle();
    if (!submission) continue;

    for (const exception of day.exceptions) {
      const evidence = formData.get(`evidence-${exception.enrolment_id}-${day.date}`);
      if (!(evidence instanceof File) || evidence.size === 0) continue;
      const path = `${submission.school_id}/${context.user.id}/${crypto.randomUUID()}-${safeFilename(evidence.name)}`;
      const { error: uploadError } = await supabase.storage.from("attendance-evidence").upload(path, await evidence.arrayBuffer(), { contentType: evidence.type, upsert: false });
      if (uploadError) { evidenceFailures += 1; continue; }
      const { error: recordError } = await supabase.from("attendance_evidence").insert({
        tenant_id: submission.tenant_id,
        school_id: submission.school_id,
        register_submission_id: submission.id,
        enrolment_id: exception.enrolment_id,
        attendance_date: day.date,
        storage_path: path,
        original_filename: evidence.name,
        mime_type: evidence.type,
        file_size: evidence.size,
        uploaded_by_user_id: context.user.id,
      });
      if (recordError) {
        evidenceFailures += 1;
        await supabase.storage.from("attendance-evidence").remove([path]);
      }
    }
  }

  revalidatePath("/attendance");
  revalidatePath("/");
  return evidenceFailures
    ? { success: true, message: `Weekly register saved. ${evidenceFailures} evidence file${evidenceFailures === 1 ? "" : "s"} could not be attached.` }
    : { success: true, message: "Weekly register saved." };
}
