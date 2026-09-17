"use server";

import { revalidatePath } from "next/cache";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const REVIEW_ROLES = new Set(["school_admin", "principal", "deputy_principal", "hod"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function reviewPreparationSubmissionAction(formData: FormData): Promise<void> {
  const context = await getUserContext();
  if (!context.user || context.platformMemberships.length) {
    throw new Error("Preparation review is not available for this account.");
  }

  const membership = context.memberships.find((item) => REVIEW_ROLES.has(item.roleKey));
  if (!membership) throw new Error("Preparation review authority is required.");

  const submissionId = String(formData.get("submissionId") ?? "");
  const action = String(formData.get("action") ?? "");
  const commentValue = String(formData.get("comment") ?? "").trim();
  if (!UUID_PATTERN.test(submissionId)) throw new Error("Invalid preparation submission.");
  if (action !== "reviewed" && action !== "returned") throw new Error("Invalid review action.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("review_preparation_submission", {
    p_submission_id: submissionId,
    p_action: action,
    p_comment: commentValue || null,
  });
  if (error) throw new Error(error.message || "Unable to update the preparation review.");

  revalidatePath("/teaching/reviews");
  revalidatePath(`/teaching/reviews/${submissionId}`);
}
