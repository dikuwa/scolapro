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

const invitationSchema = z.object({
  schoolId: z.string().uuid("Choose a school."),
  email: z.string().trim().email("Enter a valid email address."),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  employeeNumber: z.string().trim().optional(),
  roleKey: z.enum([
    "school_admin",
    "principal",
    "deputy_principal",
    "hod",
    "teacher",
    "class_teacher",
    "counsellor",
    "social_worker",
    "librarian",
    "board_member",
  ]),
});

export type TenantOnboardingState = {
  message?: string;
  success?: boolean;
  fieldErrors?: Record<string, string[]>;
};

export type SchoolInvitationState = {
  message?: string;
  success?: boolean;
  invitationToken?: string;
  expiresAt?: string;
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

  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const context = await getUserContext();
  const isPlatformAdmin = context.platformMemberships.some((membership) => membership.roleKey === "platform_admin");
  if (!context.user || !isPlatformAdmin) return { message: "You do not have permission to create tenants." };

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

export async function createSchoolInvitation(
  _previousState: SchoolInvitationState,
  formData: FormData,
): Promise<SchoolInvitationState> {
  const parsed = invitationSchema.safeParse({
    schoolId: formData.get("schoolId"),
    email: formData.get("email"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    employeeNumber: formData.get("employeeNumber"),
    roleKey: formData.get("roleKey"),
  });

  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const context = await getUserContext();
  const isPlatformAdmin = context.platformMemberships.some((membership) => membership.roleKey === "platform_admin");
  const isSchoolAdmin = context.memberships.some(
    (membership) => membership.schoolId === parsed.data.schoolId && membership.roleKey === "school_admin",
  );

  // School Admin may only invite into a school they actually manage. Platform Admin
  // retains onboarding authority (first school administrator, sandbox governance).
  if (!context.user || (!isPlatformAdmin && !isSchoolAdmin)) {
    return { message: "You do not have permission to invite users to this school." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_school_invitation", {
    p_school_id: parsed.data.schoolId,
    p_email: parsed.data.email,
    p_first_name: parsed.data.firstName || null,
    p_last_name: parsed.data.lastName || null,
    p_employee_number: parsed.data.employeeNumber || null,
    p_role_key: parsed.data.roleKey,
  });

  if (error) {
    const duplicate = error.code === "23505" || error.message.toLowerCase().includes("pending invitation");
    return {
      message: duplicate
        ? "An active invitation already exists for that email and role."
        : "The invitation could not be created. Review the details and try again.",
    };
  }

  const result = Array.isArray(data) ? data[0] : data;
  const invitationToken = result && typeof result === "object" && "invitation_token" in result
    ? String(result.invitation_token)
    : undefined;
  const expiresAt = result && typeof result === "object" && "expires_at" in result
    ? String(result.expires_at)
    : undefined;

  revalidatePath("/platform/invitations");
  revalidatePath("/school/invitations");

  return {
    success: true,
    message: "Invitation created. Copy the secure join link and send it to the intended user.",
    invitationToken,
    expiresAt,
  };
}

export async function revokeSchoolInvitation(formData: FormData) {
  const invitationId = z.string().uuid().safeParse(formData.get("invitationId"));
  if (!invitationId.success) return;

  const context = await getUserContext();
  const canManage = Boolean(
    context.user && (
      context.platformMemberships.some((membership) => membership.roleKey === "platform_admin")
      || context.memberships.some((membership) => membership.roleKey === "school_admin")
    )
  );
  if (!canManage) return;

  const supabase = await createSupabaseServerClient();
  await supabase.rpc("revoke_school_invitation", { p_invitation_id: invitationId.data });
  revalidatePath("/platform/invitations");
  revalidatePath("/school/invitations");
}
