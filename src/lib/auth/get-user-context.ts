import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SchoolMembershipContext = {
  membershipId: string;
  tenantId: string;
  schoolId: string;
  schoolName: string;
  roleKey: string;
  staffMemberId: string | null;
};

export type PlatformMembershipContext = {
  membershipId: string;
  roleKey: string;
};

export type NetworkMembershipContext = {
  membershipId: string;
  roleKey: string;
};

export type GuardianLinkContext = {
  linkId: string;
  tenantId: string;
  guardianId: string;
};

type UserContextRpcProfile = {
  display_name: string | null;
  preferred_name: string | null;
  avatar_path: string | null;
  must_change_password: boolean | null;
};

type UserContextRpcSchoolMembership = {
  id: string;
  tenant_id: string;
  school_id: string;
  school_name: string | null;
  role_key: string;
  staff_member_id: string | null;
};

type UserContextRpcMembership = {
  id: string;
  role_key: string;
};

type UserContextRpcGuardianLink = {
  link_id: string;
  tenant_id: string;
  guardian_id: string;
};

type UserContextRpcRow = {
  profile: UserContextRpcProfile | null;
  school_memberships: UserContextRpcSchoolMembership[] | null;
  platform_memberships: UserContextRpcMembership[] | null;
  network_memberships: UserContextRpcMembership[] | null;
  guardian_links: UserContextRpcGuardianLink[] | null;
};

const primarySchoolRolePriority = [
  "school_admin",
  "principal",
  "deputy_principal",
  "hod",
  "counsellor",
  "class_teacher",
  "teacher",
  "librarian",
  "ltsm",
  "learner_support",
  "social_worker",
  "exam_officer",
  "emis_officer",
  "board_member",
  "learner",
] as const;

function primarySchoolMembership(memberships: SchoolMembershipContext[]) {
  if (!memberships.length) return null;
  const rank = new Map<string, number>(primarySchoolRolePriority.map((role, index) => [role, index]));
  return memberships.reduce((best, candidate) => {
    const bestRank = rank.get(best.roleKey) ?? Number.MAX_SAFE_INTEGER;
    const candidateRank = rank.get(candidate.roleKey) ?? Number.MAX_SAFE_INTEGER;
    return candidateRank < bestRank ? candidate : best;
  });
}

export const getUserContext = cache(async () => {
  const supabase = await createSupabaseServerClient();
  // The request proxy has already verified the access-token claims. Verify
  // them again here, then ask Auth for the user object rather than trusting
  // user metadata read directly from the session cookie.
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const verifiedUserId = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;
  const {
    data: { user },
    error: userError,
  } = verifiedUserId ? await supabase.auth.getUser() : { data: { user: null }, error: null };

  if (claimsError || userError || !verifiedUserId || !user || user.id !== verifiedUserId) {
    return {
      user: null,
      displayName: null,
      avatarPath: null,
      mustChangePassword: false,
      memberships: [] as SchoolMembershipContext[],
      allSchoolMemberships: [] as SchoolMembershipContext[],
      currentSchoolMembership: null as SchoolMembershipContext | null,
      platformMemberships: [] as PlatformMembershipContext[],
      networkMemberships: [] as NetworkMembershipContext[],
      guardianLinks: [] as GuardianLinkContext[],
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const contextResult = await supabase.rpc("get_my_user_context", { p_as_of_date: today });
  if (contextResult.error) {
    console.error(
      "get_my_user_context RPC failed:",
      contextResult.error.message,
      contextResult.error.details,
      contextResult.error.hint,
    );
    throw new Error("Unable to resolve the current user context.");
  }

  const rpcRow = ((contextResult.data ?? [])[0] ?? null) as UserContextRpcRow | null;
  // This context is consumed by server actions and API handlers as well as
  // pages. Do not expose role authority to an account awaiting mandatory
  // password rotation, even on routes excluded from the request proxy.
  if (!rpcRow?.profile || rpcRow.profile.must_change_password === true) {
    throw new Error("Password rotation required before accessing school authority.");
  }

  const guardianLinks: GuardianLinkContext[] = (rpcRow?.guardian_links ?? []).map((link) => ({
    linkId: link.link_id,
    tenantId: link.tenant_id,
    guardianId: link.guardian_id,
  }));

  const allSchoolMemberships: SchoolMembershipContext[] = (rpcRow?.school_memberships ?? []).map((membership) => ({
    membershipId: membership.id,
    tenantId: membership.tenant_id,
    schoolId: membership.school_id,
    schoolName: membership.school_name ?? "School",
    roleKey: membership.role_key,
    staffMemberId: membership.staff_member_id,
  }));
  const currentSchoolId = allSchoolMemberships[0]?.schoolId ?? null;
  const memberships = currentSchoolId
    ? allSchoolMemberships.filter((membership) => membership.schoolId === currentSchoolId)
    : [];
  const currentSchoolMembership = primarySchoolMembership(memberships);

  const platformMemberships: PlatformMembershipContext[] = (rpcRow?.platform_memberships ?? []).map((membership) => ({
    membershipId: membership.id,
    roleKey: membership.role_key,
  }));

  const networkMemberships: NetworkMembershipContext[] = (rpcRow?.network_memberships ?? []).map((membership) => ({
    membershipId: membership.id,
    roleKey: membership.role_key,
  }));

  const profile = rpcRow?.profile ?? null;
  const displayName =
    profile?.preferred_name ||
    profile?.display_name ||
    user.user_metadata?.preferred_name ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "User";

  return {
    user,
    displayName,
    avatarPath: profile?.avatar_path ?? null,
    mustChangePassword: profile?.must_change_password ?? false,
    memberships,
    allSchoolMemberships,
    currentSchoolMembership,
    platformMemberships,
    networkMemberships,
    guardianLinks,
  };
});
