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

const schoolRoleSchema = z.enum([
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
]);

const schoolInvitationSchema = z.object({
  schoolId: z.string().uuid("Choose a school."),
  email: z.string().trim().email("Enter a valid email address."),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  employeeNumber: z.string().trim().optional(),
  roleKey: schoolRoleSchema,
});

const platformInvitationSchema = schoolInvitationSchema.omit({ roleKey: true });

type InvitationPayload = z.infer<typeof schoolInvitationSchema>;

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

async function submitSchoolInvitation(payload: InvitationPayload): Promise<SchoolInvitationState> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_school_invitation", {
    p_school_id: payload.schoolId,
    p_email: payload.email,
    p_first_name: payload.firstName || null,
    p_last_name: payload.lastName || null,
    p_employee_number: payload.employeeNumber || null,
    p_role_key: payload.roleKey,
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

export async function createSchoolStaffInvitation(
  _previousState: SchoolInvitationState,
  formData: FormData,
): Promise<SchoolInvitationState> {
  const parsed = schoolInvitationSchema.safeParse({
    schoolId: formData.get("schoolId"),
    email: formData.get("email"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    employeeNumber: formData.get("employeeNumber"),
    roleKey: formData.get("roleKey"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const context = await getUserContext();
  const isSchoolAdmin = context.memberships.some(
    (membership) => membership.schoolId === parsed.data.schoolId && membership.roleKey === "school_admin",
  );
  if (!context.user || !isSchoolAdmin) {
    return { message: "You do not have permission to invite staff to this school." };
  }

  return submitSchoolInvitation(parsed.data);
}

export async function createPlatformSchoolInvitation(
  _previousState: SchoolInvitationState,
  formData: FormData,
): Promise<SchoolInvitationState> {
  const parsed = platformInvitationSchema.safeParse({
    schoolId: formData.get("schoolId"),
    email: formData.get("email"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    employeeNumber: formData.get("employeeNumber"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const context = await getUserContext();
  const isPlatformAdmin = context.platformMemberships.some((membership) => membership.roleKey === "platform_admin");
  if (!context.user || !isPlatformAdmin) {
    return { message: "You do not have permission to establish school access." };
  }

  return submitSchoolInvitation({ ...parsed.data, roleKey: "school_admin" });
}

export async function revokeSchoolStaffInvitation(formData: FormData) {
  const invitationId = z.string().uuid().safeParse(formData.get("invitationId"));
  if (!invitationId.success) return;

  const context = await getUserContext();
  if (!context.user) return;

  const supabase = await createSupabaseServerClient();
  const { data: invitation } = await supabase
    .from("school_invitations")
    .select("school_id")
    .eq("id", invitationId.data)
    .maybeSingle();
  if (!invitation) return;

  const isSchoolAdmin = context.memberships.some(
    (membership) => membership.schoolId === invitation.school_id && membership.roleKey === "school_admin",
  );
  if (!isSchoolAdmin) return;

  await supabase.rpc("revoke_school_invitation", { p_invitation_id: invitationId.data });
  revalidatePath("/school/invitations");
}

export async function revokePlatformSchoolInvitation(formData: FormData) {
  const invitationId = z.string().uuid().safeParse(formData.get("invitationId"));
  if (!invitationId.success) return;

  const context = await getUserContext();
  const isPlatformAdmin = context.platformMemberships.some((membership) => membership.roleKey === "platform_admin");
  if (!context.user || !isPlatformAdmin) return;

  const supabase = await createSupabaseServerClient();
  await supabase.rpc("revoke_school_invitation", { p_invitation_id: invitationId.data });
  revalidatePath("/platform/invitations");
}
