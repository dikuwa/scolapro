"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CircuitInspectorContactState = { success?: boolean; message?: string; fieldErrors?: Record<string, string[]> };

const inspectorSchema = z.object({
  circuitId: z.string().uuid(),
  inspectorName: z.string().trim().max(160, "Inspector name must be 160 characters or fewer."),
  inspectorPhone: z.string().trim().max(80, "Phone must be 80 characters or fewer."),
  inspectorEmail: z.union([z.literal(""), z.string().trim().email("Enter a valid inspector email address.")]),
});

/**
 * Governed write for circuit inspector PUBLIC contact fields. The RPC re-proves
 * current membership, the existing School Settings role set, a current effective
 * circuit assignment for the caller's school and effective staff placement, so
 * the client check is convenience only — never the authority.
 */
export async function saveCircuitInspectorContact(_previous: CircuitInspectorContactState, formData: FormData): Promise<CircuitInspectorContactState> {
  const parsed = inspectorSchema.safeParse({
    circuitId: formData.get("circuitId"),
    inspectorName: formData.get("inspectorName") ?? "",
    inspectorPhone: formData.get("inspectorPhone") ?? "",
    inspectorEmail: formData.get("inspectorEmail") ?? "",
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const context = await getUserContext();
  if (!context.user) return { message: "You need to sign in to update circuit contact details." };
  const authorized = context.memberships.some(
    (membership) => ["school_admin", "principal", "deputy_principal"].includes(membership.roleKey),
  );
  if (!authorized) return { message: "School Settings authority is required to update circuit inspector contact." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_circuit_inspector_contact", {
    p_circuit_id: parsed.data.circuitId,
    p_inspector_name: parsed.data.inspectorName,
    p_inspector_phone: parsed.data.inspectorPhone,
    p_inspector_email: parsed.data.inspectorEmail,
  });
  if (error) return { message: error.message || "The inspector contact details could not be saved." };
  revalidatePath("/school-directory");
  return { success: true, message: "Inspector contact details updated." };
}
