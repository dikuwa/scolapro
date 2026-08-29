"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AbsenceActionState = { success?: boolean; message?: string };

const reasonCategories = ["illness", "medical_appointment", "compassionate", "family", "transport", "weather", "school_activity", "other"] as const;

const submitAbsenceSchema = z.object({
  learnerId: z.string().uuid(),
  absenceFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  absenceTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reasonCategory: z.enum(reasonCategories),
  message: z.string().max(2000).optional(),
});

export async function submitAbsenceNotice(_state: AbsenceActionState, formData: FormData): Promise<AbsenceActionState> {
  const parsed = submitAbsenceSchema.safeParse({
    learnerId: formData.get("learnerId"),
    absenceFrom: formData.get("absenceFrom"),
    absenceTo: formData.get("absenceTo"),
    reasonCategory: formData.get("reasonCategory"),
    message: formData.get("message") || undefined,
  });

  if (!parsed.success) return { message: "Please fill in all required fields correctly." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_guardian_absence_notice", {
    p_learner_id: parsed.data.learnerId,
    p_absence_from: parsed.data.absenceFrom,
    p_absence_to: parsed.data.absenceTo,
    p_reason_category: parsed.data.reasonCategory,
    p_message: parsed.data.message || null,
  });

  if (error) return { message: error.message || "Could not submit absence notice." };

  revalidatePath("/parent");
  return { success: true, message: "Absence notice submitted. The school will review it." };
}

const reviewAbsenceSchema = z.object({
  noticeId: z.string().uuid(),
  status: z.enum(["accepted", "returned", "closed"]),
  reviewNote: z.string().max(2000).optional(),
});

export async function reviewAbsenceNotice(_state: AbsenceActionState, formData: FormData): Promise<AbsenceActionState> {
  const parsed = reviewAbsenceSchema.safeParse({
    noticeId: formData.get("noticeId"),
    status: formData.get("status"),
    reviewNote: formData.get("reviewNote") || undefined,
  });

  if (!parsed.success) return { message: "Invalid review data." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("review_guardian_absence_notice", {
    p_notice_id: parsed.data.noticeId,
    p_status: parsed.data.status,
    p_review_note: parsed.data.reviewNote || null,
  });

  if (error) return { message: error.message || "Could not review absence notice." };

  revalidatePath("/school/absence-reviews");
  return { success: true, message: `Notice ${parsed.data.status}.` };
}

const reasonLabels: Record<string, string> = {
  illness: "Illness",
  medical_appointment: "Medical appointment",
  compassionate: "Compassionate",
  family: "Family",
  transport: "Transport",
  weather: "Weather",
  school_activity: "School activity",
  other: "Other",
};

export { reasonLabels };
