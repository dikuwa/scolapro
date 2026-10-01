import { NextResponse } from "next/server";
import { getNavigationAttentionCounts } from "@/features/notifications/server/navigation-attention";

export async function GET() {
  const counts = await getNavigationAttentionCounts();
  return NextResponse.json({ counts }, {
    headers: { "cache-control": "private, no-store" },
  });
}
