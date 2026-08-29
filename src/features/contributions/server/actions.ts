"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ContributionActionState = { success?: boolean; message?: string };

const recordContributionSchema = z.object({
  campaignId: z.string().uuid(), itemId: z.string().uuid(), learnerId: z.string().uuid(), quantity: z.string().optional(), amount: z.string().optional(), note: z.string().optional(), contributionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const campaignSchema = z.object({ schoolId: z.string().uuid(), academicYear: z.coerce.number().int().min(2000).max(2200), title: z.string().trim().min(2).max(160), description: z.string().trim().max(1000).optional(), startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endsOn: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional() });
const itemSchema = z.object({ campaignId: z.string().uuid(), itemType: z.enum(["goods","money","raffle","service","other"]), label: z.string().trim().min(2).max(160), description: z.string().trim().max(1000).optional(), unitLabel: z.string().trim().max(60).optional(), suggestedQuantity: z.string().optional(), suggestedAmount: z.string().optional() });

async function currentMembership() {
  const context = await getUserContext();
  if (!context.user) return null;
  return context.memberships[0] ?? null;
}

export async function createContributionCampaign(_state: ContributionActionState, formData: FormData): Promise<ContributionActionState> {
  const parsed = campaignSchema.safeParse({ schoolId: formData.get("schoolId"), academicYear: formData.get("academicYear"), title: formData.get("title"), description: formData.get("description") || undefined, startsOn: formData.get("startsOn"), endsOn: formData.get("endsOn") || "" });
  if (!parsed.success) return { message: "Add a campaign title and valid dates." };
  const membership = await currentMembership();
  if (!membership || !["school_admin","principal","deputy_principal"].includes(membership.roleKey) || membership.schoolId !== parsed.data.schoolId) return { message: "School leadership access is required to create campaigns." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_voluntary_contribution_campaign", { p_school_id: parsed.data.schoolId, p_academic_year: parsed.data.academicYear, p_title: parsed.data.title, p_description: parsed.data.description || null, p_starts_on: parsed.data.startsOn, p_ends_on: parsed.data.endsOn || null, p_visible_to_guardians: true });
  if (error) return { message: error.message || "Campaign could not be created." };
  revalidatePath("/school/contributions");
  return { success: true, message: "Contribution campaign created as a draft." };
}

export async function addContributionItem(_state: ContributionActionState, formData: FormData): Promise<ContributionActionState> {
  const parsed = itemSchema.safeParse({ campaignId: formData.get("campaignId"), itemType: formData.get("itemType"), label: formData.get("label"), description: formData.get("description") || undefined, unitLabel: formData.get("unitLabel") || undefined, suggestedQuantity: formData.get("suggestedQuantity") || undefined, suggestedAmount: formData.get("suggestedAmount") || undefined });
  if (!parsed.success) return { message: "Choose a campaign and add a valid contribution item." };
  const membership = await currentMembership();
  if (!membership || !["school_admin","principal","deputy_principal"].includes(membership.roleKey)) return { message: "School leadership access is required to configure contribution items." };
  const quantity = parsed.data.suggestedQuantity ? Number(parsed.data.suggestedQuantity) : null;
  const amount = parsed.data.suggestedAmount ? Number(parsed.data.suggestedAmount) : null;
  if ((quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) || (amount !== null && (!Number.isFinite(amount) || amount < 0))) return { message: "Suggested quantity or amount must be zero or greater." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("add_voluntary_contribution_item", { p_campaign_id: parsed.data.campaignId, p_item_type: parsed.data.itemType, p_label: parsed.data.label, p_description: parsed.data.description || null, p_unit_label: parsed.data.unitLabel || null, p_suggested_quantity: quantity, p_suggested_amount: amount, p_sort_order: 100 });
  if (error) return { message: error.message || "Contribution item could not be added." };
  revalidatePath("/school/contributions");
  return { success: true, message: "Contribution item added." };
}

export async function publishContributionCampaign(formData: FormData) {
  const campaignId = String(formData.get("campaignId") ?? "");
  if (!z.string().uuid().safeParse(campaignId).success) return;
  const membership = await currentMembership();
  if (!membership || !["school_admin","principal","deputy_principal"].includes(membership.roleKey)) return;
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("publish_voluntary_contribution_campaign", { p_campaign_id: campaignId });
  revalidatePath("/school/contributions");
}

export async function recordContribution(_state: ContributionActionState, formData: FormData): Promise<ContributionActionState> {
  const parsed = recordContributionSchema.safeParse({ campaignId: formData.get("campaignId"), itemId: formData.get("itemId"), learnerId: formData.get("learnerId"), quantity: formData.get("quantity") || undefined, amount: formData.get("amount") || undefined, note: formData.get("note") || undefined, contributionDate: formData.get("contributionDate") });
  if (!parsed.success) return { message: "Please fill in all required fields correctly." };
  const context = await getUserContext();
  if (!context.user) return { message: "Authentication required." };
  const membership = context.memberships[0];
  if (!membership) return { message: "School access required." };
  const supabase = await createSupabaseServerClient();
  const quantity = parsed.data.quantity ? Number(parsed.data.quantity) : null;
  const amount = parsed.data.amount ? Number(parsed.data.amount) : null;
  const { error } = await supabase.rpc("record_learner_voluntary_contribution", { p_campaign_id: parsed.data.campaignId, p_item_id: parsed.data.itemId, p_learner_id: parsed.data.learnerId, p_quantity: quantity, p_amount: amount, p_note: parsed.data.note || null, p_contribution_date: parsed.data.contributionDate });
  if (error) return { message: error.message || "Could not record contribution." };
  revalidatePath("/school/contributions");
  return { success: true, message: "Contribution recorded." };
}
