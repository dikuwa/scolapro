"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const guardianSchema = z.object({
  learnerId: z.string().uuid(),
  firstNames: z.string().trim().min(1, "First names are required."),
  surname: z.string().trim().min(1, "Surname is required."),
  relationshipType: z.string().trim().min(1, "Relationship is required."),
  mobile: z.string().trim().optional(),
  email: z.string().trim().email("Enter a valid email address.").optional().or(z.literal("")),
});

const existingGuardianSchema = z.object({
  learnerId: z.string().uuid(),
  guardianId: z.string().uuid(),
  relationshipType: z.string().trim().min(1, "Relationship is required."),
  priority: z.coerce.number().int().min(1).max(20).default(1),
});

export type GuardianActionState = { success?: boolean; message?: string; fieldErrors?: Record<string, string[]> };

export async function addGuardianRelationship(_state: GuardianActionState, formData: FormData): Promise<GuardianActionState> {
  const parsed = guardianSchema.safeParse({
    learnerId: formData.get("learnerId"), firstNames: formData.get("firstNames"), surname: formData.get("surname"),
    relationshipType: formData.get("relationshipType"), mobile: formData.get("mobile"), email: formData.get("email"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const context = await getUserContext();
  if (!context.user || !context.memberships.length) return { message: "You do not have permission to manage guardian relationships." };

  const contacts = [];
  if (parsed.data.mobile) contacts.push({ type: "mobile", value: parsed.data.mobile, primary: true });
  if (parsed.data.email) contacts.push({ type: "email", value: parsed.data.email, primary: true });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("upsert_guardian_relationship", {
    p_learner_id: parsed.data.learnerId,
    p_first_names: parsed.data.firstNames,
    p_surname: parsed.data.surname,
    p_relationship_type: parsed.data.relationshipType,
    p_is_legal_guardian: formData.get("legalGuardian") === "on",
    p_is_emergency_contact: formData.get("emergencyContact") === "on",
    p_is_pickup_authorized: formData.get("pickupAuthorized") === "on",
    p_priority: Number(formData.get("priority") || 1),
    p_contacts: contacts,
  });
  if (error) return { message: error.message.includes("duplicate") ? "A matching guardian identity already exists. Use the existing guardian option instead." : "The guardian relationship could not be saved." };
  revalidatePath(`/learners/${parsed.data.learnerId}`);
  return { success: true, message: "Guardian linked to learner." };
}

export async function linkExistingGuardian(_state: GuardianActionState, formData: FormData): Promise<GuardianActionState> {
  const parsed = existingGuardianSchema.safeParse({
    learnerId: formData.get("learnerId"),
    guardianId: formData.get("guardianId"),
    relationshipType: formData.get("relationshipType"),
    priority: formData.get("priority") || 1,
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const context = await getUserContext();
  if (!context.user || !context.memberships.length) return { message: "You do not have permission to manage guardian relationships." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("link_existing_guardian_to_learner", {
    p_learner_id: parsed.data.learnerId,
    p_guardian_id: parsed.data.guardianId,
    p_relationship_type: parsed.data.relationshipType,
    p_is_legal_guardian: formData.get("legalGuardian") === "on",
    p_is_emergency_contact: formData.get("emergencyContact") === "on",
    p_is_pickup_authorized: formData.get("pickupAuthorized") === "on",
    p_priority: parsed.data.priority,
  });
  if (error) return { message: "The existing guardian could not be linked to this learner." };
  revalidatePath(`/learners/${parsed.data.learnerId}`);
  return { success: true, message: "Existing guardian linked to learner." };
}

export async function endGuardianRelationship(formData: FormData) {
  const relationshipId = String(formData.get("relationshipId") ?? "");
  const learnerId = String(formData.get("learnerId") ?? "");
  if (!z.string().uuid().safeParse(relationshipId).success) return;
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("end_guardian_relationship", { p_relationship_id: relationshipId });
  if (learnerId) revalidatePath(`/learners/${learnerId}`);
}
