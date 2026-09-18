"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/auth/get-user-context";

export type ReviewActionState = {
  success: boolean;
  message: string;
};

/**
 * Only the two transitions defined by the merged DB governance are supported:
 * a submitted preparation becomes reviewed, or it is returned for revision.
 * This application layer never invents any additional oversight state.
 */
const reviewSchema = z.object({
  submissionId: z.string().uuid(),
  action: z.enum(["reviewed", "returned"]),
  comment: z.string().trim().max(2000).optional(),
});

function reviewErrorMessage(message: string | undefined, action: "reviewed" | "returned") {
  const detail = (message ?? "").toLowerCase();
  if (detail.includes("permission denied")) return "You do not have current review authority for this submission.";
  if (detail.includes("only submitted preparations")) return "This submission has already been reviewed or returned.";
  if (detail.includes("not found")) return "This preparation submission is no longer available.";
  return action === "reviewed"
    ? "The submission could not be reviewed. Try again."
    : "The submission could not be returned for revision. Try again.";
}

/**
 * Governed review / return action.
 *
 * The merged `public.review_preparation_submission` RPC is the single authority
 * boundary: it re-checks review authority (HOD subject responsibility, current
 * school, effective placement, leadership scope), excludes Platform Support,
 * appends the immutable provenance event and only updates the submission's
 * oversight snapshot. It never writes teacher preparation content, and this
 * action performs no direct table mutation.
 */
export async function reviewSubmission(
  _state: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const parsed = reviewSchema.safeParse({
    submissionId: formData.get("submissionId"),
    action: formData.get("action"),
    comment: String(formData.get("comment") ?? ""),
  });
  if (!parsed.success) {
    return { success: false, message: "Choose review or return for revision, then try again." };
  }

  const context = await getUserContext();
  if (!context.user) {
    return { success: false, message: "Your session has ended. Sign in again to continue." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("review_preparation_submission", {
    p_submission_id: parsed.data.submissionId,
    p_action: parsed.data.action,
    p_comment: parsed.data.comment ? parsed.data.comment : null,
  });

  if (error) {
    return { success: false, message: reviewErrorMessage(error.message, parsed.data.action) };
  }

  revalidatePath("/teaching/reviews");
  revalidatePath(`/teaching/reviews/${parsed.data.submissionId}`);

  return {
    success: true,
    message:
      parsed.data.action === "reviewed"
        ? "Submission reviewed. The preparation content and the review history are unchanged."
        : "Submission returned for revision. The teacher can update and resubmit it.",
  };
}
