"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SubjectAttendanceState = { success?: boolean; message?: string };

const schema = z.object({
  slotId: z.string().uuid(),
  attendanceDate: z.string().min(1),
  clientMutationId: z.string().uuid(),
  replacesSubmissionId: z.string().uuid().nullable(),
  exceptions: z.array(z.object({ enrolment_id: z.string().uuid(), status: z.enum(["absent","late","excused","unknown"]), reason_id: z.string().uuid().nullable(), note: z.string().nullable() })),
});

export async function submitSubjectAttendance(_state: SubjectAttendanceState, formData: FormData): Promise<SubjectAttendanceState> {
  let exceptions: unknown = [];
  try { exceptions = JSON.parse(String(formData.get("exceptions") ?? "[]")); } catch { return { message: "Attendance changes could not be read." }; }
  const rawReplacement = String(formData.get("replacesSubmissionId") ?? "").trim();
  const parsed = schema.safeParse({ slotId: formData.get("slotId"), attendanceDate: formData.get("attendanceDate"), clientMutationId: formData.get("clientMutationId"), replacesSubmissionId: rawReplacement || null, exceptions });
  if (!parsed.success) return { message: "Check the lesson attendance details and try again." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_subject_period_attendance", {
    p_timetable_slot_id: parsed.data.slotId,
    p_attendance_date: parsed.data.attendanceDate,
    p_exceptions: parsed.data.exceptions,
    p_client_mutation_id: parsed.data.clientMutationId,
    p_replaces_submission_id: parsed.data.replacesSubmissionId,
    p_source: "online",
  });
  if (error) return { message: error.message };
  revalidatePath(`/attendance/lesson/${parsed.data.slotId}`);
  return { success: true, message: parsed.data.replacesSubmissionId ? "Lesson attendance revision saved." : "Lesson attendance saved." };
}
