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

export const getUserContext = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { user: null, memberships: [] as SchoolMembershipContext[] };
  }

  const { data, error } = await supabase
    .from("school_memberships")
    .select("id, tenant_id, school_id, role_key, staff_member_id, schools!inner(name)")
    .eq("user_id", user.id)
    .lte("active_from", new Date().toISOString().slice(0, 10))
    .or(`active_to.is.null,active_to.gte.${new Date().toISOString().slice(0, 10)}`);

  if (error) {
    throw new Error("Unable to resolve the current school context.");
  }

  const memberships: SchoolMembershipContext[] = (data ?? []).map((membership) => {
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

  return { user, memberships };
});
