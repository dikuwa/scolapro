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

const evidenceTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const maxEvidenceBytes = 5 * 1024 * 1024;

function safeFilename(value: string) {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-100) || "evidence";
}

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

  if (!parsed.success) return { message: "Review the attendance entries and try again." };

  const context = await getUserContext();
  const allowedRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher"]);
  const canRecord = context.platformMemberships.some((item) => item.roleKey === "platform_admin")
    || context.memberships.some((item) => allowedRoles.has(item.roleKey));

  if (!context.user || !canRecord) return { message: "You do not have permission to record attendance." };

  for (const exception of parsed.data.exceptions) {
    const evidence = formData.get(`evidence-${exception.enrolment_id}`);
    if (!(evidence instanceof File) || evidence.size === 0) continue;
    if (!evidenceTypes.has(evidence.type)) return { message: `Evidence for one learner must be JPG, PNG, WebP or PDF.` };
    if (evidence.size > maxEvidenceBytes) return { message: "Attendance evidence files must be 5 MB or smaller." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: submissionId, error } = await supabase.rpc("submit_daily_register", {
    p_register_class_id: parsed.data.registerClassId,
    p_attendance_date: parsed.data.attendanceDate,
    p_exceptions: parsed.data.exceptions,
    p_note: null,
    p_client_mutation_id: parsed.data.clientMutationId,
    p_replaces_submission_id: parsed.data.replacesSubmissionId || null,
    p_source: "online",
  });

  if (error || !submissionId) return { message: "The register could not be saved. Confirm the class and learner entries, then try again." };

  const { data: submission } = await supabase
    .from("attendance_register_submissions")
    .select("id,tenant_id,school_id")
    .eq("id", submissionId)
    .single();

  let evidenceFailures = 0;
  if (submission) {
    for (const exception of parsed.data.exceptions) {
      const evidence = formData.get(`evidence-${exception.enrolment_id}`);
      if (!(evidence instanceof File) || evidence.size === 0) continue;

      const path = `${submission.school_id}/${context.user.id}/${crypto.randomUUID()}-${safeFilename(evidence.name)}`;
      const bytes = await evidence.arrayBuffer();
      const { error: uploadError } = await supabase.storage.from("attendance-evidence").upload(path, bytes, {
        contentType: evidence.type,
        upsert: false,
      });

      if (uploadError) {
        evidenceFailures += 1;
        continue;
      }

      const { error: recordError } = await supabase.from("attendance_evidence").insert({
        tenant_id: submission.tenant_id,
        school_id: submission.school_id,
        register_submission_id: submission.id,
        enrolment_id: exception.enrolment_id,
        attendance_date: parsed.data.attendanceDate,
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
    ? { success: true, message: `Attendance saved. ${evidenceFailures} evidence file${evidenceFailures === 1 ? "" : "s"} could not be attached.` }
    : { success: true, message: "Attendance register saved." };
}