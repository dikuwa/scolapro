import { NextResponse } from "next/server";
import { getNavigationAttentionCounts } from "@/features/notifications/server/navigation-attention";
import { getUserContext } from "@/lib/auth/get-user-context";

export async function GET() {
  const context = await getUserContext();
  if (!context.user) {
    return NextResponse.json({ counts: {} }, {
      status: 401,
      headers: { "cache-control": "private, no-store" },
    });
  }

  const membership = context.currentSchoolMembership;
  if (!membership || context.platformMemberships.length) {
    return NextResponse.json({ counts: {} }, {
      headers: { "cache-control": "private, no-store" },
    });
  }

  const counts = await getNavigationAttentionCounts(membership.schoolId, membership.roleKey);
  return NextResponse.json({ counts }, {
    headers: { "cache-control": "private, no-store" },
  });
}
