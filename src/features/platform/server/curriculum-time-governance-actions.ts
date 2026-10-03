"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const governanceActionSchema = z.object({
  entityType: z.enum(["source","profile","allocation","constraint"]),
  entityId: z.string().uuid(),
  action: z.enum(["verify","publish","withdraw","link_supersession","resolve_conflict"]),
  relatedId: z.union([z.literal(""), z.string().uuid()]).optional(),
  reason: z.string().trim().max(1000).optional(),
});

export type CurriculumGovernanceActionState = {
  success?: boolean;
  message?: string;
};

export async function applyCurriculumTimeGovernanceAction(
  _previous: CurriculumGovernanceActionState,
  formData: FormData,
): Promise<CurriculumGovernanceActionState> {
  const parsed = governanceActionSchema.safeParse({
    entityType: formData.get("entityType"),
    entityId: formData.get("entityId"),
    action: formData.get("action"),
    relatedId: formData.get("relatedId") ?? "",
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) return { message: "The governance request is incomplete." };

  const context = await getUserContext();
  const isPlatformAdmin = Boolean(
    context.user &&
    context.platformMemberships.some((membership) => membership.roleKey === "platform_admin")
  );
  if (!isPlatformAdmin) return { message: "Platform administrator authority is required." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("govern_curriculum_time_registry", {
    p_entity_type: parsed.data.entityType,
    p_entity_id: parsed.data.entityId,
    p_action: parsed.data.action,
    p_related_id: parsed.data.relatedId || null,
    p_reason: parsed.data.reason || null,
  });

  if (error) {
    return { message: error.message || "The curriculum governance action could not be completed." };
  }

  revalidatePath("/platform/curriculum-policy");
  return { success: true, message: "Governance action completed." };
}
