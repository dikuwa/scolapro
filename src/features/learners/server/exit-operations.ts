"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getNamibiaDateKey } from "@/lib/namibia-date";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LearnerExitActionState = { success?: boolean; message?: string };

const exitSchema = z.object({
  enrolmentId: z.string().uuid(),
  learnerId: z.string().uuid(),
  status: z.enum(["left", "withdrawn"]),
  effectiveOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(2).max(800),
  confirmation: z.literal("confirmed"),
});

export async function exitLearnerEnrolment(_state: LearnerExitActionState, formData: FormData): Promise<LearnerExitActionState> {
  const parsed = exitSchema.safeParse({
    enrolmentId: formData.get("enrolmentId"), learnerId: formData.get("learnerId"), status: formData.get("status"),
    effectiveOn: formData.get("effectiveOn"), reason: formData.get("reason"), confirmation: formData.get("confirmation"),
  });
  if (!parsed.success) return { message: "Confirm the exit action, effective date, and reason before continuing." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("exit_learner_enrolment", {
    p_enrolment_id: parsed.data.enrolmentId, p_status: parsed.data.status,
    p_effective_on: parsed.data.effectiveOn, p_reason: parsed.data.reason,
  });
  if (error) return { message: error.message || "The learner exit could not be recorded." };
  revalidatePath(`/learners/${parsed.data.learnerId}`);
  revalidatePath("/learners");
  return { success: true, message: parsed.data.status === "withdrawn" ? "Learner withdrawal recorded." : "Learner marked as having left the school." };
}

const transferSchema = z.object({
  enrolmentId: z.string().uuid(), learnerId: z.string().uuid(), schoolId: z.string().uuid(),
  effectiveOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), destinationSchoolId: z.string().uuid().optional(),
  destinationName: z.string().trim().max(240).optional(), reason: z.string().trim().min(2).max(800), confirmation: z.literal("confirmed"),
});

export async function requestLearnerTransfer(_state: LearnerExitActionState, formData: FormData): Promise<LearnerExitActionState> {
  const parsed = transferSchema.safeParse({
    enrolmentId: formData.get("enrolmentId"), learnerId: formData.get("learnerId"), schoolId: formData.get("schoolId"),
    effectiveOn: formData.get("effectiveOn"), destinationSchoolId: formData.get("destinationSchoolId") || undefined,
    destinationName: formData.get("destinationName") || undefined, reason: formData.get("reason"), confirmation: formData.get("confirmation"),
  });
  if (!parsed.success || (!parsed.data.destinationSchoolId && !parsed.data.destinationName)) return { message: "Confirm the transfer and provide a destination school." };
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { message: "Sign in again before requesting a transfer." };
  const { data: enrolment, error: enrolmentError } = await supabase.from("enrolments").select("id,tenant_id,school_id,learner_id,status").eq("id", parsed.data.enrolmentId).eq("school_id", parsed.data.schoolId).maybeSingle();
  if (enrolmentError || !enrolment || enrolment.learner_id !== parsed.data.learnerId || enrolment.status !== "current") return { message: "The learner's current enrolment could not be verified." };
  const { error } = await supabase.from("transfer_events").insert({
    tenant_id: enrolment.tenant_id, learner_id: enrolment.learner_id, source_school_id: enrolment.school_id,
    source_enrolment_id: enrolment.id, destination_school_id: parsed.data.destinationSchoolId || null,
    destination_name: parsed.data.destinationName || null, requested_on: getNamibiaDateKey(),
    effective_on: parsed.data.effectiveOn, reason: parsed.data.reason, status: "requested", initiated_by_user_id: user.id,
  });
  if (error) return { message: error.message || "The learner transfer could not be requested." };
  revalidatePath(`/learners/${parsed.data.learnerId}`); revalidatePath("/learners");
  return { success: true, message: "Transfer request recorded. It remains pending approval." };
}

const transferActionSchema = z.object({ transferId: z.string().uuid(), learnerId: z.string().uuid(), action: z.enum(["approve", "complete", "cancel"]), note: z.string().trim().max(800).optional(), confirmation: z.literal("confirmed") });

export async function advanceLearnerTransfer(_state: LearnerExitActionState, formData: FormData): Promise<LearnerExitActionState> {
  const parsed = transferActionSchema.safeParse({ transferId: formData.get("transferId"), learnerId: formData.get("learnerId"), action: formData.get("action"), note: formData.get("note") || undefined, confirmation: formData.get("confirmation") });
  if (!parsed.success) return { message: "Confirm the transfer lifecycle action before continuing." };
  const supabase = await createSupabaseServerClient();
  const rpc = parsed.data.action === "approve" ? "approve_learner_transfer" : parsed.data.action === "complete" ? "complete_learner_transfer" : "cancel_learner_transfer";
  const args = parsed.data.action === "approve" ? { p_transfer_id: parsed.data.transferId, p_effective_on: null, p_note: parsed.data.note || null } : parsed.data.action === "cancel" ? { p_transfer_id: parsed.data.transferId, p_reason: parsed.data.note || "Transfer cancelled by school" } : { p_transfer_id: parsed.data.transferId };
  const { error } = await supabase.rpc(rpc, args);
  if (error) return { message: error.message || "The transfer lifecycle action could not be completed." };
  revalidatePath(`/learners/${parsed.data.learnerId}`); revalidatePath("/learners");
  return { success: true, message: parsed.data.action === "approve" ? "Transfer approved." : parsed.data.action === "complete" ? "Transfer completed and source enrolment closed." : "Transfer cancelled." };
}

export async function publishCompletedProgression(_state: LearnerExitActionState, formData: FormData): Promise<LearnerExitActionState> {
  const parsed = z.object({ progressionId: z.string().uuid(), learnerId: z.string().uuid(), effectiveOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), confirmation: z.literal("confirmed") }).safeParse({ progressionId: formData.get("progressionId"), learnerId: formData.get("learnerId"), effectiveOn: formData.get("effectiveOn"), confirmation: formData.get("confirmation") });
  if (!parsed.success) return { message: "Confirm the completed school-leaving publication before continuing." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("publish_year_end_progression", { p_progression_id: parsed.data.progressionId, p_destination_register_class_id: null, p_effective_on: parsed.data.effectiveOn });
  if (error) return { message: error.message || "The completed outcome could not be published." };
  revalidatePath(`/learners/${parsed.data.learnerId}`); revalidatePath("/learners");
  return { success: true, message: "Completed school-leaving outcome published." };
}
