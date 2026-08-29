import { createSupabaseServerClient } from "@/lib/supabase/server";

export type NavigationAttentionCounts = Partial<Record<string, number>>;

const dataCorrectionReviewRoles = new Set([
  "school_admin",
  "principal",
  "deputy_principal",
  "counsellor",
]);

export async function getNavigationAttentionCounts(
  schoolId: string,
  roleKey: string,
): Promise<NavigationAttentionCounts> {
  const counts: NavigationAttentionCounts = {};
  if (!dataCorrectionReviewRoles.has(roleKey)) return counts;

  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("profile_change_requests")
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId)
    .eq("status", "pending");

  // Attention badges are supplemental shell UI. A count query must never make the
  // whole dashboard unavailable; the queue page itself remains authoritative.
  if (!error && (count ?? 0) > 0) counts.data_corrections = count ?? 0;
  return counts;
}
