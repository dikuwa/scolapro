"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ContributionActionState = { success?: boolean; message?: string; fieldErrors?: Record<string, string[]> };

const campaignSchema = z.object({ schoolId: z.string().uuid(), academicYear: z.coerce.number().int().min(2000).max(2200), title: z.string().trim().min(2), description: z.string().trim().optional(), startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endsOn: z.string().optional() });
const itemSchema = z.object({ campaignId: z.string().uuid(), itemType: z.enum(["goods", "money", "raffle", "service", "other"]), label: z.string().trim().min(2), description: z.string().trim().optional(), unitLabel: z.string().trim().optional(), suggestedQuantity: z.string().optional(), suggestedAmount: z.string().optional() });
const recordSchema = z.object({ learnerId: z.string().uuid(), itemId: z.string().uuid(), contributionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), quantity: z.string().optional(), amount: z.string().optional(), note: z.string().trim().optional(), receivedByStaffId: z.string().optional() });

function optionalNumber(value?: string) { if (!value?.trim()) return null; const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN; }

export async function createCampaign(_state: ContributionActionState, formData: FormData): Promise<ContributionActionState> {
  const parsed = campaignSchema.safeParse({ schoolId: formData.get("schoolId"), academicYear: formData.get("academicYear"), title: formData.get("title"), description: formData.get("description"), startsOn: formData.get("startsOn"), endsOn: formData.get("endsOn") });
  if (!parsed.success) return { message: "Check the campaign title, dates and academic year." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_voluntary_contribution_campaign", { p_school_id: parsed.data.schoolId, p_academic_year: parsed.data.academicYear, p_title: parsed.data.title, p_description: parsed.data.description || null, p_starts_on: parsed.data.startsOn, p_ends_on: parsed.data.endsOn || null, p_visible_to_guardians: true });
  if (error) return { message: "The contribution campaign could not be created." };
  revalidatePath("/school/contributions");
  return { success: true, message: "Contribution campaign created." };
}

export async function addCampaignItem(_state: ContributionActionState, formData: FormData): Promise<ContributionActionState> {
  const parsed = itemSchema.safeParse({ campaignId: formData.get("campaignId"), itemType: formData.get("itemType"), label: formData.get("label"), description: formData.get("description"), unitLabel: formData.get("unitLabel"), suggestedQuantity: formData.get("suggestedQuantity"), suggestedAmount: formData.get("suggestedAmount") });
  if (!parsed.success) return { message: "Choose a campaign and provide a contribution item name." };
  const quantity = optionalNumber(parsed.data.suggestedQuantity);
  const amount = optionalNumber(parsed.data.suggestedAmount);
  if (Number.isNaN(quantity) || Number.isNaN(amount)) return { message: "Suggested quantity and amount must be positive numbers." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("add_voluntary_contribution_item", { p_campaign_id: parsed.data.campaignId, p_item_type: parsed.data.itemType, p_label: parsed.data.label, p_description: parsed.data.description || null, p_unit_label: parsed.data.unitLabel || null, p_suggested_quantity: quantity, p_suggested_amount: amount, p_sort_order: 100 });
  if (error) return { message: "The contribution item could not be added." };
  revalidatePath("/school/contributions");
  return { success: true, message: "Contribution item added." };
}

export async function publishCampaign(formData: FormData): Promise<ContributionActionState> {
  const campaignId = z.string().uuid().safeParse(formData.get("campaignId"));
  if (!campaignId.success) return { message: "The campaign could not be identified." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("publish_voluntary_contribution_campaign", { p_campaign_id: campaignId.data });
  if (error) return { message: "Add at least one contribution item before publishing." };
  revalidatePath("/school/contributions");
  return { success: true, message: "Campaign published." };
}

export async function recordContribution(_state: ContributionActionState, formData: FormData): Promise<ContributionActionState> {
  const parsed = recordSchema.safeParse({ learnerId: formData.get("learnerId"), itemId: formData.get("itemId"), contributionDate: formData.get("contributionDate"), quantity: formData.get("quantity"), amount: formData.get("amount"), note: formData.get("note"), receivedByStaffId: formData.get("receivedByStaffId") });
  if (!parsed.success) return { message: "Choose a learner, contribution item and valid date." };
  const quantity = optionalNumber(parsed.data.quantity);
  const amount = optionalNumber(parsed.data.amount);
  if (Number.isNaN(quantity) || Number.isNaN(amount) || (quantity === null && amount === null && !parsed.data.note)) return { message: "Enter an amount, quantity or useful note." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_learner_voluntary_contribution", { p_learner_id: parsed.data.learnerId, p_item_id: parsed.data.itemId, p_contribution_date: parsed.data.contributionDate, p_quantity: quantity, p_amount: amount, p_note: parsed.data.note || null, p_received_by_staff_member_id: parsed.data.receivedByStaffId || null });
  if (error) return { message: "The contribution could not be recorded. Confirm the learner and receiving staff member." };
  revalidatePath("/school/contributions");
  return { success: true, message: "Contribution recorded." };
}
