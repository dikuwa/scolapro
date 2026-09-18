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


const platformTenantConfigurationSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().trim().min(2, "Tenant name is required.").max(180),
  status: z.enum(["active", "suspended", "archived"]),
});

const platformSchoolConfigurationSchema = z.object({
  tenantId: z.string().uuid(),
  schoolId: z.string().uuid(),
  name: z.string().trim().min(2, "School name is required.").max(180),
  emisNumber: z.string().trim().max(120).optional(),
  region: z.string().trim().max(160).optional(),
  town: z.string().trim().max(160).optional(),
  status: z.enum(["active", "inactive", "archived"]),
  physicalAddress: z.string().trim().max(500).optional(),
  postalAddress: z.string().trim().max(500).optional(),
  telephone: z.string().trim().max(80).optional(),
  fax: z.string().trim().max(80).optional(),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid school email address.")]).optional(),
  cellphone: z.string().trim().max(80).optional(),
});

const platformNetworkAssignmentSchema = z.object({
  tenantId: z.string().uuid(),
  schoolId: z.string().uuid(),
  regionId: z.string().uuid("Choose a region."),
  circuitId: z.string().uuid("Choose a circuit."),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid effective date."),
});

export type PlatformConfigurationState = {
  success?: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

async function requirePlatformAdmin(): Promise<boolean> {
  const context = await getUserContext();
  return Boolean(
    context.user &&
    context.platformMemberships.some((membership) => membership.roleKey === "platform_admin")
  );
}

export async function updatePlatformTenantConfiguration(
  _previous: PlatformConfigurationState,
  formData: FormData,
): Promise<PlatformConfigurationState> {
  const parsed = platformTenantConfigurationSchema.safeParse({
    tenantId: formData.get("tenantId"),
    name: formData.get("name"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!(await requirePlatformAdmin())) return { message: "Platform administrator authority is required." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_platform_tenant_configuration", {
    p_tenant_id: parsed.data.tenantId,
    p_name: parsed.data.name,
    p_status: parsed.data.status,
  });
  if (error) return { message: "Tenant configuration could not be saved." };

  revalidatePath("/platform/tenants");
  return { success: true, message: "Tenant configuration saved." };
}

export async function updatePlatformSchoolConfiguration(
  _previous: PlatformConfigurationState,
  formData: FormData,
): Promise<PlatformConfigurationState> {
  const parsed = platformSchoolConfigurationSchema.safeParse({
    tenantId: formData.get("tenantId"),
    schoolId: formData.get("schoolId"),
    name: formData.get("name"),
    emisNumber: formData.get("emisNumber") ?? "",
    region: formData.get("region") ?? "",
    town: formData.get("town") ?? "",
    status: formData.get("status"),
    physicalAddress: formData.get("physicalAddress") ?? "",
    postalAddress: formData.get("postalAddress") ?? "",
    telephone: formData.get("telephone") ?? "",
    fax: formData.get("fax") ?? "",
    email: formData.get("email") ?? "",
    cellphone: formData.get("cellphone") ?? "",
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!(await requirePlatformAdmin())) return { message: "Platform administrator authority is required." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_platform_school_configuration", {
    p_tenant_id: parsed.data.tenantId,
    p_school_id: parsed.data.schoolId,
    p_name: parsed.data.name,
    p_emis_number: parsed.data.emisNumber || null,
    p_region: parsed.data.region || null,
    p_town: parsed.data.town || null,
    p_status: parsed.data.status,
    p_physical_address: parsed.data.physicalAddress || null,
    p_postal_address: parsed.data.postalAddress || null,
    p_telephone: parsed.data.telephone || null,
    p_fax: parsed.data.fax || null,
    p_email: parsed.data.email || null,
    p_cellphone: parsed.data.cellphone || null,
  });
  if (error) return { message: "School configuration could not be saved." };

  revalidatePath("/platform/tenants");
  revalidatePath("/school-directory");
  return { success: true, message: "School configuration saved." };
}

export async function updatePlatformSchoolNetworkAssignment(
  _previous: PlatformConfigurationState,
  formData: FormData,
): Promise<PlatformConfigurationState> {
  const parsed = platformNetworkAssignmentSchema.safeParse({
    tenantId: formData.get("tenantId"),
    schoolId: formData.get("schoolId"),
    regionId: formData.get("regionId"),
    circuitId: formData.get("circuitId"),
    effectiveFrom: formData.get("effectiveFrom"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!(await requirePlatformAdmin())) return { message: "Platform administrator authority is required." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("configure_school_network_assignment", {
    p_tenant_id: parsed.data.tenantId,
    p_school_id: parsed.data.schoolId,
    p_region_id: parsed.data.regionId,
    p_circuit_id: parsed.data.circuitId,
    p_effective_from: parsed.data.effectiveFrom,
  });
  if (error) return { message: "School network assignment could not be saved. Check the region, circuit and effective date." };

  revalidatePath("/platform/tenants");
  revalidatePath("/school-directory");
  return { success: true, message: "School network assignment saved." };
}
