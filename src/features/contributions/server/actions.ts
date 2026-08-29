"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ContributionActionState = { success?: boolean; message?: string };

const recordContributionSchema = z.object({
  campaignId: z.string().uuid(),
  itemId: z.string().uuid(),
  learnerId: z.string().uuid(),
  quantity: z.string().optional(),
  amount: z.string().optional(),
  note: z.string().optional(),
  contributionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function recordContribution(_state: ContributionActionState, formData: FormData): Promise<ContributionActionState> {
  const parsed = recordContributionSchema.safeParse({
    campaignId: formData.get("campaignId"),
    itemId: formData.get("itemId"),
    learnerId: formData.get("learnerId"),
    quantity: formData.get("quantity") || undefined,
    amount: formData.get("amount") || undefined,
    note: formData.get("note") || undefined,
    contributionDate: formData.get("contributionDate"),
  });

  if (!parsed.success) {
    return { message: "Please fill in all required fields correctly." };
  }

  const context = await getUserContext();
  if (!context.user) return { message: "Authentication required." };
  const membership = context.memberships[0];
  if (!membership) return { message: "School access required." };

  const supabase = await createSupabaseServerClient();
  const quantity = parsed.data.quantity ? Number(parsed.data.quantity) : null;
  const amount = parsed.data.amount ? Number(parsed.data.amount) : null;

  const { error } = await supabase.rpc("record_learner_voluntary_contribution", {
    p_campaign_id: parsed.data.campaignId,
    p_item_id: parsed.data.itemId,
    p_learner_id: parsed.data.learnerId,
    p_quantity: quantity,
    p_amount: amount,
    p_note: parsed.data.note || null,
    p_contribution_date: parsed.data.contributionDate,
  });

  if (error) {
    return { message: error.message || "Could not record contribution." };
  }

  revalidatePath("/school/contributions");
  return { success: true, message: "Contribution recorded." };
}
