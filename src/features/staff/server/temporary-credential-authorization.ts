import "server-only";

import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Internal preflight only: this does not create/update Auth users or issue credentials.
// Revalidate authorization again within the atomic database issuance transaction.
export async function authorizeStaffCredentialPreflight(
  schoolId: string,
  staffMemberId: string,
): Promise<{ allowed: true; staffMemberId: string } | { allowed: false }> {
  // Reject malformed identifiers before any privileged lookup.
  if (!z.string().uuid().safeParse(schoolId).success ||
      !z.string().uuid().safeParse(staffMemberId).success) return { allowed: false };
  try {
    const context = await getUserContext();
    if (!context.user || !context.memberships.some(
      (item) => item.schoolId === schoolId && item.roleKey === "school_admin",
    )) return { allowed: false };

    // Use the school-local calendar day for effective-dated placements.
    const schoolDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Windhoek", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("staff_school_assignments")
      .select("staff_member_id")
      .eq("school_id", schoolId)
      .eq("staff_member_id", staffMemberId)
      .lte("effective_from", schoolDate)
      .or(`effective_to.is.null,effective_to.gte.${schoolDate}`)
      .limit(1)
      .maybeSingle();
    if (error || data?.staff_member_id !== staffMemberId) return { allowed: false };
    return { allowed: true, staffMemberId };
  } catch {
    return { allowed: false };
  }
}
