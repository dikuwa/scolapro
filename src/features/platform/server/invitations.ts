import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SchoolOption = {
  id: string;
  name: string;
  tenantName: string;
};

export type InvitationSummary = {
  id: string;
  email: string;
  roleKey: string;
  status: string;
  invitedAt: string;
  expiresAt: string;
  schoolName: string;
  tenantName: string;
};

export async function getInvitationAdminData() {
  const supabase = await createSupabaseServerClient();

  const [{ data: schools, error: schoolError }, { data: invitations, error: invitationError }] = await Promise.all([
    supabase
      .from("schools")
      .select("id,name,tenants(name)")
      .eq("status", "active")
      .order("name"),
    supabase
      .from("school_invitations")
      .select("id,email,role_key,status,invited_at,expires_at,schools(name),tenants(name)")
      .order("invited_at", { ascending: false })
      .limit(50),
  ]);

  if (schoolError || invitationError) {
    throw new Error("Unable to load invitation administration data.");
  }

  const schoolOptions: SchoolOption[] = (schools ?? []).map((school) => ({
    id: school.id,
    name: school.name,
    tenantName: school.tenants?.name ?? "Tenant",
  }));

  const invitationRows: InvitationSummary[] = (invitations ?? []).map((invitation) => ({
    id: invitation.id,
    email: invitation.email,
    roleKey: invitation.role_key,
    status: invitation.status,
    invitedAt: invitation.invited_at,
    expiresAt: invitation.expires_at,
    schoolName: invitation.schools?.name ?? "School",
    tenantName: invitation.tenants?.name ?? "Tenant",
  }));

  return { schoolOptions, invitations: invitationRows };
}
