"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ParentPortalActionState = { success?: boolean; message?: string };

const claimSchema = z.object({ guardianId: z.string().uuid() });

export async function claimGuardianProfile(_state: ParentPortalActionState, formData: FormData): Promise<ParentPortalActionState> {
  const parsed = claimSchema.safeParse({ guardianId: formData.get("guardianId") });
  if (!parsed.success) return { message: "The guardian profile could not be identified." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("claim_guardian_profile", { p_guardian_id: parsed.data.guardianId });
  if (error) {
    if (error.message.toLowerCase().includes("email")) {
      return { message: "Your signed-in email does not match an active guardian email contact." };
    }
    return { message: "The guardian profile could not be linked to this account." };
  }

  revalidatePath("/parent");
  return { success: true, message: "Guardian profile linked. Your children are now available." };
}
