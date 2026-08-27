"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const tenantSchema = z.object({
  tenantName: z.string().trim().min(2, "Tenant name is required."),
  tenantSlug: z
    .string()
    .trim()
    .min(2, "Tenant slug is required.")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens."),
  schoolName: z.string().trim().min(2, "School name is required."),
  emisNumber: z.string().trim().optional(),
  region: z.string().trim().optional(),
  town: z.string().trim().optional(),
});

export type TenantOnboardingState = {
  message?: string;
  success?: boolean;
  fieldErrors?: Record<string, string[]>;
};

export async function createTenantSchool(
  _previousState: TenantOnboardingState,
  formData: FormData,
): Promise<TenantOnboardingState> {
  const parsed = tenantSchema.safeParse({
    tenantName: formData.get("tenantName"),
    tenantSlug: formData.get("tenantSlug"),
    schoolName: formData.get("schoolName"),
    emisNumber: formData.get("emisNumber"),
    region: formData.get("region"),
    town: formData.get("town"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const context = await getUserContext();
  const isPlatformAdmin = context.platformMemberships.some((membership) => membership.roleKey === "platform_admin");

  if (!context.user || !isPlatformAdmin) {
    return { message: "You do not have permission to create tenants." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_tenant_school", {
    p_tenant_name: parsed.data.tenantName,
    p_tenant_slug: parsed.data.tenantSlug,
    p_school_name: parsed.data.schoolName,
    p_emis_number: parsed.data.emisNumber || null,
    p_region: parsed.data.region || null,
    p_town: parsed.data.town || null,
  });

  if (error) {
    const duplicate = error.code === "23505";
    return {
      message: duplicate
        ? "A tenant or school with that identifier already exists."
        : "The tenant could not be created. Review the information and try again.",
    };
  }

  revalidatePath("/platform/tenants");
  revalidatePath("/");
  return { success: true, message: "Tenant and first school created successfully." };
}