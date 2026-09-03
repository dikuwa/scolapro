"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DetentionPlanningActionState = { success?: boolean; message?: string };

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function uuidList(formData: FormData, name: string) {
  return [...new Set(formData.getAll(name).map(String).filter((value) => z.string().uuid().safeParse(value).success))];
}

export async function createPlannedDetentionSession(
  _state: DetentionPlanningActionState,
  formData: FormData,
): Promise<DetentionPlanningActionState> {
  const schoolId = String(formData.get("schoolId") ?? "");
  const sessionDate = String(formData.get("sessionDate") ?? "");
  const startsAt = String(formData.get("startsAt") ?? "").trim();
  const endsAt = String(formData.get("endsAt") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const staffIds = uuidList(formData, "staffMemberIds");

  if (!z.string().uuid().safeParse(schoolId).success || !dateSchema.safeParse(sessionDate).success) {
    return { message: "Choose a valid detention date." };
  }
  if (!staffIds.length) return { message: "Choose at least one staff member for the detention duty team." };

  const supabase = await createSupabaseServerClient();
  const { data: sessionId, error } = await supabase.rpc("create_detention_session_plan", {
    p_school_id: schoolId,
    p_session_date: sessionDate,
    p_starts_at: startsAt || null,
    p_ends_at: endsAt || null,
    p_location: location || null,
    p_notes: "Planned from the late-arrival detention duty roster",
    p_staff_member_ids: staffIds,
  });
  if (error || !sessionId) return { message: error?.message ?? "Unable to create the detention session." };

  revalidatePath("/late-arrivals");
  return { success: true, message: "Detention duty session scheduled. Account-linked supervisors were notified." };
}

export async function updateDetentionDutyTeam(
  _state: DetentionPlanningActionState,
  formData: FormData,
): Promise<DetentionPlanningActionState> {
  const sessionId = String(formData.get("sessionId") ?? "");
  const staffIds = uuidList(formData, "staffMemberIds");
  if (!z.string().uuid().safeParse(sessionId).success) return { message: "Detention session is invalid." };
  if (!staffIds.length) return { message: "Keep at least one supervisor on the duty team." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_detention_session_supervisors", {
    p_session_id: sessionId,
    p_staff_member_ids: staffIds,
  });
  if (error) return { message: error.message };

  revalidatePath("/late-arrivals");
  return { success: true, message: "Detention duty team updated." };
}

export async function allocateDetentionLearners(
  _state: DetentionPlanningActionState,
  formData: FormData,
): Promise<DetentionPlanningActionState> {
  const sessionId = String(formData.get("sessionId") ?? "");
  const supervisorStaffMemberId = String(formData.get("supervisorStaffMemberId") ?? "");
  const obligationIds = uuidList(formData, "obligationIds");

  if (!z.string().uuid().safeParse(sessionId).success || !z.string().uuid().safeParse(supervisorStaffMemberId).success) {
    return { message: "Choose a detention session and supervisor." };
  }
  if (!obligationIds.length) return { message: "Select at least one learner from the detention queue." };

  const supabase = await createSupabaseServerClient();
  const { data: count, error } = await supabase.rpc("assign_detention_session_learners", {
    p_session_id: sessionId,
    p_obligation_ids: obligationIds,
    p_supervisor_staff_member_id: supervisorStaffMemberId,
  });
  if (error) return { message: error.message };

  const learnerCount = Number(count ?? obligationIds.length);
  revalidatePath("/late-arrivals");
  return { success: true, message: `${learnerCount} learner${learnerCount === 1 ? "" : "s"} allocated to detention supervision.` };
}
