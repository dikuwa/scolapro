"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const role = z.enum([
  "school_admin", "principal", "deputy_principal", "hod", "teacher",
  "class_teacher", "counsellor", "social_worker", "librarian", "board_member",
]);

export type StaffAccessState = {
  success?: boolean;
  message?: string;
  invitationToken?: string;
  expiresAt?: string;
  fieldErrors?: Record<string, string[]>;
};

const invitationSchema = z.object({
  schoolId: z.string().uuid(),
  staffMemberId: z.string().uuid(),
  email: z.string().trim().email("Enter a valid login email."),
  roleKey: role,
});

export async function inviteExistingStaff(
  _previous: StaffAccessState,
  formData: FormData,
): Promise<StaffAccessState> {
  const parsed = invitationSchema.safeParse({
    schoolId: formData.get("schoolId"),
    staffMemberId: formData.get("staffMemberId"),
    email: formData.get("email"),
    roleKey: formData.get("roleKey"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_staff_access_invitation", {
    p_school_id: parsed.data.schoolId,
    p_staff_member_id: parsed.data.staffMemberId,
    p_email: parsed.data.email,
    p_role_key: parsed.data.roleKey,
  });
  if (error) return { message: error.message || "The staff invitation could not be created." };
  const result = Array.isArray(data) ? data[0] : data;
  revalidatePath("/staff");
  revalidatePath("/school/invitations");
  return {
    success: true,
    message: "Invitation created. Share the secure join link with the staff member.",
    invitationToken: result?.invitation_token,
    expiresAt: result?.expires_at,
  };
}

export async function resendExistingStaffInvitation(
  _previous: StaffAccessState,
  formData: FormData,
): Promise<StaffAccessState> {
  const invitationId = z.string().uuid().safeParse(formData.get("invitationId"));
  if (!invitationId.success) return { message: "The invitation could not be resent." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("resend_staff_access_invitation", {
    p_invitation_id: invitationId.data,
  });
  if (error) return { message: error.message || "The invitation could not be resent." };
  const result = Array.isArray(data) ? data[0] : data;
  revalidatePath("/staff");
  revalidatePath("/school/invitations");
  return {
    success: true,
    message: "Invitation resent. Share the new secure join link.",
    invitationToken: result?.invitation_token,
    expiresAt: result?.expires_at,
  };
}

const roleFormSchema = z.object({
  schoolId: z.string().uuid(),
  staffMemberId: z.string().uuid(),
  roleKey: role,
});

export async function addStaffRole(
  _previous: StaffAccessState,
  formData: FormData,
): Promise<StaffAccessState> {
  const parsed = roleFormSchema.safeParse({
    schoolId: formData.get("schoolId"),
    staffMemberId: formData.get("staffMemberId"),
    roleKey: formData.get("roleKey"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("add_staff_school_role", {
    p_school_id: parsed.data.schoolId,
    p_staff_member_id: parsed.data.staffMemberId,
    p_role_key: parsed.data.roleKey,
  });
  if (error) return { message: error.message || "The school role could not be added." };
  revalidatePath("/staff");
  return { success: true, message: "School role added." };
}

const endRoleSchema = z.object({
  schoolId: z.string().uuid(),
  membershipId: z.string().uuid(),
});

export async function endStaffRole(formData: FormData): Promise<StaffAccessState> {
  const parsed = endRoleSchema.safeParse({
    schoolId: formData.get("schoolId"),
    membershipId: formData.get("membershipId"),
  });
  if (!parsed.success) return { message: "The school role could not be ended." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("end_staff_school_role", {
    p_school_id: parsed.data.schoolId,
    p_membership_id: parsed.data.membershipId,
  });
  if (error) return { message: error.message || "The school role could not be ended." };
  revalidatePath("/staff");
  return { success: true, message: "School role ended. Its history remains available." };
}

const userSchema = z.object({ schoolId: z.string().uuid(), staffMemberId: z.string().uuid() });

async function linkedAuthEmail(schoolId: string, staffMemberId: string) {
  const context = await (await import("@/lib/auth/get-user-context")).getUserContext();
  if (!context.user || !context.memberships.some((item) => item.schoolId === schoolId && item.roleKey === "school_admin")) {
    throw new Error("Permission denied.");
  }
  const supabase = await createSupabaseServerClient();
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const admin = createSupabaseAdminClient();
  const { data: staff, error } = await admin
    .from("staff_members")
    .select("user_id")
    .eq("id", staffMemberId)
    .maybeSingle();
  if (error || !staff?.user_id) throw new Error("No linked account exists.");
  // The Auth account remains the source of truth for login email. This query is
  // performed only to send a provider-managed email; the address is never returned.
  const { data: user, error: userError } = await admin.auth.admin.getUserById(staff.user_id);
  if (userError || !user.user?.email) throw new Error("The linked account email could not be resolved.");
  return { supabase, email: user.user.email };
}

export async function sendStaffPasswordReset(_previous: StaffAccessState, formData: FormData): Promise<StaffAccessState> {
  const parsed = userSchema.safeParse({ schoolId: formData.get("schoolId"), staffMemberId: formData.get("staffMemberId") });
  if (!parsed.success) return { message: "The password reset email could not be sent." };
  try {
    const { supabase, email } = await linkedAuthEmail(parsed.data.schoolId, parsed.data.staffMemberId);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) return { message: "The password reset email could not be sent." };
    return { success: true, message: "Password reset email sent. The staff member controls the password." };
  } catch {
    return { message: "The password reset email could not be sent." };
  }
}

export async function sendStaffVerification(_previous: StaffAccessState, formData: FormData): Promise<StaffAccessState> {
  const parsed = userSchema.safeParse({ schoolId: formData.get("schoolId"), staffMemberId: formData.get("staffMemberId") });
  if (!parsed.success) return { message: "The verification email could not be sent." };
  try {
    const { supabase, email } = await linkedAuthEmail(parsed.data.schoolId, parsed.data.staffMemberId);
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) return { message: "The verification email could not be sent." };
    return { success: true, message: "Verification email sent." };
  } catch {
    return { message: "The verification email could not be sent." };
  }
}

const correctionSchema = z.object({
  schoolId: z.string().uuid(),
  staffMemberId: z.string().uuid(),
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  employeeNumber: z.string().trim().min(1).max(80),
  positionTitle: z.string().trim().max(160),
  reason: z.string().trim().max(500),
});

export async function correctStaffDetails(
  _previous: StaffAccessState,
  formData: FormData,
): Promise<StaffAccessState> {
  const parsed = correctionSchema.safeParse({
    schoolId: formData.get("schoolId"),
    staffMemberId: formData.get("staffMemberId"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    employeeNumber: formData.get("employeeNumber"),
    positionTitle: formData.get("positionTitle") ?? "",
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("correct_staff_details", {
    p_school_id: parsed.data.schoolId,
    p_staff_member_id: parsed.data.staffMemberId,
    p_first_name: parsed.data.firstName,
    p_last_name: parsed.data.lastName,
    p_employee_number: parsed.data.employeeNumber,
    p_position_title: parsed.data.positionTitle || null,
    p_source: "staff_directory",
    p_reason: parsed.data.reason || null,
  });
  if (error) return { message: error.message || "The staff correction could not be saved." };
  revalidatePath("/staff");
  return { success: true, message: "Staff details corrected and audited. Login email and password were unchanged." };
}

const reconciliationSchema = z.object({
  schoolId: z.string().uuid(),
  canonicalStaffMemberId: z.string().uuid(),
  duplicateStaffMemberId: z.string().uuid(),
  confirmation: z.literal("RECONCILE"),
  reason: z.string().trim().max(500),
});

export async function reconcileStaffIdentities(
  _previous: StaffAccessState,
  formData: FormData,
): Promise<StaffAccessState> {
  const parsed = reconciliationSchema.safeParse({
    schoolId: formData.get("schoolId"),
    canonicalStaffMemberId: formData.get("canonicalStaffMemberId"),
    duplicateStaffMemberId: formData.get("duplicateStaffMemberId"),
    confirmation: String(formData.get("confirmation") ?? "").trim().toUpperCase(),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) return { message: "Type RECONCILE and select distinct canonical and duplicate identities." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reconcile_staff_identities", {
    p_school_id: parsed.data.schoolId,
    p_canonical_staff_member_id: parsed.data.canonicalStaffMemberId,
    p_duplicate_staff_member_id: parsed.data.duplicateStaffMemberId,
    p_confirmation: parsed.data.confirmation,
    p_reason: parsed.data.reason || null,
  });
  if (error) return { message: error.message || "The staff identities could not be reconciled." };
  revalidatePath("/staff");
  revalidatePath("/timetable");
  return { success: true, message: "Staff identities reconciled. Historical evidence was retained and the duplicate is now a governed pointer." };
}