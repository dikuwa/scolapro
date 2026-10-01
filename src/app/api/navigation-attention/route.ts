import { NextResponse } from "next/server";
import { getNavigationAttentionCounts } from "@/features/notifications/server/navigation-attention";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const verifiedUserId =
    typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;

  if (claimsError || !verifiedUserId) {
    return NextResponse.json(
      { counts: {} },
      {
        status: 401,
        headers: { "cache-control": "private, no-store" },
      },
    );
  }

  const counts = await getNavigationAttentionCounts();
  return NextResponse.json(
    { counts },
    {
      headers: { "cache-control": "private, no-store" },
    },
  );
}
