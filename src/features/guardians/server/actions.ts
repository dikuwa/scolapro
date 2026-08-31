"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const contactSchema = z.array(z.object({ type: z.enum(["mobile", "phone", "whatsapp", "email"]), value: z.string().trim().min(1), label: z.string().trim().optional(), primary: z.boolean().optional() })).max(12);
const addressSchema = z.array(z.object({ type: z.enum(["physical", "postal", "work", "other"]), line1: z.string().trim().min(1), line2: z.string().trim().optional(), locality: z.string().trim().optional(), town: z.string().trim().optional(), region: z.string().trim().optional(), postalCode: z.string().trim().optional(), country: z.string().trim().optional(), label: z.string().trim().optional(), primary: z.boolean().optional() })).max(8);

const guardianSchema = z.object({ learnerId: z.string().uuid(), firstNames: z.string().trim().min(1, "First names are required."), surname: z.string().trim().min(1, "Surname is required."), relationshipType: z.string().trim().min(1, "Relationship is required.") });
const existingGuardianSchema = z.object({ learnerId: z.string().uuid(), guardianId: z.string().uuid(), relationshipType: z.string().trim().min(1, "Relationship is required."), priority: z.coerce.number().int().min(1).max(20).default(1) });
const guardianEditSchema = z.object({
  learnerId: z.string().uuid(),
  guardianId: z.string().uuid(),
  firstNames: z.string().trim().min(1, "First names are required."),
  surname: z.string().trim().min(1, "Surname is required."),
  relationshipType: z.string().trim().min(1, "Relationship is required."),
  priority: z.coerce.number().int().min(1).max(20).default(1),
});

export type GuardianActionState = { success?: boolean; message?: string; fieldErrors?: Record<string, string[]> };

function parseJsonArray<T>(value: FormDataEntryValue | null, schema: z.ZodType<T>): T | null {
  try { const parsed = schema.safeParse(JSON.parse(String(value ?? "[]"))); return parsed.success ? parsed.data : null; } catch { return null; }
}

export async function addGuardianRelationship(_state: GuardianActionState, formData: FormData): Promise<GuardianActionState> {
  const parsed = guardianSchema.safeParse({ learnerId: formData.get("learnerId"), firstNames: formData.get("firstNames"), surname: formData.get("surname"), relationshipType: formData.get("relationshipType") });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const contacts = parseJsonArray(formData.get("contacts"), contactSchema);
  const addresses = parseJsonArray(formData.get("addresses"), addressSchema);
  if (!contacts || !addresses) return { message: "Check the guardian contact and address details." };
  const context = await getUserContext();
  if (!context.user || !context.memberships.length) return { message: "You do not have permission to manage guardian relationships." };

  const supabase = await createSupabaseServerClient();
  const { data: guardianId, error } = await supabase.rpc("upsert_guardian_relationship", {
    p_learner_id: parsed.data.learnerId, p_first_names: parsed.data.firstNames, p_surname: parsed.data.surname,
    p_relationship_type: parsed.data.relationshipType, p_is_legal_guardian: formData.get("legalGuardian") === "on",
    p_is_emergency_contact: formData.get("emergencyContact") === "on", p_is_pickup_authorized: formData.get("pickupAuthorized") === "on",
    p_priority: Number(formData.get("priority") || 1), p_contacts: contacts,
  });
  if (error || !guardianId) return { message: error?.message.includes("duplicate") ? "A matching guardian identity already exists. Search existing guardians instead." : "The guardian relationship could not be saved." };

  const { error: detailsError } = await supabase.rpc("replace_guardian_contact_details", { p_guardian_id: guardianId, p_learner_id: parsed.data.learnerId, p_contacts: contacts, p_addresses: addresses });
  if (detailsError) return { message: "Guardian was linked, but contact details could not be completed." };
  revalidatePath(`/learners/${parsed.data.learnerId}`);
  revalidatePath("/school/guardians");
  return { success: true, message: "Guardian linked to learner." };
}

export async function linkExistingGuardian(_state: GuardianActionState, formData: FormData): Promise<GuardianActionState> {
  const parsed = existingGuardianSchema.safeParse({ learnerId: formData.get("learnerId"), guardianId: formData.get("guardianId"), relationshipType: formData.get("relationshipType"), priority: formData.get("priority") || 1 });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const context = await getUserContext();
  if (!context.user || !context.memberships.length) return { message: "You do not have permission to manage guardian relationships." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("link_existing_guardian_to_learner", { p_learner_id: parsed.data.learnerId, p_guardian_id: parsed.data.guardianId, p_relationship_type: parsed.data.relationshipType, p_is_legal_guardian: formData.get("legalGuardian") === "on", p_is_emergency_contact: formData.get("emergencyContact") === "on", p_is_pickup_authorized: formData.get("pickupAuthorized") === "on", p_priority: parsed.data.priority });
  if (error) return { message: "The existing guardian could not be linked to this learner." };
  revalidatePath(`/learners/${parsed.data.learnerId}`);
  revalidatePath("/school/guardians");
  return { success: true, message: "Existing guardian linked to learner." };
}

export async function saveGuardianContactDetails(_state: GuardianActionState, formData: FormData): Promise<GuardianActionState> {
  const parsed = guardianEditSchema.safeParse({
    guardianId: formData.get("guardianId"),
    learnerId: formData.get("learnerId"),
    firstNames: formData.get("firstNames"),
    surname: formData.get("surname"),
    relationshipType: formData.get("relationshipType"),
    priority: formData.get("priority") || 1,
  });
  const contacts = parseJsonArray(formData.get("contacts"), contactSchema);
  const addresses = parseJsonArray(formData.get("addresses"), addressSchema);
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!contacts || !addresses) return { message: "Check the guardian contact and address details." };

  const supabase = await createSupabaseServerClient();
  const { error: identityError } = await supabase.rpc("upsert_guardian_relationship", {
    p_learner_id: parsed.data.learnerId,
    p_guardian_id: parsed.data.guardianId,
    p_first_names: parsed.data.firstNames,
    p_surname: parsed.data.surname,
    p_relationship_type: parsed.data.relationshipType,
    p_is_legal_guardian: formData.get("legalGuardian") === "on",
    p_is_emergency_contact: formData.get("emergencyContact") === "on",
    p_is_pickup_authorized: formData.get("pickupAuthorized") === "on",
    p_priority: parsed.data.priority,
    p_contacts: '[]',
  });
  if (identityError) return { message: "Guardian identity or relationship details could not be saved." };

  const { error } = await supabase.rpc("replace_guardian_contact_details", { p_guardian_id: parsed.data.guardianId, p_learner_id: parsed.data.learnerId, p_contacts: contacts, p_addresses: addresses });
  if (error) return { message: "Guardian identity was updated, but contact details could not be saved." };
  revalidatePath(`/learners/${parsed.data.learnerId}`);
  revalidatePath("/school/guardians");
  return { success: true, message: "Guardian details updated." };
}

export async function endGuardianRelationship(formData: FormData) {
  const relationshipId = String(formData.get("relationshipId") ?? "");
  const learnerId = String(formData.get("learnerId") ?? "");
  if (!z.string().uuid().safeParse(relationshipId).success) return;
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("end_guardian_relationship", { p_relationship_id: relationshipId });
  if (learnerId) revalidatePath(`/learners/${learnerId}`);
  revalidatePath("/school/guardians");
}