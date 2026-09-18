"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ProfessionalFileReviewActionState = {
  success: boolean;
  message: string;
};

const schema = z.object({
  submissionId: z.string().uuid(),
  action: z.enum(["reviewed", "returned"]),
  comment: z.string().trim().max(2000).optional(),
});

export async function reviewProfessionalFileSubmission(
  _state: ProfessionalFileReviewActionState,
  formData: FormData,
): Promise<ProfessionalFileReviewActionState> {
  const parsed = schema.safeParse({
    submissionId: formData.get("submissionId"),
    action: formData.get("action"),
    comment: String(formData.get("comment") ?? ""),
  });
  if (!parsed.success) return { success: false, message: "Choose a valid review action." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("review_teacher_professional_document_submission", {
    p_submission_id: parsed.data.submissionId,
    p_action: parsed.data.action,
    p_comment: parsed.data.comment || null,
  });

  if (error) {
    const detail = error.message.toLowerCase();
    if (detail.includes("authority")) {
      return { success: false, message: "Your current HOD responsibility does not allow this review." };
    }
    if (detail.includes("only submitted")) {
      return { success: false, message: "This professional document is no longer awaiting review." };
    }
    return { success: false, message: "The professional-file review could not be recorded." };
  }

  revalidatePath("/teaching/reviews");
  revalidatePath(`/teaching/reviews/professional-files/${parsed.data.submissionId}`);
  return {
    success: true,
    message: parsed.data.action === "reviewed"
      ? "Professional document marked reviewed."
      : "Professional document returned with feedback.",
  };
}
