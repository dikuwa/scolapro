"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/auth/get-user-context";

const reviewSchema = z.object({
  submissionId: z.string().uuid(),
  action: z.enum(["reviewed", "returned"]),
  comment: z.string().trim().max(2000).optional(),
});

export async function reviewSubmission(formData: FormData) {
  const parsed = reviewSchema.safeParse({
    submissionId: formData.get("submissionId"),
    action: formData.get("action"),
    comment: formData.get("comment") ?? "",
  });

  if (!parsed.success) return { message: "Invalid submission data.", success: false };

  const context = await getUserContext();
  if (!context.user) return { message: "Authentication required.", success: false };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("review_preparation_submission", {
    p_submission_id: parsed.data.submissionId,
    p_action: parsed.data.action,
    p_comment: parsed.data.comment ?? null,
  });

  if (error) return { message: error.message ?? "The review could not be processed.", success: false };

  revalidatePath("/teaching/reviews");
  revalidatePath(`/teaching/reviews/${parsed.data.submissionId}`);

  return { message: parsed.data.action === "reviewed" ? "Submission reviewed." : "Submission returned.", success: true };
}

export async function submitPreparations(formData: FormData) {
  const schoolId = formData.get("schoolId") as string;
  const preparationIds = formData.getAll("preparationIds").map(String);
  const scopeKind = (formData.get("scopeKind") as string) ?? "selected_preparations";
  const termLabel = (formData.get("termLabel") as string) ?? null;
  const weekStart = (formData.get("weekStart") as string) ?? null;
  const weekEnd = (formData.get("weekEnd") as string) ?? null;

  const context = await getUserContext();
  if (!context.user) return { message: "Authentication required.", success: false };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_preparations", {
    p_school_id: schoolId,
    p_lesson_preparation_ids: preparationIds,
    p_scope_kind: scopeKind,
    p_term_label: termLabel,
    p_week_start: weekStart,
    p_week_end: weekEnd,
  });

  if (error) return { message: error.message ?? "The submission could not be created.", success: false };

  revalidatePath("/teaching/preparation");
  revalidatePath("/teaching/reviews");

  return { message: "Preparations submitted for HOD review.", success: true, submissionId: data };
}
