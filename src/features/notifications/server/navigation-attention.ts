import { getNamibiaDateKey } from "@/lib/namibia-date";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type NavigationAttentionCounts = Partial<Record<string, number>>;

export async function getNavigationAttentionCounts(): Promise<NavigationAttentionCounts> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_my_navigation_attention", {
    p_as_of_date: getNamibiaDateKey(),
  });

  // Attention badges are supplemental shell UI. A failed refresh must never make
  // the whole dashboard unavailable; the queue page itself remains authoritative.
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return {};

  const counts = data as Record<string, unknown>;
  const dataCorrections = Number(counts.data_corrections ?? 0);

  return Number.isFinite(dataCorrections) && dataCorrections > 0
    ? { data_corrections: dataCorrections }
    : {};
}
