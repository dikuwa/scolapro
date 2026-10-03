"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAcademicSchedulePayload, ACADEMIC_SCHEDULE_TYPES } from "@/features/reporting/server/academic-schedules";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getLiveSchoolDocumentHeader } from "@/features/documents/server/live-school-document-profile";

export type AcademicScheduleActionState = { success?: boolean; message?: string; snapshotId?: string };

const schema = z.object({
  academicYear: z.coerce.number().int().min(2000).max(2200),
  termNumber: z.coerce.number().int().min(1).max(6),
  scheduleType: z.enum(ACADEMIC_SCHEDULE_TYPES),
  basis: z.literal("official"),
  supersessionReason: z.string().trim().max(1000).optional(),
});

export async function finalizeAcademicSchedule(
  _state: AcademicScheduleActionState,
  formData: FormData,
): Promise<AcademicScheduleActionState> {
  const parsed = schema.safeParse({
    academicYear: formData.get("academicYear"),
    termNumber: formData.get("termNumber"),
    scheduleType: formData.get("scheduleType"),
    basis: formData.get("basis"),
    supersessionReason: String(formData.get("supersessionReason") ?? ""),
  });
  if (!parsed.success) return { message: "Choose a valid official schedule, year and term." };

  const context = await getUserContext();
  const membership = context.currentSchoolMembership;
  if (!context.user || !membership || !["school_admin","principal","deputy_principal"].includes(membership.roleKey)) {
    return { message: "Official academic schedule finalization is restricted to school management." };
  }

  try {
    const payload = await getAcademicSchedulePayload(parsed.data);
    if (!payload) return { message: "Unable to build this schedule from canonical academic data." };

    const [db, documentHeader] = await Promise.all([
      Promise.resolve(createSupabaseAdminClient()),
      getLiveSchoolDocumentHeader(membership.schoolId,"internal_school"),
    ]);
    const { data, error } = await db.rpc("finalize_academic_schedule_snapshot", {
      p_school_id: membership.schoolId,
      p_academic_year: parsed.data.academicYear,
      p_term_number: parsed.data.termNumber,
      p_schedule_type: parsed.data.scheduleType,
      p_basis: "official",
      p_title: payload.title,
      p_payload: payload,
      p_metadata: {
        sourceDescription: payload.sourceDescription,
        rowCount: payload.rowCount,
        generatedAt: payload.generatedAt,
        templateFidelity: "pending_official_sample",
        documentHeader,
      },
      p_supersession_reason: parsed.data.supersessionReason || null,
      p_actor_user_id: context.user.id,
    });
    if (error) return { message: error.message || "Unable to finalize the academic schedule." };
    revalidatePath("/reports/academic-schedules");
    return { success:true, snapshotId:String(data), message:"Official schedule finalized and version history preserved." };
  } catch {
    return { message: "Unable to finalize the academic schedule from canonical academic data." };
  }
}
