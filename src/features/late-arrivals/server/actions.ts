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

export async function resolveDetention(formData: FormData) {
  const id = String(formData.get("obligationId") ?? "");
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "");
  if (!z.string().uuid().safeParse(id).success || !["completed", "waived"].includes(status)) return;
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("resolve_late_detention", { p_obligation_id: id, p_status: status, p_note: note || null });
  revalidatePath("/late-arrivals");
}
