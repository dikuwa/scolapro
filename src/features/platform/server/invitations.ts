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
      tenantName: row.tenants ? relationName(row.tenants, "Tenant") : undefined,
    };
  });
}

/** Platform onboarding: every active school with tenant identity and recent governed invitations. */
export async function getPlatformInvitationAdminData() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Authentication required.");

  const today = new Date().toISOString().slice(0, 10);
  const { data: platformMemberships, error: platformError } = await supabase
    .from("platform_memberships")
    .select("id")
    .eq("user_id", user.id)
    .eq("role_key", "platform_admin")
    .lte("active_from", today)
    .or(`active_to.is.null,active_to.gte.${today}`);

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
 * School administration is bound to one explicit school context. Even users who
 * administer more than one school never receive a cross-school picker on this route.
 */
export async function getSchoolInvitationAdminData(schoolId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Authentication required.");

  const today = new Date().toISOString().slice(0, 10);
  const { data: membership, error: membershipError } = await supabase
    .from("school_memberships")
    .select("school_id")
    .eq("user_id", user.id)
    .eq("school_id", schoolId)
    .eq("role_key", "school_admin")
    .lte("active_from", today)
    .or(`active_to.is.null,active_to.gte.${today}`)
    .maybeSingle();

  if (membershipError) throw new Error("Unable to resolve the school invitation scope.");
  if (!membership) {
    return { schoolOptions: [] as SchoolOption[], invitations: [] as InvitationSummary[] };
  }

  const [{ data: school, error: schoolError }, { data: invitations, error: invitationError }] = await Promise.all([
    supabase
      .from("schools")
      .select("id,name")
      .eq("id", schoolId)
      .eq("status", "active")
      .maybeSingle(),
    supabase
      .from("school_invitations")
      .select("id,email,role_key,status,invited_at,expires_at,schools(name)")
      .eq("school_id", schoolId)
      .order("invited_at", { ascending: false })
      .limit(50),
  ]);

  if (schoolError || invitationError) throw new Error("Unable to load school invitation data.");
  const schoolOptions: SchoolOption[] = school ? [{ id: school.id, name: school.name }] : [];

  return { schoolOptions, invitations: mapInvitations(invitations ?? []) };
}
