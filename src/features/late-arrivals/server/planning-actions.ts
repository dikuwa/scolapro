"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DetentionPlanningActionState = { success?: boolean; message?: string };

export type DetentionScheduleMode = "configured_days" | "manual";

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
  if (error || !sessionId) return { message: "Unable to create the detention session. Check the date, duty team and your school access." };

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
  if (error) return { message: "The detention duty team could not be updated." };

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
  if (error) return { message: "Learners could not be allocated to that detention supervisor." };

  const learnerCount = Number(count ?? obligationIds.length);
  revalidatePath("/late-arrivals");
  return { success: true, message: `${learnerCount} learner${learnerCount === 1 ? "" : "s"} allocated to detention supervision.` };
}

export async function balanceDetentionLearners(
  _state: DetentionPlanningActionState,
  formData: FormData,
): Promise<DetentionPlanningActionState> {
  const sessionId = String(formData.get("sessionId") ?? "");
  const obligationIds = uuidList(formData, "obligationIds");
  const supervisorIds = uuidList(formData, "supervisorStaffMemberIds");

  if (!z.string().uuid().safeParse(sessionId).success) return { message: "Detention session is invalid." };
  if (!obligationIds.length) return { message: "Select at least one learner from the detention queue." };
  if (!supervisorIds.length) return { message: "Keep at least one supervisor on the duty team before balancing learners." };

  const groups = new Map<string, string[]>();
  obligationIds.forEach((obligationId, index) => {
    const supervisorId = supervisorIds[index % supervisorIds.length];
    groups.set(supervisorId, [...(groups.get(supervisorId) ?? []), obligationId]);
  });

  const supabase = await createSupabaseServerClient();
  let allocated = 0;
  for (const [supervisorId, groupedObligations] of groups) {
    const { data: count, error } = await supabase.rpc("assign_detention_session_learners", {
      p_session_id: sessionId,
      p_obligation_ids: groupedObligations,
      p_supervisor_staff_member_id: supervisorId,
    });
    if (error) {
      revalidatePath("/late-arrivals");
      return {
        message: allocated
          ? `${allocated} learner${allocated === 1 ? " was" : "s were"} allocated before balancing stopped. Review the remaining selections and try again.`
          : "Detention learners could not be balanced across the selected duty team.",
      };
    }
    allocated += Number(count ?? groupedObligations.length);
  }

  revalidatePath("/late-arrivals");
  return {
    success: true,
    message: `${allocated} learner${allocated === 1 ? "" : "s"} balanced across ${supervisorIds.length} duty-team member${supervisorIds.length === 1 ? "" : "s"}.`,
  };
}


export async function rescheduleDetentionSession(
  _state: DetentionPlanningActionState,
  formData: FormData,
): Promise<DetentionPlanningActionState> {
  const sessionId = String(formData.get("sessionId") ?? "");
  const sessionDate = String(formData.get("sessionDate") ?? "");
  const startsAt = String(formData.get("startsAt") ?? "").trim();
  const endsAt = String(formData.get("endsAt") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();

  if (!z.string().uuid().safeParse(sessionId).success || !dateSchema.safeParse(sessionDate).success) {
    return { message: "Choose a valid detention session and date." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reschedule_detention_session_plan", {
    p_session_id: sessionId,
    p_session_date: sessionDate,
    p_starts_at: startsAt || null,
    p_ends_at: endsAt || null,
    p_location: location || null,
  });

  if (error) {
    return {
      message:
        error.message.includes("placement") || error.message.includes("assigned")
          ? "The roster cannot move to that date because one or more assigned teachers are not placed at this school then."
          : "The detention session could not be rescheduled. Check the date, learner obligations and your authority.",
    };
  }

  revalidatePath("/late-arrivals");
  revalidatePath("/my-detention-supervision");
  return { success: true, message: "Detention duty session rescheduled. Assigned teachers were notified." };
}


export async function updateDetentionCycleConfiguration(
  _state: DetentionPlanningActionState,
  formData: FormData,
): Promise<DetentionPlanningActionState> {
  const schoolId = String(formData.get("schoolId") ?? "");
  const scheduleMode = String(formData.get("scheduleMode") ?? "");
  const weekdays = [...new Set(
    formData
      .getAll("weekdays")
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 7),
  )].sort((left, right) => left - right);

  if (!z.string().uuid().safeParse(schoolId).success) {
    return { message: "School detention settings are invalid." };
  }
  if (scheduleMode !== "configured_days" && scheduleMode !== "manual") {
    return { message: "Choose a valid detention scheduling mode." };
  }
  if (scheduleMode === "configured_days" && weekdays.length === 0) {
    return { message: "Choose at least one detention day." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_detention_cycle_configuration", {
    p_school_id: schoolId,
    p_schedule_mode: scheduleMode,
    p_weekdays: scheduleMode === "configured_days" ? weekdays : null,
  });

  if (error) {
    return {
      message: error.message.includes("Permission denied")
        ? "Only current-school leadership can change detention scheduling."
        : "Unable to update the detention scheduling configuration.",
    };
  }

  revalidatePath("/late-arrivals");
  return {
    success: true,
    message:
      scheduleMode === "manual"
        ? "Detention scheduling is now manual/ad-hoc."
        : "Detention cycle days updated.",
  };
}
