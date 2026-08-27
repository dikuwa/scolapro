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

function relationName(value: { name?: string | null }[] | { name?: string | null } | null | undefined, fallback: string) {
  const relation = Array.isArray(value) ? value[0] : value;
  return relation?.name ?? fallback;
}

export async function getInvitationAdminData() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Authentication required.");

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: platformMemberships, error: platformError }, { data: schoolAdminMemberships, error: membershipError }] = await Promise.all([
    supabase
      .from("platform_memberships")
      .select("id")
      .eq("user_id", user.id)
      .eq("role_key", "platform_admin")
      .lte("active_from", today)
      .or(`active_to.is.null,active_to.gte.${today}`),
    supabase
      .from("school_memberships")
      .select("school_id")
      .eq("user_id", user.id)
      .eq("role_key", "school_admin")
      .lte("active_from", today)
      .or(`active_to.is.null,active_to.gte.${today}`),
  ]);

  if (platformError || membershipError) throw new Error("Unable to resolve invitation scope.");

  const isPlatformAdmin = Boolean(platformMemberships?.length);
  const manageableSchoolIds = (schoolAdminMemberships ?? []).map((membership) => membership.school_id);

  let schoolQuery = supabase
    .from("schools")
    .select("id,name,tenants(name)")
    .eq("status", "active")
    .order("name");

  if (!isPlatformAdmin) {
    if (!manageableSchoolIds.length) {
      return { schoolOptions: [] as SchoolOption[], invitations: [] as InvitationSummary[] };
    }
    schoolQuery = schoolQuery.in("id", manageableSchoolIds);
  }

  const [{ data: schools, error: schoolError }, { data: invitations, error: invitationError }] = await Promise.all([
    schoolQuery,
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

  const invitationRows: InvitationSummary[] = (invitations ?? []).map((invitation) => ({
    id: invitation.id,
    email: invitation.email,
    roleKey: invitation.role_key,
    status: invitation.status,
    invitedAt: invitation.invited_at,
    expiresAt: invitation.expires_at,
    schoolName: relationName(invitation.schools, "School"),
    tenantName: relationName(invitation.tenants, "Tenant"),
  }));

  return { schoolOptions, invitations: invitationRows };
}
