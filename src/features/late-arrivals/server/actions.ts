"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LateArrivalActionState = { success?: boolean; message?: string };

const recordSchema = z.object({
  enrolmentId: z.string().uuid(),
  arrivalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  arrivedAt: z.string().optional(),
  note: z.string().trim().optional(),
});

export async function recordLateArrival(_state: LateArrivalActionState, formData: FormData): Promise<LateArrivalActionState> {
  const parsed = recordSchema.safeParse({
    enrolmentId: String(formData.get("enrolmentId") ?? ""),
    arrivalDate: String(formData.get("arrivalDate") ?? ""),
    arrivedAt: String(formData.get("arrivedAt") ?? ""),
    note: String(formData.get("note") ?? ""),
  });
  if (!parsed.success) return { message: "Choose a learner and valid arrival date." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_school_late_arrival", {
    p_enrolment_id: parsed.data.enrolmentId,
    p_arrival_date: parsed.data.arrivalDate,
    p_arrived_at: parsed.data.arrivedAt || null,
    p_note: parsed.data.note || null,
  });
  if (error) return { message: error.message };
  revalidatePath("/late-arrivals");
  return { success: true, message: "Late arrival recorded." };
}

export async function undoLatestLateArrival(_state: LateArrivalActionState, formData: FormData): Promise<LateArrivalActionState> {
  const enrolmentId = String(formData.get("enrolmentId") ?? "");
  if (!z.string().uuid().safeParse(enrolmentId).success) return { message: "Choose a learner before undoing a late-arrival entry." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("undo_latest_school_late_arrival", {
    p_enrolment_id: enrolmentId,
    p_reason: "Corrected accidental latest late-arrival entry",
  });
  if (error) return { message: error.message };
  revalidatePath("/late-arrivals");
  revalidatePath("/late-arrivals/history");
  return { success: true, message: "Latest late-arrival entry undone." };
}

export async function resolveDetention(formData: FormData) {
  const id = String(formData.get("obligationId") ?? "");
  if (!z.string().uuid().safeParse(id).success) return;
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("resolve_late_detention", { p_obligation_id: id, p_status: "completed", p_note: null });
  revalidatePath("/late-arrivals");
  revalidatePath("/late-arrivals/history");
}

export async function reassignDetentionSupervisor(formData: FormData) {
  const obligationId = String(formData.get("obligationId") ?? "");
  const staffMemberId = String(formData.get("staffMemberId") ?? "");
  if (!z.string().uuid().safeParse(obligationId).success || !z.string().uuid().safeParse(staffMemberId).success) return;
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("reassign_late_detention_supervisor", {
    p_obligation_id: obligationId,
    p_staff_member_id: staffMemberId,
  });
  revalidatePath("/late-arrivals");
}

export async function setDetentionSupervisionEligibility(formData: FormData) {
  const schoolId = String(formData.get("schoolId") ?? "");
  const staffMemberId = String(formData.get("staffMemberId") ?? "");
  const eligible = String(formData.get("eligible") ?? "") === "true";
  if (!z.string().uuid().safeParse(schoolId).success || !z.string().uuid().safeParse(staffMemberId).success) return;
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("set_detention_supervision_eligibility", {
    p_school_id: schoolId,
    p_staff_member_id: staffMemberId,
    p_eligible: eligible,
  });
  revalidatePath("/late-arrivals");
}
