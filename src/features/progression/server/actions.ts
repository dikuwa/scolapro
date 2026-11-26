"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ProgressionActionState = { success?: boolean; message?: string };

const uuid = z.string().uuid();
const outcome = z.enum(["promoted", "not_promoted", "condoned"]);

function messageFor(error: { message?: string } | null, fallback: string) {
  return error?.message?.trim() || fallback;
}

export async function generateProgression(_state: ProgressionActionState, formData: FormData): Promise<ProgressionActionState> {
  const parsed = z.object({ enrolmentId: uuid, ruleSetId: uuid }).safeParse({
    enrolmentId: formData.get("enrolmentId"),
    ruleSetId: formData.get("ruleSetId"),
  });
  if (!parsed.success) return { message: "Choose the governed promotion rule set for this grade." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("generate_year_end_progression", {
    p_enrolment_id: parsed.data.enrolmentId,
    p_promotion_rule_set_id: parsed.data.ruleSetId,
  });
  if (error) return { message: messageFor(error, "The progression recommendation could not be generated.") };

  revalidatePath("/school/progression");
  return { success: true, message: "Recommendation generated for review." };
}

export async function overrideProgression(_state: ProgressionActionState, formData: FormData): Promise<ProgressionActionState> {
  const parsed = z.object({
    progressionId: uuid,
    outcome,
    reason: z.string().trim().min(2).max(800),
    destinationGradeCode: z.string().trim().max(40).optional(),
  }).safeParse({
    progressionId: formData.get("progressionId"),
    outcome: formData.get("outcome"),
    reason: formData.get("reason"),
    destinationGradeCode: formData.get("destinationGradeCode") || undefined,
  });
  if (!parsed.success) return { message: "Choose an outcome and record the reason for the override." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("override_year_end_progression", {
    p_progression_id: parsed.data.progressionId,
    p_outcome: parsed.data.outcome,
    p_reason: parsed.data.reason,
    p_destination_grade_code: parsed.data.destinationGradeCode || null,
  });
  if (error) return { message: messageFor(error, "The progression override could not be recorded.") };

  revalidatePath("/school/progression");
  return { success: true, message: "Progression override recorded with its reason." };
}

export async function approveProgression(_state: ProgressionActionState, formData: FormData): Promise<ProgressionActionState> {
  const parsed = z.object({ progressionId: uuid }).safeParse({ progressionId: formData.get("progressionId") });
  if (!parsed.success) return { message: "Choose a reviewed progression to approve." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("approve_year_end_progression", { p_progression_id: parsed.data.progressionId });
  if (error) return { message: messageFor(error, "The progression could not be approved.") };

  revalidatePath("/school/progression");
  return { success: true, message: "Progression approved." };
}

export async function lockProgression(_state: ProgressionActionState, formData: FormData): Promise<ProgressionActionState> {
  const parsed = z.object({ progressionId: uuid, confirmation: z.literal("confirmed") }).safeParse({
    progressionId: formData.get("progressionId"),
    confirmation: formData.get("confirmation"),
  });
  if (!parsed.success) return { message: "Confirm the lock before continuing." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("lock_year_end_progression", { p_progression_id: parsed.data.progressionId });
  if (error) return { message: messageFor(error, "The progression could not be locked.") };

  revalidatePath("/school/progression");
  return { success: true, message: "Progression locked. It can now be published." };
}

export async function publishProgression(_state: ProgressionActionState, formData: FormData): Promise<ProgressionActionState> {
  const parsed = z.object({
    progressionId: uuid,
    destinationRegisterClassId: uuid,
    effectiveOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    confirmation: z.literal("confirmed"),
  }).safeParse({
    progressionId: formData.get("progressionId"),
    destinationRegisterClassId: formData.get("destinationRegisterClassId"),
    effectiveOn: formData.get("effectiveOn"),
    confirmation: formData.get("confirmation"),
  });
  if (!parsed.success) return { message: "Choose the destination class, effective date and confirm the rollover." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("publish_year_end_progression", {
    p_progression_id: parsed.data.progressionId,
    p_destination_register_class_id: parsed.data.destinationRegisterClassId,
    p_effective_on: parsed.data.effectiveOn,
  });
  const retry = error?.message?.includes("already") || error?.message?.includes("destination academic year");
  if (error) {
    return {
      message: retry
        ? messageFor(error, "The learner cannot be rolled over into the next academic year.")
        : messageFor(error, "The progression could not be published."),
    };
  }

  revalidatePath("/school/progression");
  return { success: true, message: "Rollover published. The source enrolment is closed and the destination enrolment created." };
}
