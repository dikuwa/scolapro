import { NextResponse } from "next/server";
import { getNavigationAttentionCounts } from "@/features/notifications/server/navigation-attention";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/auth/get-user-context";

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

  // API routes bypass the Next.js page proxy. Verify the shared authority
  // boundary so password-rotation-pending accounts receive no school data.
  try {
    const context = await getUserContext();
    if (!context.user || context.user.id !== verifiedUserId) {
      return NextResponse.json({ counts: {} }, {
        status: 403,
        headers: { "cache-control": "private, no-store" },
      });
    }
  } catch {
    return NextResponse.json({ counts: {} }, {
      status: 403,
      headers: { "cache-control": "private, no-store" },
    });
  }

  const counts = await getNavigationAttentionCounts();
  return NextResponse.json(
    { counts },
    {
      headers: { "cache-control": "private, no-store" },
    },
  );
}
