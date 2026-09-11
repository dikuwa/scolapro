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

type GuardianLinkRpcRow = {
  link_id: string;
  tenant_id: string;
  guardian_id: string;
};

export const getUserContext = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      user: null,
      displayName: null,
      avatarPath: null,
      mustChangePassword: false,
      memberships: [] as SchoolMembershipContext[],
      currentSchoolMembership: null as SchoolMembershipContext | null,
      platformMemberships: [] as PlatformMembershipContext[],
      networkMemberships: [] as NetworkMembershipContext[],
      guardianLinks: [] as GuardianLinkContext[],
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const [profileResult, membershipResult, platformResult, networkResult, guardianResult] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("display_name, preferred_name, avatar_path, must_change_password")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("school_memberships")
      .select("id, tenant_id, school_id, role_key, staff_member_id, schools!inner(name)")
      .eq("user_id", user.id)
      .lte("active_from", today)
      .or(`active_to.is.null,active_to.gte.${today}`)
      .order("active_from", { ascending: false })
      .order("id"),
    supabase
      .from("platform_memberships")
      .select("id, role_key")
      .eq("user_id", user.id)
      .lte("active_from", today)
      .or(`active_to.is.null,active_to.gte.${today}`),
    supabase
      .from("education_network_memberships")
      .select("id, role_key")
      .eq("user_id", user.id)
      .lte("active_from", today)
      .or(`active_to.is.null,active_to.gte.${today}`)
      .order("active_from", { ascending: false })
      .order("id"),
    supabase.rpc("get_my_guardian_links"),
  ]);

  if (membershipResult.error) {
    console.error("school_memberships query failed:", membershipResult.error.message, membershipResult.error.details, membershipResult.error.hint);
    throw new Error("Unable to resolve the current school context.");
  }
  if (platformResult.error) throw new Error("Unable to resolve the current platform context.");
  if (networkResult.error) throw new Error("Unable to resolve the current education-network context.");

  const guardianRows = (guardianResult.data ?? []) as GuardianLinkRpcRow[];
  const guardianLinks: GuardianLinkContext[] = guardianResult.error
    ? []
    : guardianRows.map((link) => ({
        linkId: link.link_id,
        tenantId: link.tenant_id,
        guardianId: link.guardian_id,
      }));

  const memberships: SchoolMembershipContext[] = (membershipResult.data ?? []).map((membership) => {
    const school = Array.isArray(membership.schools) ? membership.schools[0] : membership.schools;
    return {
      membershipId: membership.id,
      tenantId: membership.tenant_id,
      schoolId: membership.school_id,
      schoolName: school?.name ?? "School",
      roleKey: membership.role_key,
      staffMemberId: membership.staff_member_id,
    };
  });
  const currentSchoolMembership = memberships[0] ?? null;

  const platformMemberships: PlatformMembershipContext[] = (platformResult.data ?? []).map((membership) => ({
    membershipId: membership.id,
    roleKey: membership.role_key,
  }));

  const networkMemberships: NetworkMembershipContext[] = (networkResult.data ?? []).map((membership) => ({
    membershipId: membership.id,
    roleKey: membership.role_key,
  }));

  const profile = profileResult.data;
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
    currentSchoolMembership,
    platformMemberships,
    networkMemberships,
    guardianLinks,
  };
});
