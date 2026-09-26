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


export async function commentOnSubmission(
  _state: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const submissionId=String(formData.get("submissionId") ?? "");
  const comment=String(formData.get("comment") ?? "").trim();
  if (!z.string().uuid().safeParse(submissionId).success || !comment) {
    return { success:false,message:"Enter a comment before posting." };
  }
  const context=await getUserContext();
  if (!context.user) return {success:false,message:"Your session has ended. Sign in again to continue."};
  const supabase=await createSupabaseServerClient();
  const { error }=await supabase.rpc("comment_on_preparation_submission",{
    p_submission_id:submissionId,
    p_comment:comment,
  });
  if (error) return {success:false,message:/permission denied/i.test(error.message ?? "") ? "You do not have current review authority for this submission." : "The comment could not be recorded."};
  revalidatePath("/teaching/reviews");
  revalidatePath(`/teaching/reviews/${submissionId}`);
  return {success:true,message:"Comment recorded without changing submission state or teacher content."};
}

export async function setPreparationReviewPolicy(
  _state: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const cadence=String(formData.get("cadence") ?? "");
  if (!["weekly","fortnightly","selected","term_batch"].includes(cadence)) {
    return {success:false,message:"Choose a valid review cadence."};
  }
  const context=await getUserContext();
  const membership=context.currentSchoolMembership;
  if (!context.user || !membership) return {success:false,message:"Current school authority is required."};
  const supabase=await createSupabaseServerClient();
  const { error }=await supabase.rpc("set_preparation_review_policy",{
    p_school_id:membership.schoolId,
    p_cadence:cadence,
    p_effective_from:new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Windhoek",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()),
  });
  if (error) return {success:false,message:/permission denied/i.test(error.message ?? "") ? "Only current school leadership can change review cadence." : "Review cadence could not be saved."};
  revalidatePath("/teaching/reviews");
  revalidatePath("/teaching/preparation");
  return {success:true,message:"Preparation review cadence updated."};
}
