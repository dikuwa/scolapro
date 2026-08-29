"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ProfileChangeActionState = { success?: boolean; message?: string };

const submitSchema = z.object({
  learnerId: z.string().uuid(),
  fieldKey: z.enum(["first_names","initials","surname","preferred_name","date_of_birth","sex","national_id","birth_certificate_number"]),
  proposedValue: z.string().max(300),
  reason: z.string().trim().max(800).optional(),
});

export async function submitLearnerProfileChange(_state: ProfileChangeActionState, formData: FormData): Promise<ProfileChangeActionState> {
  const parsed = submitSchema.safeParse({
    learnerId: formData.get("learnerId"),
    fieldKey: formData.get("fieldKey"),
    proposedValue: formData.get("proposedValue") ?? "",
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { message: "Choose a learner field and provide the corrected value." };

  const proposedValue = parsed.data.fieldKey === "initials"
    ? parsed.data.proposedValue.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 12)
    : parsed.data.proposedValue;
  if (parsed.data.fieldKey === "initials" && !proposedValue) return { message: "Initials must contain at least one letter." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_profile_change_request", {
    p_learner_id: parsed.data.learnerId,
    p_target_type: "learner",
    p_target_id: parsed.data.learnerId,
    p_field_key: parsed.data.fieldKey,
    p_proposed_value: proposedValue,
    p_reason: parsed.data.reason || null,
  });
  if (error) return { message: error.message || "The correction request could not be submitted." };
  revalidatePath(`/learners/${parsed.data.learnerId}`);
  revalidatePath("/school/data-corrections");
  return { success: true, message: "Correction submitted for review." };
}

const reviewSchema = z.object({ requestId: z.string().uuid(), decision: z.enum(["approved","rejected"]), note: z.string().trim().max(800).optional() });

export async function reviewProfileChange(_state: ProfileChangeActionState, formData: FormData): Promise<ProfileChangeActionState> {
  const parsed = reviewSchema.safeParse({ requestId: formData.get("requestId"), decision: formData.get("decision"), note: formData.get("note") || undefined });
  if (!parsed.success) return { message: "The correction review request is invalid." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("review_profile_change_request", {
    p_request_id: parsed.data.requestId,
    p_decision: parsed.data.decision,
    p_review_note: parsed.data.note || null,
  });
  if (error) return { message: error.message || "The correction could not be reviewed." };
  revalidatePath("/school/data-corrections");
  revalidatePath("/learners");
  return { success: true, message: parsed.data.decision === "approved" ? "Correction approved and applied." : "Correction rejected." };
}