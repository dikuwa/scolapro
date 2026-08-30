import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ batchId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { batchId } = await context.params;
  const userClient = await createSupabaseServerClient();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // RLS on report_card_batches is the authorization boundary: only report-management
  // roles for the batch school (or platform administration) can resolve this row.
  const { data: batch, error } = await userClient
    .from("report_card_batches")
    .select("id,operation,export_status,export_storage_bucket,export_storage_path")
    .eq("id", batchId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Unable to authorize report-card batch" }, { status: 500 });
  if (!batch || batch.operation !== "pdf" || batch.export_status !== "ready") {
    return NextResponse.json({ error: "Combined report PDF is not ready" }, { status: 404 });
  }
  if (batch.export_storage_bucket !== "report-card-artifacts" || !batch.export_storage_path) {
    return NextResponse.json({ error: "Combined report PDF is unavailable" }, { status: 404 });
  }

  const admin = createSupabaseAdminClient();
  const { data: signed, error: signedError } = await admin.storage
    .from("report-card-artifacts")
    .createSignedUrl(batch.export_storage_path, 90);
  if (signedError || !signed?.signedUrl) {
    return NextResponse.json({ error: "Unable to open combined report PDF" }, { status: 500 });
  }

  const response = NextResponse.redirect(signed.signedUrl, 302);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
