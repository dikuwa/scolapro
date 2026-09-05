import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SchoolOption = {
  id: string;
  name: string;
  /** Platform-facing only. School-facing flows must render school identity alone. */
  tenantName?: string;
};

export type InvitationSummary = {
  id: string;
  email: string;
  roleKey: string;
  status: string;
  invitedAt: string;
  expiresAt: string;
  schoolName: string;
  tenantName?: string;
};

function relationName(value: { name?: string | null }[] | { name?: string | null } | null | undefined, fallback: string) {
  const relation = Array.isArray(value) ? value[0] : value;
  return relation?.name ?? fallback;
}

function mapInvitations(invitations: unknown[]): InvitationSummary[] {
  return (invitations ?? []).map((invitation) => {
    const row = invitation as {
      id: string;
      email: string;
      role_key: string;
      status: string;
      invited_at: string;
      expires_at: string;
      schools?: { name?: string | null }[] | { name?: string | null } | null;
      tenants?: { name?: string | null }[] | { name?: string | null } | null;
    };
    return {
      id: row.id,
      email: row.email,
      roleKey: row.role_key,
      status: row.status,
      invitedAt: row.invited_at,
      expiresAt: row.expires_at,
      schoolName: relationName(row.schools, "School"),
      tenantName: relationName(row.tenants, "Tenant"),
    };
  });
}

/**
 * Platform-administration view: every active school with its tenant, plus recent
 * governed invitations. Used by the platform onboarding surface only.
 */
export async function getPlatformInvitationAdminData() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Authentication required.");

  const { data: platformMemberships, error: platformError } = await supabase
    .from("platform_memberships")
    .select("id")
    .eq("user_id", user.id)
    .eq("role_key", "platform_admin")
    .lte("active_from", new Date().toISOString().slice(0, 10))
    .or(`active_to.is.null,active_to.gte.${new Date().toISOString().slice(0, 10)}`);

  if (platformError) throw new Error("Unable to resolve platform invitation scope.");
  if (!platformMemberships?.length) {
    return { schoolOptions: [] as SchoolOption[], invitations: [] as InvitationSummary[] };
  }

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

  if (schoolError || invitationError) throw new Error("Unable to load invitation administration data.");

  const schoolOptions: SchoolOption[] = (schools ?? []).map((school) => ({
    id: school.id,
    name: school.name,
    tenantName: relationName(school.tenants, "Tenant"),
  }));

  return { schoolOptions, invitations: mapInvitations(invitations ?? []) };
}

/**
 * School-administration view: only the schools the signed-in School Admin actually
 * manages, with their governed invitation history. School identity is rendered
 * without any tenant/demo-group context — tenant identity never leaks into ordinary
 * school workflows.
 */
export async function getSchoolInvitationAdminData() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Authentication required.");

  const today = new Date().toISOString().slice(0, 10);
  const { data: memberships, error: membershipError } = await supabase
    .from("school_memberships")
    .select("school_id")
    .eq("user_id", user.id)
    .eq("role_key", "school_admin")
    .lte("active_from", today)
    .or(`active_to.is.null,active_to.gte.${today}`);

  if (membershipError) throw new Error("Unable to resolve the school invitation scope.");

  const schoolIds = (memberships ?? []).map((membership) => membership.school_id);
  if (!schoolIds.length) {
    return { schoolOptions: [] as SchoolOption[], invitations: [] as InvitationSummary[] };
  }

  const [{ data: schools, error: schoolError }, { data: invitations, error: invitationError }] = await Promise.all([
    supabase
      .from("schools")
      .select("id,name")
      .in("id", schoolIds)
      .eq("status", "active")
      .order("name"),
    supabase
      .from("school_invitations")
      .select("id,email,role_key,status,invited_at,expires_at,schools(name)")
      .in("school_id", schoolIds)
      .order("invited_at", { ascending: false })
      .limit(50),
  ]);

  if (schoolError || invitationError) throw new Error("Unable to load school invitation data.");

  const schoolOptions: SchoolOption[] = (schools ?? []).map((school) => ({
    id: school.id,
    name: school.name,
  }));

  return { schoolOptions, invitations: mapInvitations(invitations ?? []) };
}